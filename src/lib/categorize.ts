import type { DealDetail } from './deals';

/**
 * Keywords that mark a deal as an overnight stay (hotels, resorts, camping).
 * Case-insensitive substring match against the deal name and provider.
 */
const HOTEL_PATTERNS = [
  'hotel', 'verblijf', 'overnachting', 'overnacht', 'kamer voor',
  'lodge', 'lodgetent', 'vakantiepark', 'vakantiehuis', 'resort',
  'europarcs', 'camping', 'rcn ', 'bungalow', 'chalet', 'safaritent',
  'glamping', 'wellnessverblijf', 'aqua mundo', 'center parcs',
  'landal', 'roompot',
];

export function isHotelDeal(d: DealDetail): boolean {
  const hay = `${d.name} ${d.provider}`.toLowerCase();
  return HOTEL_PATTERNS.some(p => hay.includes(p));
}

export function isDayTripDeal(d: DealDetail): boolean {
  return d.isActive && !isHotelDeal(d);
}

export function isPriceDrop(d: DealDetail): boolean {
  if (!d.isActive) return false;
  if (d.history?.trend === 'down') return true;
  const log = d.priceLog ?? [];
  // recent negative delta in the last 5 logged changes
  for (let i = log.length - 1; i >= Math.max(0, log.length - 5); i--) {
    if (log[i].delta != null && log[i].delta! < 0) return true;
  }
  return false;
}

export function isAtLowestStable(d: DealDetail): boolean {
  return d.isActive
    && d.history?.at_lowest === true
    && (d.history?.days_tracked ?? 0) >= 14;
}

/** Most recent priceLog date, or empty string. */
export function lastChangeDate(d: DealDetail): string {
  const log = d.priceLog ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].changed) return log[i].date;
  }
  return '';
}
