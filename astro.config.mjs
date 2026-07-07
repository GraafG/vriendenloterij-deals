import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://graafg.github.io',
  base: '/vriendenloterij-deals',
  output: 'static',
  trailingSlash: 'always',
  build: {
    assets: '_assets',
  },
});
