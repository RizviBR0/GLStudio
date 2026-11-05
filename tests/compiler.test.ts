import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compilerArguments, LIMITS, parseDiagnostics, sourceHash, validateFiles } from '../server/compiler.js';

test('validates multi-file relative projects without modifying source', () => {
  const files = [{ path: 'src/main.cpp', content: '#include "../math.h"\nint main() {}' }, { path: 'math.h', content: '#pragma once' }];
  assert.deepEqual(validateFiles(files), files);
});

test('rejects traversal, Windows alternate streams/reserved names, aliases and unsafe paths', () => {
  for (const name of ['../main.cpp', '/main.cpp', 'C:/main.cpp', 'folder\\main.cpp', 'x/../main.cpp', './main.cpp', 'CON.cpp', 'dir./main.cpp', 'dir /main.cpp', 'main.cpp:stream', '-x.cpp', 'a//main.cpp', 'a\0.cpp']) {
    assert.throws(() => validateFiles([{ path: name, content: 'int main() {}' }]), Error, name);
  }
  assert.throws(() => validateFiles([{ path: 'main.cpp', content: '' }, { path: 'MAIN.cpp', content: '' }]));
  assert.throws(() => validateFiles([{ path: 'main.cpp', content: '' }, { path: 'main.cpp/child.cpp', content: '' }]));
});

test('bounds file counts and UTF-8 source bytes and requires a C++ translation unit', () => {
  assert.throws(() => validateFiles([]));
  assert.throws(() => validateFiles(Array.from({ length: 33 }, (_, i) => ({ path: `${i}.cpp`, content: '' }))));
  assert.throws(() => validateFiles([{ path: 'header.hpp', content: '' }]));
  assert.throws(() => validateFiles([{ path: 'main.cpp', content: 'é'.repeat(LIMITS.sourceBytes / 2 + 1) }]));
  assert.throws(() => validateFiles([{ path: 'main.cpp', content: '\0' }]));
});

test('maps exact compiler paths and includes notes without guessing system headers', () => {
  const files = [{ path: 'main.cpp', content: '' }, { path: 'src/util.cpp', content: '' }];
  const logs = 'E:\\work\\src\\main.cpp:2:3: error: unknown symbol\nE:/work/src/src/util.cpp:9:1: warning: unused value\nE:/work/src/main.cpp:1:1: note: declared here\nE:/sdk/include/other.h:7:1: error: system error';
  assert.deepEqual(parseDiagnostics(logs, files, 'E:\\work\\src'), [
    { file: 'main.cpp', line: 2, column: 3, severity: 'error', message: 'unknown symbol' },
    { file: 'src/util.cpp', line: 9, column: 1, severity: 'warning', message: 'unused value' },
    { file: 'main.cpp', line: 1, column: 1, severity: 'note', message: 'declared here' },
  ]);
});

test('content hash is stable across file ordering and changes with source', () => {
  const files = [{ path: 'main.cpp', content: 'a' }, { path: 'x.h', content: 'b' }];
  assert.equal(sourceHash(files), sourceHash([...files].reverse()));
  assert.notEqual(sourceHash(files), sourceHash([{ ...files[0], content: 'different' }, files[1]]));
});

test('fixed compilation profile uses a worker module and bounded Wasm memory', () => {
  const args = compilerArguments([{ path: 'main.cpp', content: '' }, { path: 'x.h', content: '' }], 'program.mjs');
  assert.equal(args[0], 'src/main.cpp');
  assert.ok(!args.includes('src/x.h'));
  assert.ok(args.includes('-sENVIRONMENT=worker'));
  assert.ok(args.includes('-sMAXIMUM_MEMORY=268435456'));
  assert.ok(args.includes('-sAUTO_JS_LIBRARIES=1'));
});
