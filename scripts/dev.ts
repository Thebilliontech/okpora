import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { handleRequest } from '../server/app';
import { maintenance } from '../server/maintenance';
import { config } from '../server/config/index';
if (process.argv.includes('--local-db') || !config.databaseUrl) {
  if (config.production) throw new Error('Local database mode is development only.');
  const { localDatabase } = await import('./local-db');
  await localDatabase('./.local-db');
  const { migrate } = await import('./migrate');
  await migrate();
  const { seed } = await import('./seed');
  await seed(true);
  console.log(
    'Local development database enabled with illustrative sample products. No payment is simulated.',
  );
}
const server = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 220000) {
        res.writeHead(413);
        res.end('Too large');
        return;
      }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v) headers.set(k, Array.isArray(v) ? v.join(',') : v);
    const request = new Request('http://localhost:8889' + req.url, {
      method: req.method,
      headers,
      ...(!['GET', 'HEAD'].includes(req.method || 'GET') ? { body: Buffer.concat(chunks) } : {}),
    });
    const response = await handleRequest(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch {
    res.writeHead(500);
    res.end('Development server error');
  }
});
server.listen(8889, '127.0.0.1');
const vite = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', ...process.argv.slice(2).filter((a) => a !== '--local-db')],
  { stdio: 'inherit' },
);
const timer = setInterval(() => maintenance().catch(() => {}), 30000);
const stop = () => {
  clearInterval(timer);
  vite.kill();
  server.close();
  process.exit();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
