import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { request } from 'node:http';
import { app } from '../server/app.js';

// Use the low-level HTTP client so Node's Fetch implementation cannot rewrite
// the Host header that these security checks deliberately exercise.
function rawFetch(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(url, options, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks).toString(), { status: res.statusCode, headers: res.headers as Record<string, string> })));
    });
    req.on('error', reject);
    req.end(options.body);
  });
}

test('local compiler enforces Host, Origin, content type, client header and source validation', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { Host: '127.0.0.1:3001', Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json', 'X-GLStudio-Client': '1' };
  const post = (overrides: Record<string, string>, body = { files: [] }) => rawFetch(`${endpoint}/api/compile`, { method: 'POST', headers: { ...headers, ...overrides }, body: JSON.stringify(body) });

  assert.equal((await post({ Host: 'attacker.test:3001' })).status, 403);
  assert.equal((await post({ Origin: 'https://attacker.test' })).status, 403);
  assert.equal((await post({ 'X-GLStudio-Client': '' })).status, 403);
  assert.equal((await post({ 'Content-Type': 'text/plain' })).status, 415);
  const invalidFiles = await post({});
  assert.equal(invalidFiles.status, 400);
  assert.match((await invalidFiles.json()).logs, /between 1 and 32/);

  const extraFlags = await rawFetch(`${endpoint}/api/compile`, { method: 'POST', headers, body: JSON.stringify({ files: [{ path: 'main.cpp', content: 'int main(){}' }], flags: ['--pre-js', 'evil.js'] }) });
  assert.equal(extraFlags.status, 400);

  const preview = await rawFetch(`${endpoint}/api/health`, { headers: { Host: 'localhost:3001', Origin: 'http://localhost:4173' } });
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('Access-Control-Allow-Origin'), 'http://localhost:4173');
  assert.equal((await preview.json()).mode, 'trusted-local');
});
