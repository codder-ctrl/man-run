// Generates Man Run's app icons in icons/ from the vector art: `npm run icons`, then open the printed
// URL in a browser. tools/icons.html draws each icon on a canvas and posts the PNGs back here;
// the server writes them and exits once all of them have arrived.
// No dependencies: serves the project folder read-only and accepts PNG uploads for icons/ only.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, normalize, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'icons');
const PORT = Number(process.env.PORT) || 8091;
export const ICON_FILES = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const received = new Set();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'POST' && url.pathname === '/save') {
    const name = url.searchParams.get('name');
    if (!ICON_FILES.includes(name)) { res.writeHead(400).end('unknown icon'); return; }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    if (body.readUInt32BE(0) !== 0x89504e47) { res.writeHead(400).end('not a png'); return; }
    await mkdir(OUT, { recursive: true });
    await writeFile(join(OUT, name), body);
    received.add(name);
    console.log(`wrote icons/${name} (${body.length} bytes)`);
    res.writeHead(200).end('ok');
    if (received.size === ICON_FILES.length) {
      console.log('All icons written.');
      setTimeout(() => process.exit(0), 200);
    }
    return;
  }
  const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(path.endsWith('\\') || path.endsWith('/') ? join(path, 'index.html') : path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(data);
  } catch {
    res.writeHead(404).end();
  }
});

server.listen(PORT, () => console.log(`Open http://localhost:${PORT}/tools/icons.html to write the icons.`));
