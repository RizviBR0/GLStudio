import { Sandbox, Snapshot } from '@vercel/sandbox';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { BuildResult, CompilerHealth } from '../shared/contracts.js';
import { compilerArguments, parseDiagnostics, PINNED_EMSDK_VERSION, PROJECT_ROOT, sourceHash, validateFiles, CompileInputError } from './compiler.js';

const JOB = '/home/compiler/job';
const RUNTIME_ROOT = path.join(process.env.VERCEL ? process.cwd() : PROJECT_ROOT, 'runtime');
const RUNTIME_FILES = ['glut.library.js', 'stdio.library.js', 'cloud-build.py', 'include/windows.h', 'include/GL/glut.h', 'include/GL/freeglut.h'];
let active = false;
let requests: number[] = [];

export class CloudBusyError extends Error {}
export class CloudUnavailableError extends Error {}

export function cloudCompilerHealth(): CompilerHealth {
  const available = process.env.GLSTUDIO_CLOUD_COMPILER_ENABLE === '1' && Boolean(process.env.GLSTUDIO_COMPILER_TEMPLATE || process.env.GLSTUDIO_COMPILER_SNAPSHOT);
  return {
    available, version: PINNED_EMSDK_VERSION, mode: 'cloud-sandbox',
    message: available ? 'Builds run in disposable, network-isolated compiler VMs. Deployment access is managed by Vercel.' : 'The cloud compiler toolchain is not configured yet.',
  };
}

export async function compileInSandbox(input: unknown, signal?: AbortSignal): Promise<BuildResult> {
  const files = validateFiles(input);
  if (!cloudCompilerHealth().available) throw new CloudUnavailableError('The cloud compiler is not configured.');
  const now = Date.now();
  requests = requests.filter(time => now - time < 60_000);
  if (active || requests.length >= 10) throw new CloudBusyError('The compiler is busy or this instance reached its build limit. Retry in a minute.');
  active = true; requests.push(now);
  const started = performance.now();
  let sandbox: Sandbox | undefined;
  try {
    let snapshotId = process.env.GLSTUDIO_COMPILER_SNAPSHOT;
    if (process.env.GLSTUDIO_COMPILER_TEMPLATE) {
      const template = await Sandbox.get({ name: process.env.GLSTUDIO_COMPILER_TEMPLATE, signal });
      snapshotId = template.currentSnapshotId;
      if (!snapshotId) throw new CloudUnavailableError('The compiler toolchain template is not ready yet.');
      const baseline = await Snapshot.get({ snapshotId, signal });
      if (baseline.expiresAt) {
        // Seal the clean template before any student source is uploaded. The
        // SDK supports non-expiring snapshots and keeps this named template's
        // future automatic snapshots durable as well.
        await template.update({ snapshotExpiration: 0, persistent: true }, { signal });
        const sealed = await template.snapshot({ expiration: 0, signal });
        snapshotId = sealed.snapshotId;
      }
    }
    sandbox = await Sandbox.create({
      source: { type: 'snapshot', snapshotId: snapshotId! },
      persistent: false, networkPolicy: 'deny-all', timeout: 130_000,
      resources: { vcpus: 2 }, region: 'iad1', signal,
    });
    const cancel = () => { void sandbox?.stop().catch(() => undefined); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (signal?.aborted) throw new Error('Build cancelled.');
      const user = sandbox.asUser('compiler');
      await user.mkDir(`${JOB}/src`, { signal });
      await user.mkDir(`${JOB}/runtime/include/GL`, { signal });
      const runtime = await Promise.all(RUNTIME_FILES.map(async file => ({ path: `${JOB}/runtime/${file}`, content: await readFile(path.join(RUNTIME_ROOT, file)) })));
      await user.writeFiles([
        ...runtime,
        ...files.map(file => ({ path: `${JOB}/src/${file.path}`, content: Buffer.from(file.content) })),
        // Keep compiler diagnostics, but omit DWARF from downloaded artifacts
        // so ordinary iostream programs fit Vercel's response-body limit.
        { path: `${JOB}/manifest.json`, content: Buffer.from(JSON.stringify({ arguments: [...compilerArguments(files, 'program.mjs', `${JOB}/runtime`).filter(arg => arg !== '-g'), '-g0'] })) },
      ], { signal });
      const command = await user.runCommand({ cmd: 'python3', args: [`${JOB}/runtime/cloud-build.py`], cwd: JOB, timeoutMs: 110_000, signal });
      if (command.exitCode !== 0) throw new Error('Sandbox compiler driver failed.');
      const raw = await user.readFileToBuffer({ path: `${JOB}/result.json` }, { signal });
      if (!raw || raw.length > 3_500_000) throw new Error('Invalid or oversized compiler response.');
      const output = JSON.parse(raw.toString('utf8')) as { ok: boolean; logs: string; javascript?: string; wasmBase64?: string };
      if (typeof output.ok !== 'boolean' || typeof output.logs !== 'string' || output.logs.length > 300_000) throw new Error('Invalid compiler result.');
      const logs = output.logs.replaceAll(JOB, '<build>').replaceAll('/vercel/toolchain/emsdk', '<emsdk>');
      const result: BuildResult = { ok: output.ok, logs, durationMs: Math.round(performance.now() - started), diagnostics: parseDiagnostics(output.logs, files, `${JOB}/src`) };
      if (result.ok) {
        if (typeof output.javascript !== 'string' || typeof output.wasmBase64 !== 'string') throw new Error('Missing build artifacts.');
        const wasm = Buffer.from(output.wasmBase64, 'base64');
        if (wasm.length < 4 || !wasm.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) throw new Error('Invalid Wasm artifact.');
        result.artifact = { javascript: output.javascript, wasmBase64: output.wasmBase64, buildId: randomUUID(), sourceHash: sourceHash(files), toolchain: `Emscripten ${PINNED_EMSDK_VERSION} · Vercel Sandbox` };
      }
      return result;
    } finally { signal?.removeEventListener('abort', cancel); }
  } finally {
    if (sandbox) await sandbox.stop().catch(() => { console.error('Compiler sandbox cleanup failed; session timeout remains active.'); });
    active = false;
  }
}

