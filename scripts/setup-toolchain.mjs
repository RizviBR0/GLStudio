import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdk = path.join(root, '.tools', 'emsdk');
const version = '6.0.13';
const python = process.env.GLSTUDIO_PYTHON || 'python';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, shell: false, ...options });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

try {
  await run(python, ['--version']);
  await mkdir(path.dirname(sdk), { recursive: true });
  let installed = false;
  try { installed = (await stat(path.join(sdk, 'emsdk.py'))).isFile(); } catch { /* first setup */ }
  if (!installed) await run('git', ['clone', '--depth', '1', 'https://github.com/emscripten-core/emsdk.git', sdk]);
  await run(python, [path.join(sdk, 'emsdk.py'), 'install', version]);
  // Modern emsdk activation writes its own embedded .emscripten, without --permanent.
  await run(python, [path.join(sdk, 'emsdk.py'), 'activate', version]);
  const resolvedVersion = (await readFile(path.join(sdk, 'upstream', 'emscripten', 'emscripten-version.txt'), 'utf8')).trim().replaceAll('"', '');
  if (resolvedVersion !== version) throw new Error(`Toolchain mismatch: expected ${version}, found ${resolvedVersion}`);
  await writeFile(path.join(root, '.tools', 'toolchain.json'), JSON.stringify({ version, sdk: '.tools/emsdk', installedAt: new Date().toISOString() }, null, 2) + '\n');
  await run(python, [path.join(sdk, 'upstream', 'emscripten', 'em++.py'), '--version'], { env: { ...process.env, EM_CONFIG: path.join(sdk, '.emscripten') } });
  console.log(`Emscripten ${version} ready. No permanent PATH changes were made.`);
} catch (error) {
  console.error(`Toolchain setup failed: ${error.message}`);
  process.exitCode = 1;
}
