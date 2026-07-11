import { cpSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { loadProviderConfig } from './provider-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const provider = loadProviderConfig();
const src = join(root, provider.dataDir);
const dst = join(root, 'dist', 'data');

// Load dealcache once — maps URL → {lat, lng, address, locations, image_url, review_count}
let dealCache = {};
if (provider.dealCachePath) {
  try {
    dealCache = JSON.parse(readFileSync(join(root, provider.dealCachePath), 'utf-8'));
  } catch {
    console.warn('dealcache.json not found - snapshots deployed without geo enrichment');
  }
}

const GEO_FIELDS = ['lat', 'lng', 'address', 'locations', 'image_url', 'review_count'];

/** Merge dealcache geo/image fields into a lean snapshot array. */
function enrich(deals) {
  return deals.map(deal => {
    const cache = dealCache[deal.url];
    if (!cache || typeof cache !== 'object') return deal;
    const merged = { ...deal };
    for (const field of GEO_FIELDS) {
      if (cache[field] != null && merged[field] == null) {
        merged[field] = cache[field];
      }
    }
    return merged;
  });
}

/** Recursively copy src → dst, enriching *.json snapshot files along the way. */
function copyAndEnrich(srcDir, dstDir) {
  mkdirSync(dstDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const srcPath = join(srcDir, entry);
    const dstPath = join(dstDir, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyAndEnrich(srcPath, dstPath);
      continue;
    }

    // Only enrich year/month/day snapshot files (not index.json / history.json)
    const relPath = relative(src, srcPath);
    const isSnapshot = /^\d{4}[/\\]\d{2}[/\\]\d{2}\.json$/.test(relPath);

    if (isSnapshot) {
      const deals = JSON.parse(readFileSync(srcPath, 'utf-8'));
      const enriched = enrich(deals);
      writeFileSync(dstPath, JSON.stringify(enriched), 'utf-8');
    } else {
      cpSync(srcPath, dstPath);
    }
  }
}

copyAndEnrich(src, dst);
console.log(`data copied from ${provider.dataDir} to dist/data/`);
