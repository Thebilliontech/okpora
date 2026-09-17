import { build } from 'esbuild';
import { readdir, mkdir } from 'node:fs/promises';
await mkdir('.netlify-functions', { recursive: true });
for (const file of await readdir('netlify/functions'))
  if (file.endsWith('.ts'))
    await build({
      entryPoints: ['netlify/functions/' + file],
      outdir: '.netlify-functions',
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      packages: 'external',
    });
console.log('All Netlify functions compiled.');
