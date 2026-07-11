import re
import sys
import json
import time
import argparse
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from pathlib import Path

from html import unescape as html_unescape
from urllib.parse import urlparse

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / 'data'
GEOCACHE_FILE = BASE_DIR / 'geocache.json'
DEALCACHE_FILE = BASE_DIR / 'dealcache.json'

ALLOWED_URL_SCHEMES = {'http', 'https'}
ALLOWED_URL_HOSTS = {'www.tripper.nl', 'tripper.nl'}


def sanitize_text(text):
    """Strip HTML tags and decode HTML entities. Output is plain text;
    the frontend is responsible for HTML-escaping at render time."""
    if not text:
        return ''
    # Remove any HTML tags that survived BeautifulSoup's get_text()
    clean = re.sub(r'<[^>]+>', '', text)
    # Decode HTML entities (e.g. &#x27; -> ')
    return html_unescape(clean).strip()


def sanitize_url(url):
    """Only allow http(s) URLs pointing to tripper.nl."""
    if not url:
        return ''
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ALLOWED_URL_SCHEMES:
            return ''
        if parsed.hostname not in ALLOWED_URL_HOSTS:
            return ''
        return url
    except Exception:
        return ''


def parse_deals(soup):
    """Parse deal cards from a BeautifulSoup object of the tripper.nl alle-deals page."""
    deals = []
    deal_cards = soup.select('div.deal[data-id]')

    for card in deal_cards:
        deal = {}

        # URL (ensure absolute)
        link = card.select_one('a.deal-link')
        href = link['href'] if link and link.get('href') else ''
        if href and not href.startswith('http'):
            href = 'https://www.tripper.nl' + href
        deal['url'] = sanitize_url(href)

        # Deal name
        h3 = card.select_one('h3')
        deal['name'] = sanitize_text(h3.get_text(strip=True) if h3 else '')

        # Provider
        provider_el = card.select_one('.deal-body .font-normal.text-muted')
        deal['provider'] = sanitize_text(provider_el.get_text(strip=True) if provider_el else '')

        # Location — only take first direct text node, strip everything else
        loc_el = card.select_one('.deal-location')
        if loc_el:
            for child in loc_el.find_all():
                child.decompose()
            raw = loc_el.get_text(strip=True)
            raw = re.sub(r'\(\+.*', '', raw).strip()
            deal['location'] = sanitize_text(raw)
        else:
            deal['location'] = ''

        # Rating
        rating_el = card.select_one('.star-rating small')
        deal['rating'] = sanitize_text(rating_el.get_text(strip=True) if rating_el else '')

        # Discount
        discount_el = card.select_one('.deal-discount')
        discount_text = discount_el.get_text(strip=True) if discount_el else ''
        deal['discount'] = sanitize_text(discount_text)
        m = re.search(r'(\d+)', discount_text)
        deal['discount_num'] = int(m.group(1)) if m else 0

        # Original price (strikethrough)
        orig_el = card.select_one('.text-line-through')
        deal['original_price'] = parse_price(orig_el.get_text(strip=True)) if orig_el else None

        # Discounted price
        price_divs = card.select('.deal-price')
        discounted_price = None
        for div in price_divs:
            if 'from' in div.get('class', []):
                continue
            discounted_price = parse_price(div.get_text(strip=True))
            break
        deal['discounted_price'] = discounted_price

        # Savings
        if deal['original_price'] is not None and deal['discounted_price'] is not None:
            deal['savings'] = round(deal['original_price'] - deal['discounted_price'], 2)
        else:
            deal['savings'] = None

        deals.append(deal)

    return deals


def parse_price(text):
    text = text.replace('\u20ac', '').replace('EUR', '').strip()
    match = re.search(r'(\d+)[,.](\d{2})\b', text)
    if match:
        return float(f"{match.group(1)}.{match.group(2)}")
    match = re.search(r'(\d+)', text)
    if match:
        return float(match.group(1))
    return None


def fetch_live(url="https://www.tripper.nl/alle-deals"):
    import requests
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                       '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    }
    print(f"Fetching {url} ...")
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    print(f"Received {len(response.content):,} bytes")
    return BeautifulSoup(response.content, 'html.parser')


def load_local(path):
    path = Path(path)
    if not path.exists():
        print(f"Error: file not found: {path}")
        sys.exit(1)
    print(f"Loading {path} ...")
    with open(path, 'r', encoding='utf-8') as f:
        return BeautifulSoup(f.read(), 'html.parser')


# ---------------------------------------------------------------------------
# Per-deal coordinate cache (scraped from each deal's detail page)
# ---------------------------------------------------------------------------

