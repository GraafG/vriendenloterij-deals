import type { DealDetail } from './deals';

export function isWinactie(d: DealDetail): boolean {
  return d.isActive && d.is_winactie === true;
}

export function isFreeOffer(d: DealDetail): boolean {
  const hay = `${d.label || ''} ${(d.offers || []).join(' ')} ${(d.offer_enums || []).join(' ')}`.toLowerCase();
  return d.isActive && (hay.includes('gratis') || hay.includes('free'));
}

export function isDiscountOffer(d: DealDetail): boolean {
  const hay = `${d.label || ''} ${(d.offers || []).join(' ')} ${(d.offer_enums || []).join(' ')}`.toLowerCase();
  return d.isActive && (hay.includes('korting') || hay.includes('discount'));
}

export function isChangedOffer(d: DealDetail): boolean {
  return d.isActive && d.history?.trend === 'changed';
}

export function lastChangeDate(d: DealDetail): string {
  const log = d.changeLog ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].fields?.length) return log[i].date;
  }
  return '';
}
