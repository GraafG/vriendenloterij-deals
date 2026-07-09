import argparse
import json
import re
from datetime import datetime
from html import unescape as html_unescape
from pathlib import Path
from urllib.parse import urlparse

import requests

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / 'data'

ALGOLIA_APP_ID = 'HNZAP94T5G'
ALGOLIA_API_KEY = '3e9048b5fbba8f0dd8a3ba8b2a541e6c'
ALGOLIA_INDEX = 'stories_vl_prod_recently_added'
ALGOLIA_URL = f'https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/{ALGOLIA_INDEX}/query'
SITE_ORIGIN = 'https://www.vriendenloterij.nl'
ALLOWED_URL_HOSTS = {'www.vriendenloterij.nl', 'vriendenloterij.nl'}


def sanitize_text(text):
    if not text:
        return ''
    clean = re.sub(r'<[^>]+>', '', str(text))
    return html_unescape(clean).strip()


def sanitize_url(url):
    if not url:
        return ''
    try:
        parsed = urlparse(url)
        if parsed.scheme not in {'http', 'https'}:
            return ''
        if parsed.hostname not in ALLOWED_URL_HOSTS:
            return ''
        return url
    except Exception:
        return ''


def story_url(slug):
    slug = (slug or '').lstrip('/')
    if slug.startswith('groupwebsite-vl/'):
        slug = slug.removeprefix('groupwebsite-vl/')
    return sanitize_url(f'{SITE_ORIGIN}/{slug}')


def normalize_location(loc):
    coords = loc.get('coordinates') or {}
    lat = parse_coordinate(coords.get('lat') or coords.get('latitude') or loc.get('lat') or loc.get('latitude'))
    lng = parse_coordinate(coords.get('lng') or coords.get('lon') or coords.get('longitude') or loc.get('lng') or loc.get('lon') or loc.get('longitude'))
    address_parts = [
        loc.get('street'),
        loc.get('houseNumber'),
        loc.get('postalCode'),
        loc.get('city'),
    ]
    address = ' '.join(sanitize_text(p) for p in address_parts if sanitize_text(p))
    result = {
        'name': sanitize_text(loc.get('locationName')),
        'city': sanitize_text(loc.get('city')),
        'province': sanitize_text(loc.get('province')),
        'address': address,
        'lat': lat,
        'lng': lng,
    }
    links = loc.get('websiteCtaLink') or []
    if links and isinstance(links, list):
        first = links[0] or {}
        result['website'] = first.get('link') or ''
    return result


def parse_coordinate(value):
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(',', '.').strip())
        except ValueError:
            return None
    return None


def normalize_hit(hit):
    locations = [
        normalize_location(loc)
        for loc in hit.get('locations') or []
        if isinstance(loc, dict)
    ]
    primary_location = next((loc for loc in locations if loc.get('city')), None)
    image = hit.get('images') or {}
    offers = [sanitize_text(x) for x in hit.get('offers') or [] if sanitize_text(x)]
    offer_enums = [sanitize_text(x) for x in hit.get('offerEnumValues') or [] if sanitize_text(x)]
    categories = [sanitize_text(x) for x in hit.get('categories') or [] if sanitize_text(x)]
    types = [sanitize_text(x) for x in hit.get('types') or [] if sanitize_text(x)]
    url = story_url(hit.get('slug'))

    deal = {
        'id': sanitize_text(hit.get('objectID')),
        'url': url,
        'name': sanitize_text(hit.get('header')),
        'description': sanitize_text(hit.get('text')),
        'label': sanitize_text(hit.get('label')),
        'offers': offers,
        'offer_enums': offer_enums,
        'categories': categories,
        'types': types,
        'topic': sanitize_text(hit.get('topic')),
        'location': primary_location.get('city') if primary_location else '',
        'provider': primary_location.get('name') if primary_location else '',
        'start_date': sanitize_text(hit.get('startDate')),
        'end_date': sanitize_text(hit.get('endDate')),
        'start_ts': hit.get('startDateUnixTimestamp') or 0,
        'end_ts': hit.get('endDateUnixTimestamp') or 0,
        'last_updated': sanitize_text(hit.get('last_updated')),
        'highlight_event': bool(hit.get('highlightEvent')),
        'show_on_website': bool(hit.get('showOnWebsite')),
        'show_on_app': bool(hit.get('showOnApp')),
        'retail_id': sanitize_text(hit.get('retailId')),
        'image_url': sanitize_url(image.get('desktop') or image.get('mobile') or ''),
        'mobile_image_url': sanitize_url(image.get('mobile') or ''),
        'locations': locations,
        'lat': primary_location.get('lat') if primary_location else None,
        'lng': primary_location.get('lng') if primary_location else None,
        'address': primary_location.get('address') if primary_location else '',
    }
    deal['is_winactie'] = is_winactie(deal)
    return deal


