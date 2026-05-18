"""Build a unified price-history file from daily deal snapshots.

Reads every data/YYYY/MM/DD.json produced by the scraper and writes
data/history.json keyed by deal URL.  Each entry contains the full
price timeline plus pre-computed summary fields so the frontend can
render trend arrows, "lowest-price" badges, and sparkline charts
without extra computation.
"""

import json
from datetime import date, timedelta
from html import unescape as html_unescape
from pathlib import Path

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / 'data'


def load_dealcache():
    """Return a dict mapping URL → geo fields from dealcache.json."""
    path = BASE_DIR / 'dealcache.json'
    if not path.exists():
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        raw = json.load(f)
    result = {}
    for url, entry in raw.items():
        if not isinstance(entry, dict):
            continue
        result[url] = {
            'lat': entry.get('lat'),
            'lng': entry.get('lng'),
            'address': entry.get('address'),
            'locations': entry.get('locations'),
        }
    return result


def snapshot_path(date_str):
    """Return the datalake-style path for a YYYY-MM-DD snapshot."""
    year, month, day = date_str.split('-')
    return DATA_DIR / year / month / f"{day}.json"


def build_history():
    manifest_file = DATA_DIR / 'index.json'
    if not manifest_file.exists():
        print("No data/index.json found — nothing to do.")
        return

    with open(manifest_file, 'r', encoding='utf-8') as f:
        dates = json.load(f)

    # Sort chronologically (oldest first) for proper timeline building
    dates_asc = sorted(dates)

    dealcache = load_dealcache()
    history = {}  # keyed by deal URL

    for date_str in dates_asc:
        data_file = snapshot_path(date_str)
        if not data_file.exists():
            data_file = DATA_DIR / f"{date_str}.json"  # legacy flat-layout fallback
        if not data_file.exists():
            continue

        with open(data_file, 'r', encoding='utf-8') as f:
            deals = json.load(f)

        for deal in deals:
            url = deal.get('url')
            if not url:
                continue

            price = deal.get('discounted_price')

            if url not in history:
                history[url] = {
                    'name': html_unescape(deal.get('name', '') or ''),
                    'location': html_unescape(deal.get('location', '') or ''),
                    'provider': html_unescape(deal.get('provider', '') or ''),
                    'prices': [],
                    'first_seen': date_str,
                    'last_seen': date_str,
                }

            entry = history[url]
            entry['last_seen'] = date_str
            # Keep name/provider/location up-to-date with latest snapshot
            entry['name'] = html_unescape(deal.get('name', '') or '') or entry['name']
            entry['location'] = html_unescape(deal.get('location', '') or '') or entry['location']
            entry['provider'] = html_unescape(deal.get('provider', '') or '') or entry['provider']

            entry['prices'].append({
                'date': date_str,
                'price': price,
                'original': deal.get('original_price'),
                'discount_num': deal.get('discount_num', 0),
            })

    # Compute summary fields
    latest_date = dates_asc[-1] if dates_asc else None
    for url, entry in history.items():
        valid_prices = [p['price'] for p in entry['prices'] if p['price'] is not None]

        if valid_prices:
            entry['min_price'] = min(valid_prices)
            entry['max_price'] = max(valid_prices)
            entry['current_price'] = valid_prices[-1]
            entry['at_lowest'] = valid_prices[-1] <= entry['min_price']
        else:
            entry['min_price'] = None
            entry['max_price'] = None
            entry['current_price'] = None
            entry['at_lowest'] = False

        # Trend: linear regression slope over the last 7 days of prices.
        # Mark as 'new' only if first seen within the last 7 days.
        seven_days_ago = None
        if latest_date:
            seven_days_ago = (date.fromisoformat(latest_date) - timedelta(days=7)).isoformat()

        if seven_days_ago and entry.get('first_seen', '') >= seven_days_ago and not valid_prices:
            entry['trend'] = 'new'
        elif valid_prices and seven_days_ago:
            # Collect price points within the 7-day window (inclusive)
            window = [
                p['price'] for p in entry['prices']
                if p['price'] is not None and p['date'] >= seven_days_ago
            ]
            current = valid_prices[-1]

            if not window or entry['first_seen'] >= seven_days_ago and len(window) <= 1:
                # Deal appeared within 7 days and we only have 1 point — it's new
                entry['trend'] = 'new'
            elif len(window) == 1:
                # Older deal, only one price in window — stable
                entry['trend'] = 'stable'
            else:
                # Linear regression slope over the window (x = index, y = price)
                n = len(window)
                x_mean = (n - 1) / 2.0
                y_mean = sum(window) / n
                numerator = sum((i - x_mean) * (window[i] - y_mean) for i in range(n))
                denominator = sum((i - x_mean) ** 2 for i in range(n))
                slope = numerator / denominator if denominator else 0.0

                # Project slope across the window to get total estimated change
                total_change = slope * (n - 1)
                pct_change = total_change / window[0] if window[0] else 0.0

                if total_change < -0.50 and pct_change < -0.02:
                    entry['trend'] = 'down'
                elif total_change > 0.50 and pct_change > 0.02:
                    entry['trend'] = 'up'
                else:
                    entry['trend'] = 'stable'
        else:
            entry['trend'] = 'stable'

        entry['days_tracked'] = len(entry['prices'])
        entry['is_active'] = (entry['last_seen'] == latest_date)

        # Merge geo fields from dealcache so expired deals have map coordinates
        geo = dealcache.get(url, {})
        entry['lat'] = geo.get('lat')
        entry['lng'] = geo.get('lng')
        entry['address'] = geo.get('address')
        entry['locations'] = geo.get('locations')

    # Write output
    out_file = DATA_DIR / 'history.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False)

    print(f"Built history for {len(history)} deals across {len(dates_asc)} dates → {out_file}")
    at_lowest = sum(1 for e in history.values() if e.get('at_lowest'))
    print(f"  {at_lowest} deals currently at their lowest tracked price")


if __name__ == '__main__':
    build_history()
