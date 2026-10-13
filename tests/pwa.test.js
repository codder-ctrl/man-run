import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { VERSION } from '../js/config.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('service worker caches every game file', () => {
  const sw = read('sw.js');
  const block = sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];'));
  const shell = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const f of readdirSync(new URL('js/', root))) assert.ok(shell.includes(`js/${f}`), `sw.js SHELL is missing js/${f}`);
  for (const f of shell) if (f !== './') assert.ok(existsSync(new URL(f, root)), `sw.js lists missing file ${f}`);
});

test('version matches package.json', () => {
  assert.equal(JSON.parse(read('package.json')).version, VERSION);
});

test('page paths stay relative (the site lives under a subfolder)', () => {
  const html = read('index.html');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = m[1];
    if (url.startsWith('https://')) continue;
    assert.ok(!url.startsWith('/'), `absolute path in index.html: ${url}`);
  }
});
