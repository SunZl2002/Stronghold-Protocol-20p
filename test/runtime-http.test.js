import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { createStaticHandler, DATA_SHIM_JS } from '../server/http/static.js';
import { createRequestHandler } from '../server/http/routes.js';
import { pickEncoding } from '../server/http/files.js';
import { createRuntimeResolver, runtimeCacheMode } from '../public/js/runtime.js';

const log = { warn() {}, error() {}, debug() {} };
const hash = (body) => createHash('sha256').update(body).digest('hex');
const ORIGINAL_HTML = `<!doctype html><head><link rel="stylesheet" href="/css/test.css">
<script type="importmap">{"imports":{"lib":"/vendor/lib.js"}}</script>
<link rel="modulepreload" href="/js/main.js"></head>
<body><script type="module" src="/js/main.js"></script></body>`;
const FILES = {
  'public/index.html': ORIGINAL_HTML,
  'public/js/main.js': `import './child.js'; import '../../shared/core.js';\n${'// main\n'.repeat(180)}`,
  'public/js/child.js': 'export const child = true;',
  'public/css/test.css': '.app { color: green; }\n'.repeat(80),
  'public/vendor/lib.js': 'export const lib = true;\n'.repeat(80),
  'public/js/asset-cache-worker.js': 'importScripts("/vendor/lib.js");',
  'shared/core.js': 'export const core = true;',
  'sim/spec.js': 'export const sim = true;',
  'sim/nodeData.js': 'PRIVATE_NODE_ONLY',
  'data/config.json': JSON.stringify({ config: Array.from({ length: 50 }, (_, n) => ({ id: n, text: '测试配置数据' })) }),
  'public/asset-cache-sw.js': '// service worker',
  'public/assets/art.svg': '<svg>asset</svg>',
};

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sp-runtime-http-'));
  for (const [file, body] of Object.entries(FILES)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), body);
  }
  const dirs = { publicDir: path.join(root, 'public'), dataDir: path.join(root, 'data'), sharedDir: path.join(root, 'shared'),
    simDir: path.join(root, 'sim'), packsDir: path.join(root, 'packs'), log, ...options };
  const server = http.createServer(createRequestHandler({ serveStatic: createStaticHandler(dirs), log }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('sp-runtime-http-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, dirs, server, replace: () => {
    server.removeAllListeners('request'); server.on('request', createRequestHandler({ serveStatic: createStaticHandler(dirs), log }));
  } };
}

function request(server, url, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
}

const importMap = (response) => JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(response.body.toString())[1]).imports;

