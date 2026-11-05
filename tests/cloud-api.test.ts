import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cloudCompileResponse, cloudCompilerHealth } from '../server/cloud-compiler.js';

const endpoint = 'https://gl-studio.example/api/compile';
const headers = { Origin: 'https://gl-studio.example', 'Content-Type': 'application/json', 'X-GLStudio-Client': '1' };
const post = (body: unknown, overrides: Record<string, string> = {}) => new Request(endpoint, { method: 'POST', headers: { ...headers, ...overrides }, body: JSON.stringify(body) });

test('cloud compilation rejects cross-origin, missing-client and invalid-method requests before provisioning', async () => {
  assert.equal((await cloudCompileResponse(new Request(endpoint))).status, 405);
  assert.equal((await cloudCompileResponse(post({ files: [] }, { Origin: 'https://attacker.example' }))).status, 403);
  assert.equal((await cloudCompileResponse(post({ files: [] }, { 'X-GLStudio-Client': '' }))).status, 403);
  assert.equal((await cloudCompileResponse(post({ files: [] }, { 'Content-Type': 'text/plain' }))).status, 415);
});

test('cloud compilation validates filenames and rejects custom build flags before provisioning', async () => {
  const invalid = await cloudCompileResponse(post({ files: [{ path: '../main.cpp', content: 'int main(){}' }] }));
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).logs, /Invalid source path/);
  assert.equal((await cloudCompileResponse(post({ files: [], flags: ['--pre-js', 'evil.js'] }))).status, 400);
});

test('a cloud deployment without enabled compiler infrastructure fails closed', async () => {
  const previous = process.env.GLSTUDIO_CLOUD_COMPILER_ENABLE;
  delete process.env.GLSTUDIO_CLOUD_COMPILER_ENABLE;
  try {
    assert.equal(cloudCompilerHealth().available, false);
    assert.equal(cloudCompilerHealth().mode, 'cloud-sandbox');
    const response = await cloudCompileResponse(post({ files: [{ path: 'main.cpp', content: 'int main(){}' }] }));
    assert.equal(response.status, 503);
    assert.match((await response.json()).logs, /not configured/);
  } finally {
    if (previous === undefined) delete process.env.GLSTUDIO_CLOUD_COMPILER_ENABLE;
    else process.env.GLSTUDIO_CLOUD_COMPILER_ENABLE = previous;
  }
});
