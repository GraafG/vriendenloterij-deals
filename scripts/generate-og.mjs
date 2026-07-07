/**
 * Generates public/og-default.png — the branded Open Graph image used
 * across all pages when no deal-specific image is available.
 * Run once: node scripts/generate-og.mjs
 */
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const W = 1200, H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#dc2626"/>
    </linearGradient>
    <linearGradient id="circ" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.08)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.01)"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Decorative circles -->
  <circle cx="980" cy="80"  r="340" fill="url(#circ)"/>
  <circle cx="150" cy="540" r="220" fill="url(#circ)"/>

  <text x="90" y="158" font-size="92" font-family="system-ui,-apple-system,Segoe UI,sans-serif" fill="white">★</text>

  <!-- Brand name -->
  <text x="190" y="160" font-size="76" font-weight="800"
        font-family="system-ui,-apple-system,Segoe UI,sans-serif" fill="white"
        letter-spacing="-1">VriendenLoterij Deals</text>

  <!-- Tagline -->
  <text x="80" y="235" font-size="36"
        font-family="system-ui,-apple-system,Segoe UI,sans-serif"
        fill="rgba(255,255,255,0.78)">
    VIP-KAART aanbiedingen in één overzicht
  </text>

  <!-- Divider -->
  <line x1="80" y1="270" x2="520" y2="270" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>

  <!-- Feature bullets -->
  <text x="80" y="330" font-size="32" fill="rgba(255,255,255,0.70)"
        font-family="system-ui,-apple-system,Segoe UI,sans-serif">✓  Winacties extra snel gevolgd</text>
  <text x="80" y="385" font-size="32" fill="rgba(255,255,255,0.70)"
        font-family="system-ui,-apple-system,Segoe UI,sans-serif">✓  Wijzigingshistorie per aanbod</text>
  <text x="80" y="440" font-size="32" fill="rgba(255,255,255,0.70)"
        font-family="system-ui,-apple-system,Segoe UI,sans-serif">✓  Kaart met alle locaties</text>

  <rect x="78" y="490" width="320" height="66" rx="10" fill="rgba(0,0,0,0.25)"/>
  <text x="100" y="535" font-size="36" font-weight="700"
        font-family="system-ui,-apple-system,Segoe UI,sans-serif"
        fill="#fbbf24">Gratis, korting &amp; kans op</text>

  <!-- URL bottom right -->
  <text x="${W - 60}" y="${H - 36}" font-size="26"
        font-family="system-ui,-apple-system,Segoe UI,sans-serif"
        fill="rgba(255,255,255,0.40)" text-anchor="end">
    graafg.github.io/vriendenloterij-deals
  </text>
</svg>`;

const outPath = resolve('public', 'og-default.png');
mkdirSync('public', { recursive: true });

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 8 })
  .toFile(outPath);

console.log(`✅ Generated ${outPath}`);
