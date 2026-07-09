import type { APIRoute } from 'astro';
import { getAllDealDetails } from '../lib/deals';
import { SITE_URL } from '../lib/config';

export const GET: APIRoute = () => {
  const dealUrls = getAllDealDetails()
    .filter(d => d.slug && d.isActive)
    .map(d => {
      const lastmod = d.history?.last_seen ?? '';
      return `  <url><loc>${SITE_URL}/deal/${d.slug}/</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>daily</changefreq><priority>0.7</priority></url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE_URL}/prijsdalingen/</loc><changefreq>daily</changefreq><priority>0.8</priority></url>
  <url><loc>${SITE_URL}/wijzigingen/</loc><changefreq>daily</changefreq><priority>0.8</priority></url>
  <url><loc>${SITE_URL}/laagste-prijs/</loc><changefreq>daily</changefreq><priority>0.8</priority></url>
  <url><loc>${SITE_URL}/hotels/</loc><changefreq>daily</changefreq><priority>0.7</priority></url>
  <url><loc>${SITE_URL}/dagjes-uit/</loc><changefreq>daily</changefreq><priority>0.7</priority></url>
  <url><loc>${SITE_URL}/over/</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>
  <url><loc>${SITE_URL}/privacy/</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>
${dealUrls}
</urlset>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
