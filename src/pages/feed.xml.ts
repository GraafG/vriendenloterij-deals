import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE_CONFIG, SITE_URL } from '../lib/config';
import { getAllDealDetails } from '../lib/deals';

const FEED_SIZE = 50;

export async function GET(_context: APIContext) {
  const items = getAllDealDetails()
    .filter(d => d.isActive && d.history?.first_seen)
    .sort((a, b) => (b.history!.first_seen).localeCompare(a.history!.first_seen))
    .slice(0, FEED_SIZE)
    .map(d => {
      const price = d.discounted_price != null ? `€${d.discounted_price.toFixed(2)}` : '';
      const original = d.original_price != null && d.original_price !== d.discounted_price
        ? ` (was €${d.original_price.toFixed(2)})`
        : '';
      const discount = d.discount ? ` — ${d.discount} korting` : '';
      return {
        title: d.name,
        link: `${SITE_URL}/deal/${d.slug}/`,
        pubDate: new Date(d.history!.first_seen),
        description: [d.location, `${price}${original}${discount}`].filter(Boolean).join(' · '),
        categories: [d.provider].filter(Boolean) as string[],
      };
    });

  return rss({
    title: SITE_CONFIG.copy.rssTitle,
    description: SITE_CONFIG.copy.rssDescription,
    site: `${SITE_URL}/`,
    items,
    customData: '<language>nl-nl</language>',
  });
}
