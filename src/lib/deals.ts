import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DATA_DIR, DEAL_CACHE_PATH } from './config';

export interface PricePoint {
  date: string;
  price: number;
  original: number;
  discount_num: number;
}

export interface Location {
  lat: number;
  lng: number;
  address: string;
}

export interface DealHistory {
  name: string;
  location: string;
  provider: string;
  prices?: PricePoint[];
  first_seen: string;
  last_seen: string;
  min_price: number;
  max_price: number;
  current_price: number;
  at_lowest: boolean;
  trend: string;
  days_tracked: number;
  is_active: boolean;
  label?: string;
  offers?: string[];
  offer_enums?: string[];
  categories?: string[];
  types?: string[];
  is_winactie?: boolean;
  snapshots?: Array<{ date: string; signature?: string; snapshot?: Record<string, unknown> }>;
  changes?: Array<{ date: string; signature?: string; fields?: string[] }>;
}

export interface SnapshotDeal {
  url: string;
  name: string;
  provider: string;
  location: string;
  rating?: string;
  discount?: string;
  discount_num?: number;
  original_price?: number;
  discounted_price?: number;
  savings?: number;
  lat?: number;
  lng?: number;
  address?: string;
  locations?: Location[];
  image_url?: string;
  review_count?: number;
  label?: string;
  offers?: string[];
  categories?: string[];
  types?: string[];
  is_winactie?: boolean;
  show_on_website?: boolean;
  show_on_app?: boolean;
  start_date?: string;
  end_date?: string;
  start_ts?: number;
  end_ts?: number;
}

export interface PriceChange {
  date: string;
  price: number;
  original: number;
  discount_num: number;
  delta: number | null;
  changed: boolean;
}

export interface DealDetail {
  slug: string;
  url: string;
  name: string;
  provider: string;
  location: string;
  rating?: string;
  discount?: string;
  discount_num?: number;
  original_price?: number;
  discounted_price?: number;
  savings?: number;
  locations: Location[];
  image_url?: string;
  review_count?: number;
  history: DealHistory | null;
  priceLog: PriceChange[];
  chartSvg: string;
  isActive: boolean;
}

export function getSlug(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.replace(/\/$/, '').split('/');
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf-8')) as T;
}

function dataPath(path: string): string {
  return `${DATA_DIR}/${path}`.replace(/\\/g, '/');
}

interface DealCacheEntry {
  lat?: number | null;
  lng?: number | null;
  address?: string;
  locations?: Location[];
  image_url?: string;
  review_count?: number | null;
}

function loadDealCache(): Record<string, DealCacheEntry | null> {
  if (!DEAL_CACHE_PATH) return {};
  try {
    return loadJson<Record<string, DealCacheEntry | null>>(DEAL_CACHE_PATH);
  } catch {
    return {};
  }
}

export function getLatestDate(): string {
  return (loadJson<string[]>(dataPath('index.json')))[0];
}

export function getSnapshotPath(date: string): string {
  const [year, month, day] = date.split('-');
  return dataPath(`${year}/${month}/${day}.json`);
}

export function getLatestDeals(): SnapshotDeal[] {
  return loadJson<SnapshotDeal[]>(getSnapshotPath(getLatestDate()));
}

export function getAllHistory(): Record<string, DealHistory> {
  return loadJson<Record<string, DealHistory>>(dataPath('history.json'));
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildChartSvg(prices: PricePoint[]): string {
  const pts = prices.filter(p => p.price != null);
  if (pts.length < 2) return '';

  const W = 720, H = 160, PX = 48, PY = 20;
  const vals = pts.map(p => p.price);
  const minP = Math.min(...vals);
  const maxP = Math.max(...vals);
  const range = maxP - minP || 1;

  const points = pts.map((p, i) => ({
    x: PX + (i / (pts.length - 1)) * (W - 2 * PX),
    y: PY + (1 - (p.price - minP) / range) * (H - 2 * PY),
    ...p,
  }));

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${points.at(-1)!.x.toFixed(1)},${H - PY} L${points[0].x.toFixed(1)},${H - PY} Z`;

  const dots = points.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#dc2626" stroke="#fff" stroke-width="2"><title>${esc(p.date)}: €${p.price.toFixed(2)}</title></circle>`
  ).join('');

  // Pick 4-5 date labels spread across the x-axis
  const labelCount = Math.min(5, pts.length);
  const labelIdxs = Array.from({ length: labelCount }, (_, i) =>
    Math.round(i * (pts.length - 1) / (labelCount - 1))
  );
  const dateLabels = [...new Set(labelIdxs)].map(i =>
    `<text x="${points[i].x.toFixed(1)}" y="${H + 16}" font-size="11" fill="#6b7280" text-anchor="middle">${esc(pts[i].date.slice(5))}</text>`
  ).join('');

  return `<svg viewBox="0 0 ${W} ${H + 24}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Prijsgeschiedenis grafiek">
  <defs>
    <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#dc2626" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#dc2626" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <path d="${area}" fill="url(#ag)"/>
  <path d="${line}" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  ${dots}
  <text x="${PX - 6}" y="${PY + 4}" font-size="11" fill="#6b7280" text-anchor="end">€${maxP.toFixed(2)}</text>
  <text x="${PX - 6}" y="${H - PY + 4}" font-size="11" fill="#6b7280" text-anchor="end">€${minP.toFixed(2)}</text>
  ${dateLabels}
</svg>`;
}

export function computePriceLog(prices: PricePoint[]): PriceChange[] {
  return prices.map((p, i) => {
    const prev = i > 0 ? prices[i - 1] : null;
    const delta = prev != null ? +(p.price - prev.price).toFixed(2) : null;
    const changed = prev == null || p.price !== prev.price || p.original !== prev.original || p.discount_num !== prev.discount_num;
    return { date: p.date, price: p.price, original: p.original, discount_num: p.discount_num, delta, changed };
  });
}

export function getAllDealDetails(): DealDetail[] {
  const latestDeals = getLatestDeals();
  const history = getAllHistory();
  const dealCache = loadDealCache();

  const snapshotMap = new Map<string, SnapshotDeal>();
  for (const d of latestDeals) snapshotMap.set(d.url, d);

  const seen = new Set<string>();
  const result: DealDetail[] = [];

  for (const [url, h] of Object.entries(history)) {
    const slug = getSlug(url);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const snap = snapshotMap.get(url);
    const cache = dealCache[url] ?? null;

    const locs: Location[] = cache?.locations?.length
      ? cache.locations
      : cache?.lat != null
        ? [{ lat: cache.lat!, lng: cache.lng!, address: cache.address || '' }]
        : snap?.locations?.length
          ? snap.locations
          : snap?.lat != null
            ? [{ lat: snap.lat!, lng: snap.lng!, address: snap.address || '' }]
            : [];

    // image_url and review_count: prefer dealcache (always fresh), fall back to snapshot
    const image_url = cache?.image_url || snap?.image_url || undefined;
    const review_count = cache?.review_count ?? (snap?.review_count ?? undefined);

    const priceLog = computePriceLog(h.prices || []);

    result.push({
      slug,
      url,
      name: snap?.name || h.name,
      provider: snap?.provider || h.provider,
      location: snap?.location || h.location,
      rating: snap?.rating,
      discount: snap?.discount,
      discount_num: snap?.discount_num,
      original_price: snap?.original_price,
      discounted_price: snap?.discounted_price,
      savings: snap?.savings,
      locations: locs,
      image_url,
      review_count,
      history: h,
      priceLog,
      chartSvg: buildChartSvg(h.prices || []),
      isActive: snapshotMap.has(url),
    });
  }

  return result;
}
