import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildResult, CompilerHealth, Diagnostic, SourceFile } from '../shared/contracts.js';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PINNED_EMSDK_VERSION = '6.0.13';
export const LIMITS = { files: 32, sourceBytes: 1024 * 1024, logBytes: 256 * 1024, compileMs: 120_000, artifactBytes: 32 * 1024 * 1024 } as const;
const SDK_ROOT = path.join(PROJECT_ROOT, '.tools', 'emsdk');
const BUILD_ROOT = path.join(PROJECT_ROOT, '.tools', 'builds');
const TRUST_MESSAGE = 'Trusted local developer mode. Native compilation is not a public sandbox; compile only code you trust.';
const SOURCE_EXTENSION = /\.(cpp|cc|cxx)$/i;
const FILE_EXTENSION = /\.(cpp|cc|cxx|h|hpp)$/i;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
let compiling = false;

export class CompileInputError extends Error {}
export class CompilerBusyError extends Error {}
export class CompilerUnavailableError extends Error {}

/** Validate before creating any files. There is deliberately no flags/build-script API. */
export function validateFiles(value: unknown): SourceFile[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > LIMITS.files) {
    throw new CompileInputError(`Provide between 1 and ${LIMITS.files} C++ source/header files.`);
  }
  const seen = new Set<string>();
  let bytes = 0;
  const result = value.map((item: unknown): SourceFile => {
    if (!item || typeof item !== 'object' || !('path' in item) || !('content' in item)
      || typeof item.path !== 'string' || typeof item.content !== 'string') {
      throw new CompileInputError('Each file must contain a path and text content.');
    }
    const name = item.path;
    if (!name || name.length > 180 || !/^[A-Za-z0-9_. /-]+$/.test(name)
      || name.includes('\\') || path.posix.isAbsolute(name) || !FILE_EXTENSION.test(name)) {
      throw new CompileInputError(`Invalid source path: ${name.slice(0, 180)}`);
    }
    const segments = name.split('/');
    if (segments.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part)
      || WINDOWS_RESERVED.test(part) || part.startsWith('-')) || segments.length > 12) {
      throw new CompileInputError(`Invalid source path: ${name}`);
    }
    const normalized = path.posix.normalize(name);
    const key = normalized.toLowerCase();
    if (seen.has(key)) throw new CompileInputError(`Duplicate file path: ${normalized}`);
    seen.add(key);
    if (item.content.includes('\0')) throw new CompileInputError(`NUL bytes are not allowed in ${normalized}.`);
    bytes += Buffer.byteLength(item.content, 'utf8');
    if (bytes > LIMITS.sourceBytes) throw new CompileInputError('Project source exceeds the 1 MiB limit.');
    return { path: normalized, content: item.content };
  });
  if (!result.some((file) => SOURCE_EXTENSION.test(file.path))) throw new CompileInputError('The project needs at least one .cpp, .cc, or .cxx source file.');
  // A path cannot be both a source file and another source's directory.
  for (const file of result) {
    const parts = file.path.toLowerCase().split('/');
    for (let i = 1; i < parts.length; i++) {
      if (seen.has(parts.slice(0, i).join('/'))) throw new CompileInputError('A file path conflicts with a project folder.');
    }
  }
  return result;
}

