import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface ProviderConfig {
  id: string;
  name: string;
  shortName: string;
  siteUrl: string;
  base: string;
  sourceUrl: string;
  dataDir: string;
  dealCachePath?: string;
  theme: {
    primary: string;
    secondary: string;
    accent: string;
    mark: string;
  };
  copy: {
    homeTitle: string;
    tagline: string;
    description: string;
    hero: string;
    rssTitle: string;
    rssDescription: string;
    ogTagline: string;
    ogBullets: string[];
    ogBadge: string;
  };
  features: {
    prices: boolean;
    referral: boolean;
    winacties: boolean;
  };
  referral?: {
    param: string;
    value: string;
    banner: string;
  };
}

export const PROVIDER_ID = process.env.PROVIDER_ID || process.env.PUBLIC_PROVIDER_ID || 'tripper';

function loadProviderConfig(): ProviderConfig {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'providers', PROVIDER_ID, 'site.config.json'), 'utf-8')
  ) as ProviderConfig;
}

export const SITE_CONFIG = loadProviderConfig();

/** Single source of truth for the deployed site base URL. */
export const SITE_URL = SITE_CONFIG.siteUrl;

/** Tripper.nl referral code appended to outbound links when referral support is enabled. */
export const TRIPPER_REF = SITE_CONFIG.referral?.value ?? '';

export const SOURCE_SITE_URL = SITE_CONFIG.sourceUrl;
export const DATA_DIR = SITE_CONFIG.dataDir;
export const DEAL_CACHE_PATH = SITE_CONFIG.dealCachePath;
