import { defineConfig } from 'astro/config';
import { loadProviderConfig } from './scripts/provider-config.mjs';

const provider = loadProviderConfig();

export default defineConfig({
  site: 'https://graafg.github.io',
  base: provider.base,
  output: 'static',
  trailingSlash: 'always',
  build: {
    assets: '_assets',
  },
});