export function sourceHash(files: SourceFile[]): string {
  return createHash('sha256').update(JSON.stringify([...files].sort((a, b) => a.path.localeCompare(b.path)))).digest('hex');
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

export function parseDiagnostics(logs: string, files: SourceFile[], sourceRoot?: string): Diagnostic[] {
  const sourcePaths = new Map(files.map((file) => [file.path.toLowerCase(), file.path]));
  const normalizedRoot = sourceRoot ? sourceRoot.replaceAll('\\', '/').replace(/\/$/, '') + '/' : '';
  const result: Diagnostic[] = [];
  for (const line of stripAnsi(logs).split(/\r?\n/)) {
    const match = line.match(/^(.*?):(\d+):(\d+):\s*(fatal error|error|warning|note):\s*(.*)$/);
    if (!match) continue;
    let name = match[1].replaceAll('\\', '/');
    if (sourceRoot && name.toLowerCase().startsWith(normalizedRoot.toLowerCase())) name = name.slice(normalizedRoot.length);
    else if (name.startsWith('src/')) name = name.slice(4);
    if (name.startsWith('./')) name = name.slice(2);
    const file = sourcePaths.get(name.toLowerCase());
    // System-header errors remain in logs; never attach them to an unrelated editor file.
    if (!file) continue;
    result.push({ file, line: Number(match[2]), column: Number(match[3]), severity: match[4] === 'fatal error' ? 'error' : match[4] as Diagnostic['severity'], message: match[5] });
  }
  return result;
}

interface Toolchain { python: string; driver: string; config: string; version: string }

async function toolchain(): Promise<Toolchain> {
  const driver = path.join(SDK_ROOT, 'upstream', 'emscripten', 'em++.py');
  const config = path.join(SDK_ROOT, '.emscripten');
  const versionFile = path.join(SDK_ROOT, 'upstream', 'emscripten', 'emscripten-version.txt');
  try {
    await Promise.all([stat(driver), stat(config)]);
    const version = (await readFile(versionFile, 'utf8')).trim().replaceAll('"', '');
    if (version !== PINNED_EMSDK_VERSION) throw new Error(`Expected ${PINNED_EMSDK_VERSION}, found ${version}`);
    const bundledPython = path.join(SDK_ROOT, 'python', '3.13.3_64bit', 'python.exe');
    const python = process.env.GLSTUDIO_PYTHON || (process.platform === 'win32' ? bundledPython : 'python3');
    if (path.isAbsolute(python)) await stat(python);
    return { python, driver, config, version };
  } catch {
    throw new CompilerUnavailableError(`Emscripten ${PINNED_EMSDK_VERSION} is unavailable. Run npm run setup:compiler.`);
  }
}

export async function getCompilerHealth(): Promise<CompilerHealth> {
  try {
    const sdk = await toolchain();
    return { available: true, version: sdk.version, mode: 'trusted-local', message: TRUST_MESSAGE };
  } catch (error) {
    return { available: false, mode: 'trusted-local', message: `${(error as Error).message} ${TRUST_MESSAGE}` };
  }
}

/** No inherited application credentials are needed by the toolchain. */
function compilerEnvironment(sdk: Toolchain): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  const allowed = new Set(['path', 'systemroot', 'windir', 'comspec', 'temp', 'tmp', 'tmpdir', 'pathext', 'lang', 'lc_all', 'home', 'userprofile', 'localappdata', 'appdata']);
  for (const [key, value] of Object.entries(process.env)) if (allowed.has(key.toLowerCase())) environment[key] = value;
  environment.EM_CONFIG = sdk.config;
  environment.EM_CACHE = path.join(SDK_ROOT, 'upstream', 'emscripten', 'cache');
  environment.EMSDK = SDK_ROOT;
  environment.EMCC_CORES = '2';
  environment.PYTHONUTF8 = '1';
  return environment;
}

export function compilerArguments(files: SourceFile[], outputFile: string, runtimeRoot = path.join(PROJECT_ROOT, 'runtime')): string[] {
  const runtimePath = (name: string) => runtimeRoot.startsWith('/') ? path.posix.join(runtimeRoot, name) : path.join(runtimeRoot, name);
  return [
    ...files.filter((file) => SOURCE_EXTENSION.test(file.path)).map((file) => `src/${file.path}`),
    '-std=c++17', '-O1', '-g', '-Wall', '-Wextra', '-fno-color-diagnostics', '-fno-caret-diagnostics',
    '-fdiagnostics-absolute-paths', '-I', 'src', '-I', runtimePath('include'),
    '--js-library', runtimePath('glut.library.js'),
    '--js-library', runtimePath('stdio.library.js'),
    '-sLEGACY_GL_EMULATION=1', '-sMIN_WEBGL_VERSION=1', '-sMAX_WEBGL_VERSION=1', '-sGL_UNSAFE_OPTS=0',
    '-sAUTO_JS_LIBRARIES=1', '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=worker', '-sINVOKE_RUN=0',
    '-sASYNCIFY=1', '-sASYNCIFY_STACK_SIZE=65536',
    '-sEXPORTED_FUNCTIONS=["_main","_fflush"]',
    '-sEXPORTED_RUNTIME_METHODS=["callMain","Asyncify"]', '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=33554432',
    '-sINCOMING_MODULE_JS_API=["canvas","wasmBinary","locateFile","noInitialRun","print","printErr","stdout","stderr","onAbort"]',
    '-sMAXIMUM_MEMORY=268435456', '-sASSERTIONS=1', '-sEXIT_RUNTIME=0',
    '-o', outputFile,
  ];
}

async function stopProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', () => { child.kill(); resolve(); });
      killer.once('close', () => resolve());
    });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

