// Writes Man Run's generated art from the vector drawings:
//   node tools/icon-server.js          app icons (icons/*.png) from tools/icons.html
//   node tools/icon-server.js splash   loading screen and menu backdrop (img/*.webp) from tools/splash.html
// Open the printed URL in a browser: the page draws each image on a canvas and posts it back here;
// the server writes them and exits once all of them have arrived.
// No dependencies: serves the project folder read-only and accepts uploads for the listed files only.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, normalize, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PORT = Number(process.env.PORT) || 8091;
export const ICON_FILES = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png'];
const SETS = {
  icons: { page: 'tools/icons.html', dir: 'icons', files: ICON_FILES },
  splash: { page: 'tools/splash.html', dir: 'img', files: ['splash.webp', 'menu-bg.webp'] },
};
const SET = SETS[process.argv[2] || 'icons'];
if (!SET) throw new Error(`Unknown set "${process.argv[2]}" (use: ${Object.keys(SETS).join(', ')})`);
const OUT = join(ROOT, SET.dir);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };

const isPng = (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47;
const isWebp = (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';

const received = new Set();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'POST' && url.pathname === '/save') {
    const name = url.searchParams.get('name');
    if (!SET.files.includes(name)) { res.writeHead(400).end('unknown file'); return; }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    if (!(name.endsWith('.png') ? isPng(body) : isWebp(body))) { res.writeHead(400).end('wrong image type'); return; }
    await mkdir(OUT, { recursive: true });
    await writeFile(join(OUT, name), body);
    received.add(name);
    console.log(`wrote ${SET.dir}/${name} (${body.length} bytes)`);
    res.writeHead(200).end('ok');
    if (received.size === SET.files.length) {
      console.log('All files written.');
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

server.listen(PORT, () => console.log(`Open http://localhost:${PORT}/${SET.page} to write the files.`));
