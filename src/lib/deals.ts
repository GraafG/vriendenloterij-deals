import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface Location {
  name?: string;
  city?: string;
  province?: string;
  address?: string;
  lat: number | null;
  lng: number | null;
  website?: string;
}

export interface SnapshotDeal {
  id: string;
  url: string;
  name: string;
  description?: string;
  label?: string;
  offers?: string[];
  offer_enums?: string[];
  categories?: string[];
  types?: string[];
  topic?: string;
  provider?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  start_ts?: number;
  end_ts?: number;
  last_updated?: string;
  highlight_event?: boolean;
  show_on_website?: boolean;
  show_on_app?: boolean;
  retail_id?: string;
  image_url?: string;
  mobile_image_url?: string;
  locations?: Location[];
  lat?: number | null;
  lng?: number | null;
  address?: string;
  is_winactie?: boolean;
}

export interface OfferSnapshot {
  date: string;
  signature: string;
  snapshot: Partial<SnapshotDeal>;
}

export interface OfferChange {
  date: string;
  signature: string;
  fields: string[];
}

export interface DealHistory {
  name: string;
  location: string;
  provider: string;
  label?: string;
  offers?: string[];
  offer_enums?: string[];
  categories?: string[];
  types?: string[];
  description?: string;
  start_date?: string;
  end_date?: string;
  last_updated?: string;
  first_seen: string;
  last_seen: string;
  snapshots: OfferSnapshot[];
  changes: OfferChange[];
  days_tracked: number;
  change_count: number;
  is_active: boolean;
  is_winactie: boolean;
  trend: 'new' | 'changed' | 'stable';
  locations?: Location[];
  lat?: number | null;
  lng?: number | null;
  address?: string;
  image_url?: string;
}

export interface DealDetail extends SnapshotDeal {
  slug: string;
  locations: Location[];
  history: DealHistory | null;
  changeLog: OfferChange[];
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

export function getLatestDate(): string {
  return (loadJson<string[]>('data/index.json'))[0];
}

export function getSnapshotPath(date: string): string {
  const [year, month, day] = date.split('-');
  return `data/${year}/${month}/${day}.json`;
}

export function getLatestDeals(): SnapshotDeal[] {
  return loadJson<SnapshotDeal[]>(getSnapshotPath(getLatestDate()));
}

export function getAllHistory(): Record<string, DealHistory> {
  return loadJson<Record<string, DealHistory>>('data/history.json');
}

export function getAllDealDetails(): DealDetail[] {
  const latestDeals = getLatestDeals();
  const history = getAllHistory();
  const snapshotMap = new Map<string, SnapshotDeal>();
  for (const deal of latestDeals) snapshotMap.set(deal.url, deal);

  const seen = new Set<string>();
  const result: DealDetail[] = [];

  for (const [url, h] of Object.entries(history)) {
    const slug = getSlug(url);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const snap = snapshotMap.get(url);
    const locations = snap?.locations?.length
      ? snap.locations
      : h.locations?.length
        ? h.locations
        : h.lat != null
          ? [{ lat: h.lat, lng: h.lng ?? null, address: h.address || '', city: h.location }]
          : [];

    result.push({
      id: snap?.id || '',
      slug,
      url,
      name: snap?.name || h.name,
      description: snap?.description || h.description,
      label: snap?.label || h.label,
      offers: snap?.offers || h.offers || [],
      offer_enums: snap?.offer_enums || h.offer_enums || [],
      categories: snap?.categories || h.categories || [],
      types: snap?.types || h.types || [],
      topic: snap?.topic,
      provider: snap?.provider || h.provider,
      location: snap?.location || h.location,
      start_date: snap?.start_date || h.start_date,
      end_date: snap?.end_date || h.end_date,
      start_ts: snap?.start_ts,
      end_ts: snap?.end_ts,
      last_updated: snap?.last_updated || h.last_updated,
      highlight_event: snap?.highlight_event,
      show_on_website: snap?.show_on_website,
      show_on_app: snap?.show_on_app,
      retail_id: snap?.retail_id,
      image_url: snap?.image_url || h.image_url,
      mobile_image_url: snap?.mobile_image_url,
      locations,
      lat: snap?.lat ?? h.lat,
      lng: snap?.lng ?? h.lng,
      address: snap?.address || h.address,
      is_winactie: snap?.is_winactie ?? h.is_winactie,
      history: h,
      changeLog: h.changes || [],
      isActive: snapshotMap.has(url),
    });
  }

  return result;
}

export function formatDateTime(value?: string): string {
  if (!value) return '';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('nl-NL', { year: 'numeric', month: 'short', day: 'numeric' });
}