test('HTML pins every runtime subtree and relative ESM dependency, while keeping private/SW/assets excluded', async (t) => {
  const { server } = await fixture(t);
  const page = await request(server, '/');
  assert.equal(page.status, 200);
  assert.equal(page.headers['cache-control'], 'no-cache');
  assert.equal(page.headers['last-modified'], undefined, 'index mtime cannot validate changes in its generated map');
  const imports = importMap(page);
  for (const [url, file] of [['/js/main.js', 'public/js/main.js'], ['/js/child.js', 'public/js/child.js'],
    ['/shared/core.js', 'shared/core.js'], ['/sim/spec.js', 'sim/spec.js'], ['/css/test.css', 'public/css/test.css'],
    ['/data/config.json', 'data/config.json'], ['/vendor/lib.js', 'public/vendor/lib.js']]) {
    assert.equal(imports[url], `${url}?rv=${hash(FILES[file])}`);
    const versioned = await request(server, imports[url]);
    assert.equal(versioned.status, 200, url); assert.equal(versioned.body.toString(), FILES[file]);
    assert.match(versioned.headers['cache-control'], /31536000, immutable/);
    assert.equal((await request(server, url)).headers['cache-control'], url.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache');
  }
  assert.equal(imports.lib, imports['/vendor/lib.js']);
  const shim = await request(server, imports['/data.js']);
  assert.equal(shim.body.toString(), DATA_SHIM_JS);
  assert.match(page.body.toString(), /src="\/js\/main\.js\?rv=[a-f0-9]{64}"/);
  assert.match(page.body.toString(), /href="\/css\/test\.css\?rv=[a-f0-9]{64}"/);
  for (const url of ['/sim/nodeData.js', '/js/asset-cache-worker.js', '/asset-cache-sw.js', '/assets/art.svg']) assert.equal(imports[url], undefined);
  for (const url of ['/sim/nodeData.js', '/sim/NODEDATA.JS', '/sim/nodeData.js?rv=' + 'a'.repeat(64)]) assert.equal((await request(server, url)).status, 404);
  assert.equal((await request(server, '/asset-cache-sw.js')).headers['cache-control'], 'no-cache');
  assert.equal((await request(server, '/js/asset-cache-worker.js')).headers['cache-control'], 'no-cache');
  assert.equal((await request(server, '/assets/art.svg')).headers['cache-control'], 'public, max-age=86400');
  assert.equal((await request(server, '/data/config.json?v=unverified')).headers['cache-control'], 'no-cache');
});

test('Brotli/gzip/identity use distinct validators; HEAD, 304 and byte ranges retain exact response semantics', async (t) => {
  const { server } = await fixture(t);
  const imports = importMap(await request(server, '/'));
  for (const url of ['/js/main.js', imports['/js/main.js'], '/css/test.css', imports['/data/config.json']]) {
    const raw = await request(server, url);
    const br = await request(server, url, { headers: { 'Accept-Encoding': 'gzip, deflate, br' } });
    const gz = await request(server, url, { headers: { 'Accept-Encoding': 'br;q=0, gzip;q=0.5' } });
    assert.equal(br.headers['content-encoding'], 'br'); assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.deepEqual(brotliDecompressSync(br.body), raw.body); assert.deepEqual(gunzipSync(gz.body), raw.body);
    assert.equal(br.headers.vary, 'Accept-Encoding');
    assert.equal(Number(br.headers['content-length']), br.body.length);
    assert.notEqual(br.headers.etag, gz.headers.etag); assert.notEqual(br.headers.etag, raw.headers.etag);
    const head = await request(server, url, { method: 'HEAD', headers: { 'Accept-Encoding': 'br' } });
    assert.equal(head.body.length, 0); assert.equal(head.headers['content-length'], br.headers['content-length']);
    const cached = await request(server, url, { headers: { 'Accept-Encoding': 'br', 'If-None-Match': br.headers.etag } });
    assert.equal(cached.status, 304); assert.equal(cached.body.length, 0);
    assert.equal((await request(server, url, { headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': br.headers.etag } })).status, 200);
    const range = await request(server, url, { headers: { 'Accept-Encoding': 'br', Range: 'bytes=0-9' } });
    assert.equal(range.status, 206); assert.equal(range.headers['content-encoding'], undefined);
    assert.deepEqual(range.body, raw.body.subarray(0, 10));
    assert.equal((await request(server, url, { headers: { Range: 'bytes=9999999-' } })).status, 416);
  }
});

test('data-only updates change HTML and only that file URL after restart; stale/invalid hashes cannot serve new bytes', async (t) => {
  const { server, root, replace } = await fixture(t);
  const before = await request(server, '/'); const old = importMap(before);
  await request(server, old['/data/config.json']);
  await fs.writeFile(path.join(root, 'data/config.json'), '{"changed":true}');
  assert.equal((await request(server, old['/data/config.json'])).status, 409, 'source changed during this process');
  assert.equal((await request(server, '/data/config.json')).body.toString(), '{"changed":true}', 'old unversioned URL still revalidates');
  replace(); // a server restart takes a new catalog, just like the deployed server
  const after = await request(server, '/', { headers: { 'If-None-Match': before.headers.etag } });
  assert.equal(after.status, 200); assert.notEqual(after.headers.etag, before.headers.etag);
  const current = importMap(after);
  assert.notEqual(current['/data/config.json'], old['/data/config.json']);
  for (const key of ['/js/main.js', '/sim/spec.js', '/css/test.css']) assert.equal(current[key], old[key]);
  assert.equal((await request(server, current['/data/config.json'])).body.toString(), '{"changed":true}');
  for (const url of [old['/data/config.json'], '/js/main.js?rv=bad', '/js/main.js?rv=' + 'b'.repeat(64),
    old['/js/main.js'] + '&rv=' + 'a'.repeat(64)]) {
    const stale = await request(server, url); assert.equal(stale.status, 409); assert.equal(stale.headers['cache-control'], 'no-store');
  }
  const ims = await request(server, '/', { headers: { 'If-Modified-Since': 'Fri, 01 Jan 2100 00:00:00 GMT' } });
  assert.equal(ims.status, 200, 'a generated version map is validated only by its content ETag');
});

test('runtime-cache rollback and custom HTML retain original revalidation behavior', async (t) => {
  const { server, root, replace, dirs } = await fixture(t, { runtimeCache: false });
  assert.equal((await request(server, '/')).body.toString(), ORIGINAL_HTML);
  assert.equal((await request(server, '/js/main.js')).headers['cache-control'], 'no-cache');
  assert.equal((await request(server, '/js/main.js?rv=' + hash(FILES['public/js/main.js']))).status, 409);
  dirs.runtimeCache = true;
  await fs.writeFile(path.join(root, 'public/index.html'), '<!doctype html><p>Custom page</p>'); replace();
  assert.equal((await request(server, '/')).body.toString(), '<!doctype html><p>Custom page</p>');
});

test('twenty concurrent first-touch Brotli downloads share stable bytes and later conditional requests', async (t) => {
  const { server } = await fixture(t);
  const imports = importMap(await request(server, '/'));
  const replies = await Promise.all(Array.from({ length: 20 }, () => request(server, imports['/data/config.json'], { headers: { 'Accept-Encoding': 'br' } })));
  for (const reply of replies) {
    assert.equal(reply.status, 200); assert.equal(reply.headers.etag, replies[0].headers.etag);
    assert.deepEqual(reply.body, replies[0].body); assert.equal(brotliDecompressSync(reply.body).toString(), FILES['data/config.json']);
  }
  assert.equal((await request(server, imports['/data/config.json'], { headers: { 'Accept-Encoding': 'br', 'If-None-Match': replies[0].headers.etag } })).status, 304);
});

test('large text streams Brotli without a Content-Length and preserves the full source', async (t) => {
  const { server, root } = await fixture(t);
  const body = '// large static text\n'.repeat(450_000); // exceeds the 8 MiB compressed-buffer path
  await fs.writeFile(path.join(root, 'public/js/large.js'), body);
  const response = await request(server, '/js/large.js', { headers: { 'Accept-Encoding': 'br' } });
  assert.equal(response.status, 200); assert.equal(response.headers['content-encoding'], 'br');
  assert.equal(response.headers['content-length'], undefined); assert.equal(brotliDecompressSync(response.body).toString(), body);
});

test('encoding weights/exclusions and URL resolution honor fallback and same-origin version boundaries', () => {
  // pickEncoding is the one negotiator after the v0.2.6 merge (upstream's name; the branch's stricter rules are kept
  // inside it). Judgements kept from before the merge: a q the header states but that is not a valid weight is a
  // REFUSAL (so `br;q=bad,gzip` is gzip and `br;q=2,gzip;q=-1` is null, not brotli); an explicit `identity;q=` above
  // both codings means no compression; and a header that refuses the codings it names while naming no other leaves
  // only identity (`gzip;q=0,*;q=0.5` — the wildcard cannot re-offer a coding the header just refused, and `br` is
  // never taken from `*`). Upstream's consequence, that `*` alone is gzip, still holds.
  for (const [header, wanted] of [[undefined, null], ['gzip, br', 'br'], ['br;q=0.2,gzip;q=0.9', 'gzip'],
    ['br;q=0,gzip;q=0', null], ['gzip;q=0,*;q=0.5', null], ['br;q=bad,gzip', 'gzip'], ['x-gzip', 'gzip'],
    ['gzip;q=0.4,identity;q=1', null], ['br;q=2,gzip;q=-1', null]]) assert.equal(pickEncoding(header), wanted, header);
  assert.equal(pickEncoding('*'), 'gzip');
  assert.equal(pickEncoding('gzip, br', false), 'gzip');
  assert.equal(pickEncoding('br', false), null);
  const pinned = '/data/config.json?rv=' + 'a'.repeat(64);
  const resolve = createRuntimeResolver({ '/data/config.json': pinned, '/js/main.js': 'https://other.invalid/js/main.js?rv=' + 'b'.repeat(64) }, 'https://game.invalid/');
  assert.equal(resolve('/data/config.json'), pinned);
  assert.equal(resolve('/data/../data/config.json?lang=zh#part'), '/data/config.json?lang=zh&rv=' + 'a'.repeat(64) + '#part');
  assert.equal(resolve('https://other.invalid/data/config.json'), 'https://other.invalid/data/config.json');
  assert.equal(resolve('/js/main.js'), '/js/main.js');
  assert.equal(resolve('/api/asset-cache/catalog'), '/api/asset-cache/catalog');
  assert.equal(runtimeCacheMode(pinned), 'default'); assert.equal(runtimeCacheMode('/data/config.json?rv=bad'), 'no-cache');
});

/**
 * A stale tab must not lose every image.
 *
 * The hash segment is `~` + exactly 16 lower-case hex (shared/assetPaths.js). A page from an earlier build can ask
 * for a different length — a browser was seen requesting `~99367b3` while the running server issued
 * `~5328a27f599367b3` — and the strict rule then leaves the segment in the path, where it names a directory that does
 * not exist: a 404 for every image, which reads as a broken feature rather than a stale page (`serveStatic`'s lenient
 * retry, `stripHashLikeSegment`).
 */
test('a hash segment of the wrong length still serves the file (stale page), and only for a file that exists', async (t) => {
  const { server } = await fixture(t);
  const good = '/assets/~0123456789abcdef/art.svg';
  const short = '/assets/~0123456/art.svg';          // an older build's shorter hash
  const odd = '/assets/~abc/art.svg';

  const base = await request(server, '/assets/art.svg');
  assert.equal(base.status, 200);
  assert.equal(base.body.toString(), '<svg>asset</svg>');

  for (const [url, why] of [[good, 'a well-formed hash'], [short, 'a shorter hash'], [odd, 'an odd one']]) {
    const res = await request(server, url);
    assert.equal(res.status, 200, `${why}: ${url}`);
    assert.equal(res.body.toString(), '<svg>asset</svg>', why);
  }
  // a body reached through the lenient retry must never be cached as immutable
  assert.match(String((await request(server, short)).headers['cache-control']), /no-cache/, 'the retry is not hash-backed');

  // the retry serves the resolved file, never a guess: an absent one is still a 404
  for (const url of ['/assets/~0123456/nope.svg', '/assets/~abc/nope.svg', '/assets/nope.svg']) {
    assert.equal((await request(server, url)).status, 404, url);
  }
  // and it never walks out of the mount. Only an ENCODED `..` survives to the server (a plain one is normalised away
  // by the URL parser before the request exists), which is exactly the case the retry's segment guard must refuse.
  // The refusal is a 403 whose body is the error page — so check that no FILE CONTENT came back, not the status text.
  for (const url of ['/assets/~0123456/%2e%2e/index.html', '/assets/~abc/%2e%2e/%2e%2e/etc/passwd', '/assets/~0123456/%2e%2e%5cindex.html']) {
    const res = await request(server, url);
    assert.ok(res.status === 403 || res.status === 404 || res.status === 400, `${url} answered ${res.status}`);
    const body = res.body.toString();
    assert.ok(!body.includes('<svg>asset</svg>'), `${url} served the asset`);
    assert.ok(!body.includes('<link rel="stylesheet" href="/css/test.css">'), `${url} served the page`);
  }
  // a non-hashed root, and a segment that is not the first one, keep the old behaviour
  assert.equal((await request(server, '/data/~0123456/config.json')).status, 404);
  assert.equal((await request(server, '/assets/x/~0123456/art.svg')).status, 404);
});
