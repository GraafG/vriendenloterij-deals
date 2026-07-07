import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE_URL } from '../lib/config';
import { getAllDealDetails } from '../lib/deals';

const FEED_SIZE = 50;

export async function GET(_context: APIContext) {
  const items = getAllDealDetails()
    .filter(d => d.isActive && d.history?.first_seen)
    .sort((a, b) => (b.history!.first_seen).localeCompare(a.history!.first_seen))
    .slice(0, FEED_SIZE)
    .map(d => ({
      title: d.name,
      link: `${SITE_URL}/deal/${d.slug}/`,
      pubDate: new Date(d.history!.first_seen),
      description: [d.label, d.location, d.end_date ? `t/m ${d.end_date}` : ''].filter(Boolean).join(' · '),
      categories: [...(d.offers || []), ...(d.categories || [])],
    }));

  return rss({
    title: 'VriendenLoterij Deals',
    description: 'Laatste VIP-KAART aanbiedingen, winacties, gratis uitjes en kortingen.',
    site: `${SITE_URL}/`,
    items,
    customData: '<language>nl-nl</language>',
  });
}
