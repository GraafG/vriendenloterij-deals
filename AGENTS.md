# Agent instructions for vriendenloterij-deals

This repo is a VriendenLoterij deployment of the shared deals tracker template.

## Context
- Canonical template repo: `GraafG/deals-template`.
- Live site: `https://graafg.github.io/vriendenloterij-deals/`.
- Active provider: `vriendenloterij`.
- Provider config lives in `providers/vriendenloterij/site.config.json`.
- Provider snapshots and history live under `providers/vriendenloterij/data/`.
- The browser reads generated files from `public/data/` after `scripts/build-provider.mjs` copies the selected provider data.
- This provider tracks offers, winacties, labels, categories, locations, and event/provider metadata. Many deals do not have normal price fields.

## Commands
- Install: `npm install`
- Build VriendenLoterij: `npm run build:vriendenloterij`
- Generic build: `node scripts/build-provider.mjs vriendenloterij`
- Preview after build: `npm run preview`

## Rules for agents
- Never delete or rewrite price/history data unless the user explicitly asks. Preserve all historical snapshots.
- Do not run the scraper or add new data when the user asks only for UI, config, docs, or deployment fixes.
- Prefer deploy-only workflow runs when only site code/config changed.
- Keep provider-specific differences in `providers/vriendenloterij/site.config.json`, provider data, and provider scraper/import scripts.
- Keep shared UI/build behavior in `src/` and `scripts/`, then propagate reusable fixes back to `GraafG/deals-template`.
- GitHub Pages should stay configured for `https://graafg.github.io/vriendenloterij-deals/`.
- Use GitHub CLI (`gh`) for repo settings, PRs, workflow runs, and branch checks when possible.

## Important implementation notes
- `src/pages/index.astro` renders inline event handlers, so any function used from `onclick` must be assigned to `window`.
- VriendenLoterij history can contain non-price offer entries; UI code must tolerate missing `prices`, `discounted_price`, and `original_price`.
- Some offers have multiple locations and some have none; map and filter code must handle both.
