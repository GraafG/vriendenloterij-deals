import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests

from vriendenloterij_scraper import fetch_live

BASE_DIR = Path(__file__).parent
STATE_FILE = BASE_DIR / 'data' / 'notified_winacties.json'


def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'notified_ids': [], 'last_checked': None}


def save_state(state):
    STATE_FILE.parent.mkdir(exist_ok=True)
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def validate_webhook_url(url):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.netloc:
        raise ValueError('NEW_WIKI_WEBHOOK_URL must be an absolute https URL')


def post_notification(url, token, items):
    validate_webhook_url(url)
    payload = {
        'source': 'vriendenloterij-deals',
        'event': 'new_winactie',
        'detected_at': datetime.now(timezone.utc).isoformat(),
        'count': len(items),
        'items': items,
    }
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    response = requests.post(url, headers=headers, json=payload, timeout=30)
    response.raise_for_status()


def compact_item(deal):
    return {
        'id': deal.get('id'),
        'name': deal.get('name'),
        'url': deal.get('url'),
        'label': deal.get('label'),
        'location': deal.get('location'),
        'provider': deal.get('provider'),
        'start_date': deal.get('start_date'),
        'end_date': deal.get('end_date'),
        'categories': deal.get('categories') or [],
    }


def main():
    parser = argparse.ArgumentParser(description='Notify new-wiki when new VriendenLoterij winacties appear')
    parser.add_argument('--dry-run', action='store_true', help='Print new winacties without posting')
    args = parser.parse_args()

    deals = fetch_live()
    winacties = [d for d in deals if d.get('is_winactie')]
    state = load_state()
    notified = set(state.get('notified_ids') or [])
    new_items = [compact_item(d) for d in winacties if (d.get('id') or d.get('url')) not in notified]

    print(f'Found {len(winacties)} live winactie(s); {len(new_items)} new')
    if new_items:
        if args.dry_run:
            print(json.dumps(new_items, ensure_ascii=False, indent=2))
        else:
            webhook_url = os.environ.get('NEW_WIKI_WEBHOOK_URL')
            if not webhook_url:
                raise RuntimeError('NEW_WIKI_WEBHOOK_URL is required when new winacties are detected')
            post_notification(webhook_url, os.environ.get('NEW_WIKI_WEBHOOK_TOKEN'), new_items)
            print(f'Posted {len(new_items)} winactie notification(s) to new-wiki')

    if not args.dry_run:
        for deal in winacties:
            key = deal.get('id') or deal.get('url')
            if key:
                notified.add(key)
        state['notified_ids'] = sorted(notified)
        state['last_checked'] = datetime.now(timezone.utc).isoformat()
        save_state(state)


if __name__ == '__main__':
    main()
