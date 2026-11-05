// Run with: node --import tsx scripts/verify-compiler.mjs
import assert from 'node:assert/strict';
import { compileProject, getCompilerHealth } from '../server/compiler.ts';

const health = await getCompilerHealth();
assert.equal(health.available, true, health.message);
console.log(`Compiler available: ${health.version}`);

const result = await compileProject([
  { path: 'main.cpp', content: '#include <GL/glut.h>\n#include "color.h"\nvoid display(){glClear(GL_COLOR_BUFFER_BIT);glColor3f(red(),0.7f,0.3f);glBegin(GL_TRIANGLES);glVertex2f(-0.7f,-0.7f);glVertex2f(0.7f,-0.7f);glVertex2f(0,0.7f);glEnd();glutSwapBuffers();}\nint main(int argc,char**argv){glutInit(&argc,argv);glutInitDisplayMode(GLUT_DOUBLE|GLUT_RGB);glutInitWindowSize(640,480);glutCreateWindow("Smoke test");glutDisplayFunc(display);glutMainLoop();return 0;}\n' },
  { path: 'color.h', content: 'float red();\n' },
  { path: 'color.cpp', content: '#include "color.h"\nfloat red(){return 0.2f;}\n' },
]);
assert.equal(result.ok, true, result.logs);
assert.ok(result.artifact?.javascript.includes('export default'));
const wasm = Buffer.from(result.artifact.wasmBase64, 'base64');
assert.deepEqual([...wasm.subarray(0, 4)], [0, 97, 115, 109]);
console.log(`Real multi-file GLUT build passed in ${result.durationMs} ms (${wasm.length} bytes Wasm).`);

const invalid = await compileProject([{ path: 'main.cpp', content: 'int main() {\n  unknown_function();\n}\n' }]);
assert.equal(invalid.ok, false);
assert.ok(invalid.diagnostics.some((item) => item.file === 'main.cpp' && item.line === 2 && item.severity === 'error'), invalid.logs);
console.log('Real compiler error maps to main.cpp:2.');