async function runCompiler(sdk: Toolchain, args: string[], cwd: string, signal?: AbortSignal): Promise<{ code: number; logs: string }> {
  if (signal?.aborted) return { code: 1, logs: 'Compilation cancelled.\n' };
  return new Promise((resolve) => {
    const child = spawn(sdk.python, [sdk.driver, ...args], { cwd, env: compilerEnvironment(sdk), windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let length = 0;
    let reason = '';
    let finished = false;
    const append = (data: Buffer) => {
      if (length >= LIMITS.logBytes) return;
      const retained = data.subarray(0, LIMITS.logBytes - length);
      chunks.push(retained);
      length += retained.length;
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const cancel = () => { if (!reason) { reason = 'Compilation cancelled.'; void stopProcessTree(child); } };
    const timeout = setTimeout(() => { if (!reason) { reason = `Compilation exceeded ${LIMITS.compileMs / 1000} seconds and was stopped.`; void stopProcessTree(child); } }, LIMITS.compileMs);
    signal?.addEventListener('abort', cancel, { once: true });
    const done = (code: number, launchError?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      let logs = Buffer.concat(chunks).toString('utf8');
      if (length >= LIMITS.logBytes) logs += '\n[Compiler output truncated at 256 KiB.]\n';
      if (launchError) logs += `\nCould not start compiler: ${launchError.message}\n`;
      if (reason) logs += `\n${reason}\n`;
      resolve({ code: reason || launchError ? 1 : code, logs });
    };
    child.once('error', (error) => done(1, error));
    child.once('close', (code) => done(code ?? 1));
    if (signal?.aborted) cancel();
  });
}

async function cleanJob(jobDir: string): Promise<void> {
  const resolvedRoot = await realpath(BUILD_ROOT);
  const resolvedJob = await realpath(jobDir);
  if (path.dirname(resolvedJob) !== resolvedRoot || !path.basename(resolvedJob).startsWith('job-')) throw new Error('Refusing cleanup outside the build directory.');
  await rm(resolvedJob, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

export async function compileProject(input: unknown, signal?: AbortSignal): Promise<BuildResult> {
  const files = validateFiles(input);
  if (compiling) throw new CompilerBusyError('Another compilation is running. Wait for it to finish, or stop it before trying again.');
  compiling = true;
  const started = performance.now();
  let jobDir: string | undefined;
  try {
    const sdk = await toolchain();
    await mkdir(BUILD_ROOT, { recursive: true });
    if ((await lstat(BUILD_ROOT)).isSymbolicLink()) throw new Error('The build directory must not be a symbolic link.');
    jobDir = await mkdtemp(path.join(BUILD_ROOT, 'job-'));
    const sourceRoot = path.join(jobDir, 'src');
    await mkdir(sourceRoot);
    for (const file of files) {
      const destination = path.resolve(sourceRoot, file.path);
      if (!destination.startsWith(sourceRoot + path.sep)) throw new CompileInputError('Invalid source destination.');
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.content, { flag: 'wx', encoding: 'utf8' });
    }
    const output = path.join(jobDir, 'program.mjs');
    const compilation = await runCompiler(sdk, compilerArguments(files, output), jobDir, signal);
    const diagnostics = parseDiagnostics(compilation.logs, files, sourceRoot);
    const publicLogs = compilation.logs.replaceAll(jobDir, '<build>').replaceAll(jobDir.replaceAll('\\', '/'), '<build>').replaceAll(SDK_ROOT, '<emsdk>').replaceAll(SDK_ROOT.replaceAll('\\', '/'), '<emsdk>');
    const result: BuildResult = { ok: compilation.code === 0, durationMs: Math.round(performance.now() - started), logs: publicLogs, diagnostics };
    if (result.ok) {
      const wasmFile = path.join(jobDir, 'program.wasm');
      const sizes = await Promise.all([stat(output), stat(wasmFile)]);
      if (sizes.reduce((sum, item) => sum + item.size, 0) > LIMITS.artifactBytes) return { ...result, ok: false, logs: `${publicLogs}\nBuild artifacts exceed the 32 MiB limit.` };
      const [javascript, wasm] = await Promise.all([readFile(output, 'utf8'), readFile(wasmFile)]);
      result.artifact = { javascript, wasmBase64: wasm.toString('base64'), toolchain: `Emscripten ${sdk.version}`, buildId: randomUUID(), sourceHash: sourceHash(files) };
    }
    return result;
  } finally {
    try { if (jobDir) await cleanJob(jobDir); }
    catch (error) { console.error('Build cleanup failed:', (error as Error).message); }
    compiling = false;
  }
}
