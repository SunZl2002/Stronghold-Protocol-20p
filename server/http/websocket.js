// server/http/websocket.js — the real-time side of the server:
//
//   * session wiring: SessionRegistry (reconnect tokens) → Lobby (rooms, server/lobby.js) → Network (the socket
//     protocol, server/net.js), built from the startServer() options (config.js decides which go where);
//   * WebSocket (ws) at /ws, maxPayload 64 KB after inflation, permessage-deflate (WS_COMPRESSION / WS_DEFLATE) →
//     Network.handleConnection. Refused at
//     the upgrade: any other path 404; per-network socket limit for internet clients (maxConnectionsPerAddr, see net.js
//     clientAddress; local/LAN peers are exempt) 429; server full (maxConnections) or shutting down 503.

import { WebSocketServer } from 'ws';
import { Network, SessionRegistry, NET_DEFAULTS } from '../net.js';
import { Lobby } from '../lobby.js';
import { splitUrl } from './common.js';
import { netOptionsFrom, lobbyOptionsFrom } from './config.js';

/** Inbound WebSocket frame limit (DESIGN §8). */
export const WS_MAX_PAYLOAD = 64 * 1024;

// RFC 7692 raw DEFLATE — the coding this server actually negotiates (D021's compact wire).
//
// STANDING RULE (D036, owner's decision 2026-10-13): this configuration is kept PERMANENTLY, and every future
// upstream sync keeps it too. Upstream v0.2.6 ships `WS_DEFLATE` instead — 1 KB threshold,
// `serverNoContextTakeover`, a 2 KB window — measured on a *solo* session, where larger windows gain nothing. A
// 20-seat room's 8 Hz broadcast IS the repeated-view stream that this branch's compact wire produces, so there the
// difference is large. Measured with 24 coalesced 20-seat m.public views (1.10 MB of JSON):
//
//   WS_COMPRESSION (this, 32 KiB dictionary kept)  1.10 MB → 76 KB   (93.1 % saved)
//   WS_DEFLATE     (upstream, no context, 2 KiB)   1.10 MB → 242 KB  (78.1 % saved)
//
// — 3.2× the bytes on the wire. `test/wire-pressure.test.js` (84 compact sockets sharing a 0.8 Mbps budget) passes
// with this config and FAILS with upstream's; that test is this rule's guard, so never tune its thresholds to make
// it green. Upstream's `test/ws-compression.test.js` pins upstream's own constants and will therefore FAIL on every
// sync: that is expected — adapt the test to `WS_COMPRESSION`, never the implementation to the test.
//
// Retaining the outbound 32 KiB dictionary exploits repeated views; ws bounds global zlib work. Incoming clients do
// not retain context, and maxPayload still bounds decompressed input. No custom browser inflater.
export const WS_COMPRESSION = Object.freeze({
  serverNoContextTakeover: false, clientNoContextTakeover: true,
  serverMaxWindowBits: 15, concurrencyLimit: 4, threshold: 256,
  zlibDeflateOptions: Object.freeze({ level: 6, memLevel: 7 }),
});

/**
 * permessage-deflate (RFC 7692) for the JSON text frames. Kept for the record of upstream 0.2.6's configuration: a
 * message from 1 KB up is compressed on its own — no context is kept from one message to the next
 * (`serverNoContextTakeover`) — with a 2 KB window and zlib memLevel 7, so a connection holds about 72 KB of zlib
 * state; smaller frames (pong, ok) go out as they are. Browsers negotiate compression by themselves; a client that
 * offers none gets plain frames. The inflated size of a client frame still counts against WS_MAX_PAYLOAD.
 *
 * This branch does NOT negotiate it (see WS_COMPRESSION above for the measured difference); it is the ceiling
 * `narrowDeflateOffer` compares an offer's `server_max_window_bits` against, since 11 bits is narrower than the 15
 * this server asks for and ws would refuse the whole handshake for such an offer.
 */
export const WS_DEFLATE = Object.freeze({
  threshold: 1024,
  serverNoContextTakeover: true,
  serverMaxWindowBits: 11,
  zlibDeflateOptions: Object.freeze({ memLevel: 7 }),
});

