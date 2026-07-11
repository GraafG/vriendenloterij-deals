import { spawnSync } from 'child_process';

const providerId = process.argv[2] || process.env.PROVIDER_ID || 'tripper';
const env = {
  ...process.env,
  PROVIDER_ID: providerId,
  PUBLIC_PROVIDER_ID: providerId,
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
    shell: options.shell ?? false,
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const node = process.execPath;
const npx = 'npx';

run(node, ['scripts/generate-og.mjs']);
run(npx, ['astro', 'build'], { shell: process.platform === 'win32' });
run(node, ['scripts/copy-data.mjs']);