# Tripper renders a Vue component on each deal page like:
#   <deal-map :locations="[{'Latitude':49.42396,'Longitude':1.983676,
#                          'Description':'Parc Saint Paul, Rue de l\u0027Avelon 47, Saint-Paul'}]" ...>
# This gives the *exact* venue coordinates (not a city centroid), which is
# much more accurate than geocoding the city name.
_DEAL_COORDS_RE = re.compile(
    r"'Latitude'\s*:\s*(-?\d+(?:\.\d+)?)"
    r"\s*,\s*'Longitude'\s*:\s*(-?\d+(?:\.\d+)?)"
    r"(?:\s*,\s*'Description'\s*:\s*'((?:\\'|[^'])*)')?",
    re.IGNORECASE,
)

# Matches review-count text like "440 beoordelingen" or "1.234 beoordelingen"
_REVIEW_COUNT_RE = re.compile(r'([\d][.\d]*)\s*beoordelingen', re.IGNORECASE)


def load_dealcache():
    if DEALCACHE_FILE.exists():
        with open(DEALCACHE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_dealcache(cache):
    with open(DEALCACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def fetch_deal_coords(url, session):
    """Fetch a single deal page and extract every (lat, lng, address) tuple
    from the deal-map component. Some deals (e.g. multi-location passes,
    chains) expose hundreds of locations. Returns a dict with:
        {'lat': float, 'lng': float, 'address': str,        # first location
         'locations': [{'lat','lng','address'}, ...],        # all locations
         'image_url': str,                                   # og:image from detail page
         'review_count': int | None}                        # number of ratings
    or None if no coordinates could be parsed."""
    try:
        r = session.get(url, timeout=15)
        r.raise_for_status()
    except Exception as e:
        print(f"  Failed to fetch {url}: {e}")
        return None

    # Parse coordinates from the raw text (Vue component attribute)
    locations = []
    for m in _DEAL_COORDS_RE.finditer(r.text):
        try:
            lat = float(m.group(1))
            lng = float(m.group(2))
        except ValueError:
            continue
        address = ''
        if m.group(3):
            try:
                # The description is in a single-quoted JS string that may contain
                # \uXXXX escapes. Replace escaped apostrophes first, then parse
                # as a JSON string to correctly decode all \u escapes without
                # corrupting characters that are already valid UTF-8.
                raw = m.group(3).replace("\\'", "'")
                address = json.loads(f'"{raw}"')
            except Exception:
                address = m.group(3).replace("\\'", "'")
        locations.append({'lat': lat, 'lng': lng, 'address': address})

    # Use BeautifulSoup for structured extraction of image + review count
    soup = BeautifulSoup(r.content, 'html.parser')

    # Product image — prefer tripper's own og:image for the deal
    image_url = ''
    og_img = soup.select_one('meta[property="og:image"]')
    if og_img and og_img.get('content'):
        image_url = og_img['content']

    # Review count — look for "NNN beoordelingen" pattern in page text
    review_count = None
    rc_m = _REVIEW_COUNT_RE.search(r.text)
    if rc_m:
        try:
            review_count = int(rc_m.group(1).replace('.', ''))
        except ValueError:
            pass

    if not locations:
        # No coords but we may still have image/review data — return a partial entry
        if image_url or review_count is not None:
            return {
                'lat': None, 'lng': None, 'address': '',
                'locations': [],
                'image_url': image_url,
                'review_count': review_count,
            }
        return None

    first = locations[0]
    return {
        'lat': first['lat'],
        'lng': first['lng'],
        'address': first['address'],
        'locations': locations,
        'image_url': image_url,
        'review_count': review_count,
    }


def enrich_deals_with_detail_coords(deals, force=False):
    """For each deal whose URL is not yet cached, fetch its detail page and
    extract precise coordinates. Cached deals are reused (no HTTP request).
    Set force=True to re-fetch every deal (used for one-shot backfill).

    Returns the number of deals successfully resolved (cache hits + new fetches)."""
    import requests

    cache = load_dealcache()
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    })

    urls = [d['url'] for d in deals if d.get('url')]
    # Re-fetch if: not in cache, OR cached as None (failed fetch) and older than 7 days
    # Cache entries store fetched_at timestamp; None entries are retried after a week.
    now_ts = datetime.now(timezone.utc).isoformat()
    def _needs_fetch(u):
        if force:
            return True
        entry = cache.get(u)
        if entry is None and u not in cache:
            return True  # not cached at all
        if entry is None:
            # Cached as None (failed) — check if the sentinel timestamp allows retry
            ts = cache.get(u + '.__ts')
            if ts:
                try:
                    age_days = (datetime.utcnow() - datetime.fromisoformat(ts)).days
                    return age_days >= 7
                except Exception:
                    return True
            return True  # No timestamp → retry
        return False
    to_fetch = [u for u in urls if _needs_fetch(u)]

    if to_fetch:
        print(f"Fetching detail pages for {len(to_fetch)} deal(s) "
              f"({len(urls) - len(to_fetch)} cached)...")
        for i, url in enumerate(to_fetch):
            coords = fetch_deal_coords(url, session)
            if coords is None:
                # Store None but record when we tried, so we can retry after 7 days
                cache[url] = None
                cache[url + '.__ts'] = now_ts
            else:
                cache[url] = coords
            if (i + 1) % 10 == 0:
                print(f"  Fetched {i + 1}/{len(to_fetch)}...")
                save_dealcache(cache)  # periodic flush so progress isn't lost
            time.sleep(0.5)  # politeness
        save_dealcache(cache)
        print(f"Detail-page cache now has {len(cache)} entries.")
    else:
        print(f"All {len(urls)} deal URLs already in detail-page cache.")

    resolved = 0
    for d in deals:
        coords = cache.get(d.get('url'))
        if coords:
            if coords.get('lat') is not None:
                d['lat'] = coords['lat']
                d['lng'] = coords['lng']
                if coords.get('address'):
                    d['address'] = coords['address']
                # New cache entries carry every location; older ones only carried
                # the first. Synthesise a single-element list in that case so the
                # frontend always sees a consistent shape.
                locs = coords.get('locations')
                if not locs:
                    locs = [{'lat': coords['lat'], 'lng': coords['lng'],
                             'address': coords.get('address', '')}]
                d['locations'] = locs
                resolved += 1
            # Copy supplemental meta fields regardless of whether coords exist
            if coords.get('image_url'):
                d['image_url'] = coords['image_url']
            if coords.get('review_count') is not None:
                d['review_count'] = coords['review_count']

    print(f"Resolved precise coords for {resolved}/{len(deals)} deals from detail pages.")
    return resolved


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------