/**
 * Does every permessage-deflate offer of this `Sec-WebSocket-Extensions` header cap the server window below
 * WS_DEFLATE.serverMaxWindowBits? ws cannot accept such an offer and refuses the whole handshake (400), so the upgrade
 * drops the header instead and the connection goes uncompressed. No browser sends `server_max_window_bits`.
 * @param {string | string[] | undefined} header
 */
export function narrowDeflateOffer(header) {
  if (typeof header !== 'string') return false;
  const offers = header.split(',').map((s) => s.trim()).filter((s) => /^permessage-deflate\b/i.test(s));
  if (!offers.length) return false;
  return offers.every((offer) => {
    const m = /(?:^|;)\s*server_max_window_bits\s*=\s*"?(\d+)"?/i.exec(offer);
    return !!m && Number(m[1]) < WS_DEFLATE.serverMaxWindowBits;
  });
}

/**
 * The session stack of one server.
 * @param {{ MatchClass?: Function, seedFn?: () => number, [option: string]: any }} opts startServer() options
 * @param {{ data: object, log: object }} deps the game data the lobby's matches use, the logger
 * @returns {{ registry: SessionRegistry, lobby: Lobby, network: Network }}
 */
export function createSessionStack(opts, { data, log }) {
  const netOptions = netOptionsFrom(opts);
  const registry = new SessionRegistry({ reconnectWindowMs: netOptions.reconnectWindowMs ?? NET_DEFAULTS.reconnectWindowMs });
  const lobbyOptions = lobbyOptionsFrom(opts);
  const lobby = new Lobby({ registry, log, MatchClass: opts.MatchClass, getData: () => data, seedFn: opts.seedFn, options: lobbyOptions });
  const network = new Network({ registry, handler: lobby, log, options: netOptions });
  return { registry, lobby, network };
}

/**
 * Count a socket in the traffic counters (traffic.js): its wire bytes from now until it closes, the payload of every
 * message it sends (ws.send wrapped) and receives.
 * @param {import('ws').WebSocket} ws
 * @param {import('node:http').IncomingMessage} req
 * @param {ReturnType<typeof import('./traffic.js').createTrafficCounter>} traffic
 */
function meterSocket(ws, req, traffic) {
  const socket = req.socket;
  traffic.wsOpen(socket);
  const send = ws.send;
  ws.send = function meteredSend(data, ...rest) {
    traffic.wsSent(data);
    return send.call(this, data, ...rest);
  };
  ws.on('message', (data) => traffic.wsReceived(data));
  ws.once('close', () => traffic.wsClose(socket));
}

/**
 * Serve the WebSocket endpoint /ws on `server` (its 'upgrade' event).
 * @param {import('node:http').Server} server
 * @param {{ network: Network, log: object, traffic?: ReturnType<typeof import('./traffic.js').createTrafficCounter> }} deps
 * @returns {WebSocketServer}
 */
export function attachWebSocket(server, { network, log, traffic = null }) {
  const compression = process.env.SP_WS_DEFLATE === '0' ? false : { ...WS_COMPRESSION };
  const wss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_PAYLOAD, perMessageDeflate: compression, clientTracking: false });
  wss.on('connection', (ws, req) => {
    if (traffic) meterSocket(ws, req, traffic);
    network.handleConnection(ws, req);
  });
  wss.on('error', (e) => log.error('[ws] server error', e));

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    const parts = splitUrl(req.url || '/');
    const reject = (status, text) => {
      try { socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch { socket.destroy(); }
    };
    if (!parts || parts.rawPath !== '/ws') { reject(404, 'Not Found'); return; }
    const refused = network.admission(req);
    if (refused === 'per-address') { reject(429, 'Too Many Requests'); return; }
    if (refused) { reject(503, 'Service Unavailable'); return; }
    if (narrowDeflateOffer(req.headers['sec-websocket-extensions'])) delete req.headers['sec-websocket-extensions'];
    try {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } catch (e) {
      log.error('[ws] upgrade failed', e);
      socket.destroy();
    }
  });
  return wss;
}