export async function cloudCompileResponse(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (request.method !== 'POST') return Response.json({ message: 'Use POST.' }, { status: 405, headers: { ...headers, Allow: 'POST' } });
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.get('x-glstudio-client') !== '1') {
    return Response.json({ message: 'Only same-origin IDE requests are accepted.' }, { status: 403, headers });
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return Response.json({ message: 'Send application/json.' }, { status: 415, headers });
  try {
    const body = await request.text();
    if (Buffer.byteLength(body) > 2 * 1024 * 1024) return Response.json({ message: 'Project request exceeds 2 MiB.' }, { status: 413, headers });
    let input: unknown;
    try { input = JSON.parse(body); } catch { throw new CompileInputError('Invalid JSON request.'); }
    if (!input || typeof input !== 'object' || !('files' in input) || Object.keys(input).some(key => key !== 'files')) throw new CompileInputError('The request must contain only a files array.');
    return Response.json(await compileInSandbox(input.files, request.signal), { headers });
  } catch (error) {
    const status = error instanceof CompileInputError ? 400 : error instanceof CloudBusyError ? 429 : error instanceof CloudUnavailableError ? 503 : request.signal.aborted ? 499 : 500;
    if (status === 500) console.error('Cloud compilation failed:', error instanceof Error ? error.name : 'UnknownError');
    const message = status === 500 ? 'The isolated compiler failed. Retry the build; check Vercel logs if it persists.' : error instanceof Error ? error.message : 'Compilation failed.';
    return Response.json({ ok: false, durationMs: 0, diagnostics: [], logs: message }, { status, headers: { ...headers, ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
  }
}