def load_geocache():
    if GEOCACHE_FILE.exists():
        with open(GEOCACHE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_geocache(cache):
    with open(GEOCACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def geocode_locations(deals):
    import requests

    cache = load_geocache()
    unique_locs = set(d['location'] for d in deals if d['location'])
    to_geocode = [loc for loc in unique_locs if loc not in cache]

    if to_geocode:
        print(f"Geocoding {len(to_geocode)} new locations ({len(unique_locs) - len(to_geocode)} cached)...")
        session = requests.Session()
        session.headers.update({'User-Agent': 'TripperDealsScraper/1.0'})

        # Tripper covers NL primarily, with some BE/DE/FR/LU/AT/CH/ES/IT/GB deals.
        # Restricting Nominatim to these prevents far-away false matches
        # (e.g. "Saint-Paul" resolving to Saint Paul, Minnesota).
        eu_countries = 'nl,be,de,fr,lu,at,ch,es,it,gb,dk'

        for i, loc in enumerate(to_geocode):
            try:
                # First try: bias to NL (most deals are Dutch).
                r = session.get(
                    'https://nominatim.openstreetmap.org/search',
                    params={'q': loc, 'format': 'json', 'limit': 1,
                            'countrycodes': 'nl'},
                    timeout=10,
                )
                results = r.json()
                if results:
                    cache[loc] = {'lat': float(results[0]['lat']), 'lng': float(results[0]['lon'])}
                else:
                    # Fallback: search across the European countries Tripper sells in.
                    r2 = session.get(
                        'https://nominatim.openstreetmap.org/search',
                        params={'q': loc, 'format': 'json', 'limit': 1,
                                'countrycodes': eu_countries},
                        timeout=10,
                    )
                    results2 = r2.json()
                    if results2:
                        cache[loc] = {'lat': float(results2[0]['lat']), 'lng': float(results2[0]['lon'])}
                    else:
                        cache[loc] = None
            except Exception as e:
                print(f"  Failed to geocode '{loc}': {e}")
                cache[loc] = None

            if (i + 1) % 10 == 0:
                print(f"  Geocoded {i + 1}/{len(to_geocode)}...")
            time.sleep(1)

        save_geocache(cache)
        print(f"Geocoding complete. Cache now has {len(cache)} entries.")
    else:
        print(f"All {len(unique_locs)} locations already in cache.")

    mapped = 0
    for d in deals:
        coords = cache.get(d['location'])
        if coords:
            d['lat'] = coords['lat']
            d['lng'] = coords['lng']
            mapped += 1
        else:
            d['lat'] = None
            d['lng'] = None

    print(f"Mapped {mapped}/{len(deals)} deals to coordinates.")


# ---------------------------------------------------------------------------
# Data output
# ---------------------------------------------------------------------------

def snapshot_path(date_str):
    """Return the datalake-style path for a YYYY-MM-DD snapshot."""
    year, month, day = date_str.split('-')
    return DATA_DIR / year / month / f"{day}.json"


_GEO_FIELDS = {'lat', 'lng', 'address', 'locations', 'image_url', 'review_count'}


def _strip_geo(deal: dict) -> dict:
    """Return a copy of deal without geo/image fields (stored in dealcache.json)."""
    return {k: v for k, v in deal.items() if k not in _GEO_FIELDS}


def save_daily_json(deals, date_str):
    """Save deals as data/YYYY/MM/DD.json and update data/index.json manifest.

    Geo and image fields (lat, lng, address, locations, image_url, review_count)
    are omitted from the stored snapshot — they live in dealcache.json.
    The build step re-merges them from dealcache before deploying to dist/.
    """
    DATA_DIR.mkdir(exist_ok=True)

    # Save deal data (price/metadata only — no geo/image redundancy)
    lean_deals = [_strip_geo(d) for d in deals]
    data_file = snapshot_path(date_str)
    data_file.parent.mkdir(parents=True, exist_ok=True)
    with open(data_file, 'w', encoding='utf-8') as f:
        json.dump(lean_deals, f, ensure_ascii=False)
    print(f"Saved {len(lean_deals)} deals to {data_file} (geo fields in dealcache)")

    # Update manifest
    manifest_file = DATA_DIR / 'index.json'
    if manifest_file.exists():
        with open(manifest_file, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
    else:
        manifest = []

    if date_str not in manifest:
        manifest.append(date_str)
    manifest.sort(reverse=True)

    with open(manifest_file, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print(f"Manifest updated: {len(manifest)} date(s)")


def _backfill_meta():
    """Re-visit every cached deal URL to add image_url and review_count.
    Only fetches URLs that are missing at least one of those fields."""
    import requests

    cache = load_dealcache()
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    })

    to_fetch = [
        url for url, entry in cache.items()
        if not url.endswith('.__ts')
        and entry is not None and isinstance(entry, dict)
        and ('image_url' not in entry or 'review_count' not in entry)
    ]
    print(f"Backfilling meta for {len(to_fetch)}/{len(cache)} cached deals...")

    for i, url in enumerate(to_fetch):
        result = fetch_deal_coords(url, session)
        if result is not None:
            # Merge new fields into existing cache entry
            existing = cache[url] or {}
            existing['image_url'] = result.get('image_url', existing.get('image_url', ''))
            existing['review_count'] = result.get('review_count', existing.get('review_count'))
            cache[url] = existing
        else:
            # Page failed — mark as attempted so we skip next time
            if cache[url] is not None:
                cache[url].setdefault('image_url', '')
                cache[url].setdefault('review_count', None)

        if (i + 1) % 10 == 0:
            print(f"  {i + 1}/{len(to_fetch)}...")
            save_dealcache(cache)
        time.sleep(0.5)

    save_dealcache(cache)
    print(f"Backfill complete. {len(cache)} entries in cache.")


def main():
    parser = argparse.ArgumentParser(description='Scrape deals from tripper.nl')
    parser.add_argument('--file', '-f', type=str, help='Path to a locally saved HTML file')
    parser.add_argument('--date', '-d', type=str, help='Date label (default: today, YYYY-MM-DD)')
    parser.add_argument('--no-geocode', action='store_true', help='Skip geocoding')
    parser.add_argument('--backfill-meta', action='store_true',
                        help='Re-fetch all cached deal pages to populate image_url and review_count')
    args = parser.parse_args()

    # Backfill mode: re-visit all cached URLs to pick up image_url + review_count
    if args.backfill_meta:
        _backfill_meta()
        return

    # Load page
    if args.file:
        soup = load_local(args.file)
        source = args.file
    else:
        soup = fetch_live()
        source = "tripper.nl (live)"

    # Parse
    deals = parse_deals(soup)
    print(f"Extracted {len(deals)} deals from {source}")

    if not deals:
        print("No deals found.")
        return

    # Geocode
    if not args.no_geocode:
        # 1. Try precise per-deal coords from each deal's detail page
        #    (cached by URL — only new deals trigger an HTTP request).
        enrich_deals_with_detail_coords(deals)
        # 2. Fall back to city-level Nominatim for deals that didn't resolve.
        unresolved = [d for d in deals if d.get('lat') is None]
        if unresolved:
            print(f"Falling back to city-level geocoding for {len(unresolved)} deal(s)...")
            geocode_locations(unresolved)

    # Save
    date_str = args.date or datetime.now().strftime('%Y-%m-%d')
    save_daily_json(deals, date_str)


if __name__ == "__main__":
    main()
