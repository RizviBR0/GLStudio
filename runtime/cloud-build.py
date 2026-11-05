"""Trusted build driver inside a disposable VM; user programs are never run."""
import base64
import json
import os
from pathlib import Path
import resource
import signal
import subprocess
import tempfile

SDK = Path('/vercel/toolchain/emsdk')
ROOT = Path.cwd()
MAX_LOG = 256 * 1024
MAX_ARTIFACT = 2 * 1024 * 1024


def restrict_child():
    os.setsid()
    resource.setrlimit(resource.RLIMIT_AS, (2 * 1024**3, 2 * 1024**3))
    resource.setrlimit(resource.RLIMIT_CPU, (90, 90))
    resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
    resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
    resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024**2, 32 * 1024**2))


def build():
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    env = {
        'PATH': '/usr/local/bin:/usr/bin:/bin',
        'HOME': '/home/compiler', 'TMPDIR': str(ROOT / 'tmp'),
        'EM_CONFIG': str(SDK / '.emscripten'),
        'EM_CACHE': str(SDK / 'upstream/emscripten/cache'),
        'EM_FROZEN_CACHE': '1', 'EMCC_CORES': '2', 'PYTHONUTF8': '1',
    }
    (ROOT / 'tmp').mkdir(exist_ok=True)
    timed_out = False
    with tempfile.TemporaryFile() as output:
        proc = subprocess.Popen(
            ['python3', str(SDK / 'upstream/emscripten/em++.py'), *manifest['arguments']],
            cwd=ROOT, env=env, stdin=subprocess.DEVNULL, stdout=output,
            stderr=subprocess.STDOUT, preexec_fn=restrict_child,
        )
        try:
            proc.wait(timeout=100)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
        output.seek(0)
        raw = output.read(MAX_LOG + 1)
    logs = raw[:MAX_LOG].decode('utf-8', errors='replace')
    if len(raw) > MAX_LOG:
        logs += '\n[Compiler output truncated at 256 KiB.]'
    if timed_out:
        logs += '\nCompilation exceeded 100 seconds and was stopped.'
    result = {'ok': proc.returncode == 0 and not timed_out, 'logs': logs}
    if result['ok']:
        js, wasm = ROOT / 'program.mjs', ROOT / 'program.wasm'
        if js.stat().st_size + wasm.stat().st_size > MAX_ARTIFACT:
            return {'ok': False, 'logs': logs + '\nCloud build artifacts exceed the 2 MiB limit.'}
        result.update(javascript=js.read_text(), wasmBase64=base64.b64encode(wasm.read_bytes()).decode())
    if len(json.dumps(result).encode()) > 3_000_000:
        return {'ok': False, 'logs': logs + '\nBuild response exceeds the cloud transport limit.'}
    return result


try:
    result = build()
except Exception as error:
    result = {'ok': False, 'logs': 'Sandbox build failed: ' + type(error).__name__}
(ROOT / 'result.json').write_text(json.dumps(result))