def is_winactie(deal):
    haystack = ' '.join([
        deal.get('label', ''),
        ' '.join(deal.get('offers') or []),
        ' '.join(deal.get('offer_enums') or []),
        deal.get('url', ''),
    ]).lower()
    return any(token in haystack for token in ('winactie', 'kans op', 'chance'))


def fetch_algolia_page(page=0, hits_per_page=100):
    params = {
        'query': '',
        'page': page,
        'hitsPerPage': hits_per_page,
        'maxValuesPerFacet': 1000,
        'facets': ['categories', 'label', 'locations.city', 'locations.locationName', 'locations.province', 'offers', 'types'],
        'filters': 'topic:"event" AND showOnWebsite:"true"',
    }
    headers = {
        'User-Agent': 'VriendenLoterijDealsScraper/1.0',
        'Accept': 'application/json',
        'X-Algolia-Application-Id': ALGOLIA_APP_ID,
        'X-Algolia-API-Key': ALGOLIA_API_KEY,
    }
    response = requests.post(ALGOLIA_URL, headers=headers, json=params, timeout=30)
    response.raise_for_status()
    return response.json()


def fetch_live(limit_pages=None):
    all_hits = []
    page = 0
    nb_pages = None
    while nb_pages is None or page < nb_pages:
        payload = fetch_algolia_page(page)
        nb_pages = int(payload.get('nbPages') or 0)
        hits = payload.get('hits') or []
        all_hits.extend(hits)
        print(f"Fetched Algolia page {page + 1}/{nb_pages}: {len(hits)} hit(s)")
        page += 1
        if limit_pages is not None and page >= limit_pages:
            break

    deals = [normalize_hit(hit) for hit in all_hits]
    seen = set()
    unique = []
    for deal in deals:
        key = deal.get('url') or deal.get('id')
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(deal)
    unique.sort(key=lambda d: (not d.get('is_winactie'), d.get('end_ts') or 0, d.get('name') or ''))
    return unique


def snapshot_path(date_str):
    year, month, day = date_str.split('-')
    return DATA_DIR / year / month / f'{day}.json'


def save_daily_json(deals, date_str):
    DATA_DIR.mkdir(exist_ok=True)
    data_file = snapshot_path(date_str)
    data_file.parent.mkdir(parents=True, exist_ok=True)
    with open(data_file, 'w', encoding='utf-8') as f:
        json.dump(deals, f, ensure_ascii=False)

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
    print(f'Saved {len(deals)} offers to {data_file}')


def main():
    parser = argparse.ArgumentParser(description='Scrape VriendenLoterij VIP-KAART offers')
    parser.add_argument('--date', '-d', type=str, help='Date label (default: today, YYYY-MM-DD)')
    parser.add_argument('--limit-pages', type=int, help='Only fetch the first N Algolia pages')
    args = parser.parse_args()

    deals = fetch_live(limit_pages=args.limit_pages)
    if not deals:
        raise RuntimeError('No VriendenLoterij offers found')
    date_str = args.date or datetime.now().strftime('%Y-%m-%d')
    save_daily_json(deals, date_str)


if __name__ == '__main__':
    main()
