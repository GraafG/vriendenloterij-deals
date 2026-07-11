import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export const DEFAULT_PROVIDER_ID = 'tripper';

export function getProviderId() {
  return process.env.PROVIDER_ID || process.env.PUBLIC_PROVIDER_ID || DEFAULT_PROVIDER_ID;
}

export function loadProviderConfig(providerId = getProviderId()) {
  const configPath = resolve('providers', providerId, 'site.config.json');
  if (!existsSync(configPath)) {
    throw new Error(`Unknown provider "${providerId}". Expected ${configPath}`);
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}
