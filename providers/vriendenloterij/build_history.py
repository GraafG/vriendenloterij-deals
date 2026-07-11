import json
import hashlib
from html import unescape as html_unescape
from pathlib import Path

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / 'data'

TRACKED_FIELDS = [
    'name', 'description', 'label', 'offers', 'offer_enums', 'categories', 'types',
    'location', 'provider', 'start_date', 'end_date', 'last_updated', 'locations',
    'image_url', 'mobile_image_url', 'highlight_event', 'show_on_app', 'show_on_website',
]


def snapshot_path(date_str):
    year, month, day = date_str.split('-')
    return DATA_DIR / year / month / f'{day}.json'


def signature_for(deal):
    payload = {field: deal.get(field) for field in TRACKED_FIELDS}
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(encoded.encode('utf-8')).hexdigest()


def compact_snapshot(deal):
    return {field: deal.get(field) for field in TRACKED_FIELDS}


def changed_fields(previous, current):
    if previous is None:
        return TRACKED_FIELDS
    return [field for field in TRACKED_FIELDS if previous.get(field) != current.get(field)]


def build_history():
    manifest_file = DATA_DIR / 'index.json'
    if not manifest_file.exists():
        print("No data/index.json found — nothing to do.")
        return

    with open(manifest_file, 'r', encoding='utf-8') as f:
        dates = json.load(f)

    dates_asc = sorted(dates)
    history = {}

    for date_str in dates_asc:
        data_file = snapshot_path(date_str)
        if not data_file.exists():
            continue

        with open(data_file, 'r', encoding='utf-8') as f:
            deals = json.load(f)

        for deal in deals:
            url = deal.get('url')
            if not url:
                continue

            current_snapshot = compact_snapshot(deal)
            signature = signature_for(deal)

            if url not in history:
                history[url] = {
                    'name': html_unescape(deal.get('name', '') or ''),
                    'location': html_unescape(deal.get('location', '') or ''),
                    'provider': html_unescape(deal.get('provider', '') or ''),
                    'label': html_unescape(deal.get('label', '') or ''),
                    'offers': deal.get('offers') or [],
                    'offer_enums': deal.get('offer_enums') or [],
                    'categories': deal.get('categories') or [],
                    'types': deal.get('types') or [],
                    'is_winactie': bool(deal.get('is_winactie')),
                    'snapshots': [],
                    'changes': [],
                    'first_seen': date_str,
                    'last_seen': date_str,
                }

            entry = history[url]
            entry['last_seen'] = date_str
            entry['name'] = html_unescape(deal.get('name', '') or '') or entry['name']
            entry['location'] = html_unescape(deal.get('location', '') or '') or entry['location']
            entry['provider'] = html_unescape(deal.get('provider', '') or '') or entry['provider']
            entry['label'] = html_unescape(deal.get('label', '') or '') or entry.get('label', '')
            entry['offers'] = deal.get('offers') or entry.get('offers', [])
            entry['offer_enums'] = deal.get('offer_enums') or entry.get('offer_enums', [])
            entry['categories'] = deal.get('categories') or entry.get('categories', [])
            entry['types'] = deal.get('types') or entry.get('types', [])
            entry['is_winactie'] = bool(deal.get('is_winactie'))
            entry['locations'] = deal.get('locations') or []
            entry['lat'] = deal.get('lat')
            entry['lng'] = deal.get('lng')
            entry['address'] = deal.get('address')
            entry['image_url'] = deal.get('image_url')
            entry['description'] = deal.get('description')
            entry['start_date'] = deal.get('start_date')
            entry['end_date'] = deal.get('end_date')
            entry['last_updated'] = deal.get('last_updated')

            previous_snapshot = entry['snapshots'][-1]['snapshot'] if entry['snapshots'] else None
            fields = changed_fields(previous_snapshot, current_snapshot)
            entry['snapshots'].append({
                'date': date_str,
                'signature': signature,
                'snapshot': current_snapshot,
            })
            if not entry['changes'] or entry['changes'][-1]['signature'] != signature:
                entry['changes'].append({
                    'date': date_str,
                    'signature': signature,
                    'fields': fields,
                })

    latest_date = dates_asc[-1] if dates_asc else None
    for entry in history.values():
        entry['days_tracked'] = len(entry['snapshots'])
        entry['change_count'] = max(0, len(entry['changes']) - 1)
        entry['is_active'] = entry['last_seen'] == latest_date
        if entry['first_seen'] == latest_date:
            entry['trend'] = 'new'
        elif entry['change_count'] > 0 and entry['changes'][-1]['date'] == latest_date:
            entry['trend'] = 'changed'
        else:
            entry['trend'] = 'stable'

    out_file = DATA_DIR / 'history.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False)

    winacties = sum(1 for e in history.values() if e.get('is_winactie') and e.get('is_active'))
    changed = sum(1 for e in history.values() if e.get('trend') == 'changed')
    print(f"Built history for {len(history)} offers across {len(dates_asc)} dates -> {out_file}")
    print(f"  {winacties} active winacties, {changed} offer(s) changed in the latest snapshot")


if __name__ == '__main__':
    build_history()
