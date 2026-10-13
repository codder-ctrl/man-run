// Rooms over WebRTC with PeerJS (loaded from a CDN only when someone opens online play).
// The host's peer id is built from a 4-letter room code; friends connect to it. The public
// PeerJS server is only used to introduce the phones; game data then flows phone to phone.

const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
const PREFIX = 'manrun-v1-';
// No I/O/Q/W/X: easy to read aloud and to type on a Turkish keyboard.
const LETTERS = 'ABCDEFGHJKLMNPRSTUVYZ';

let loading = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL;
      s.async = true;
      s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('peerjs')));
      s.onerror = () => { loading = null; reject(new Error('Bağlantı kütüphanesi yüklenemedi. İnternet açık mı?')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export const randomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const cleanCode = (s) => s.toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/[^A-Z]/g, '').slice(0, 4);

function errorText(err) {
  switch (err && err.type) {
    case 'peer-unavailable': return 'Bu kodla bir oda bulunamadı.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed': return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.';
    case 'browser-incompatible': return 'Bu tarayıcı çevrim içi oyunu desteklemiyor.';
    default: return 'Bağlantı kurulamadı.';
  }
}

// Opens a room. handlers: { join(peerId, conn), message(peerId, msg), leave(peerId), error(text) }.
// Resolves to { code, send(peerId, msg), broadcast(msg), close() }.
export async function hostRoom(handlers) {
  const Peer = await loadPeerJS();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const peer = new Peer(PREFIX + code, { debug: 0 });
    const ok = await new Promise((resolve) => {
      peer.on('open', () => resolve(true));
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id') { peer.destroy(); resolve(false); return; }
        resolve(err);
      });
    });
    if (ok === false) continue;
    if (ok !== true) { peer.destroy(); throw new Error(errorText(ok)); }
    const conns = new Map();
    peer.off('error');
    peer.on('error', (err) => { if (err.type !== 'peer-unavailable') handlers.error?.(errorText(err)); });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        conns.set(conn.peer, conn);
        handlers.join?.(conn.peer);
      });
      conn.on('data', (msg) => handlers.message?.(conn.peer, msg));
      const gone = () => {
        if (!conns.has(conn.peer)) return;
        conns.delete(conn.peer);
        handlers.leave?.(conn.peer);
      };
      conn.on('close', gone);
      conn.on('error', gone);
    });
    return {
      code,
      send(peerId, msg) { const c = conns.get(peerId); if (c && c.open) c.send(msg); },
      broadcast(msg) { for (const c of conns.values()) if (c.open) c.send(msg); },
      kick(peerId) { const c = conns.get(peerId); if (c) { conns.delete(peerId); c.close(); } },
      close() { for (const c of conns.values()) c.close(); conns.clear(); peer.destroy(); },
    };
  }
  throw new Error('Oda açılamadı, tekrar dene.');
}

// Joins a room by code. handlers: { message(msg), close(), error(text) }.
// Resolves to { send(msg), close() } once connected.
export async function joinRoom(code, handlers) {
  const Peer = await loadPeerJS();
  const peer = new Peer({ debug: 0 });
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (text) => {
      if (!settled) { settled = true; peer.destroy(); reject(new Error(text)); } else handlers.error?.(text);
    };
    const timer = setTimeout(() => fail('Oda yanıt vermedi. Kodu kontrol et.'), 12000);
    peer.on('error', (err) => fail(errorText(err)));
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        clearTimeout(timer);
        settled = true;
        resolve({
          send(msg) { if (conn.open) conn.send(msg); },
          close() { handlers.close = null; conn.close(); peer.destroy(); },
        });
      });
      conn.on('data', (msg) => handlers.message?.(msg));
      conn.on('close', () => { if (settled) handlers.close?.(); });
      conn.on('error', () => fail('Bağlantı koptu.'));
    });
  });
}
