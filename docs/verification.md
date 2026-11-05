# Verification record

Verified locally on Windows on 5 November 2026 with Node 26.10.0, Emscripten 6.0.13 and Playwright Chromium 156. GPU rendering tests use Chromium's software graphics path; these are correctness checks, not hardware performance benchmarks. Firefox, Safari and physical mobile devices have not been verified.

| Check | Result and boundary exercised |
| --- | --- |
| `npm test` | 7 passing tests: source/path limits, diagnostics, stable source hashing, fixed compile profile, HTTP Host/Origin/content-type/client-header validation |
| `npm run verify:compiler` | Real three-file C++/header compilation to Wasm; a real invalid C++ program reports `main.cpp:2` |
| `npm run test:browser` | 10 passing browser tests covering the original rendering/IDE checks plus classroom line/circle/DDA input, `scanf`, UTF-8 `getline`, EOF, waiting beyond the watchdog interval and stopping a pending input read |
| `npm run build` | TypeScript and production bundling pass; Monaco remains a large lazy-loaded editor chunk |
| Built preview at port 4173 | The rendered-pixel, screenshot, pause/resume, resize and stop smoke test also passes against the production bundle |
| `npm audit` | No known dependency vulnerabilities reported by the current registry audit |

## Verified graphics surface

| Fixture | Exercised behavior |
| --- | --- |
| Welcome triangle | `glBegin`/`glEnd`, per-vertex colors, `glVertex2f`, clearing, orthographic projection, model-view matrices and reshape |
| DDA example | Real C++ line-generation loop, floating-point math, `GL_POINTS`, point size and orthographic output |
| Interaction fixture | Wire cube, depth testing, rotation, timer redisplay, mouse/keyboard callbacks, drawing-buffer coordinates, pause/resume and viewport reshape |
| Infinite loop | UI remains usable while C++ is blocked; manual Stop removes execution; missing heartbeats trigger termination after 12 seconds |
| Classroom line/circle fixture | Unused `windows.h` accepted; menu/coordinate `cin` reads wait for user input; Bresenham and midpoint-circle output render; a DDA callback variant verifies `glVertex2d` |
| Mixed standard input fixture | `scanf`, UTF-8 `getline`, prompts without newlines and EOF; input waits remain responsive beyond the watchdog interval |

Other OpenGL APIs remain subject to Emscripten's incomplete emulation and are not verified merely because their headers link. Native GLUT menus, fonts and multi-window behavior are outside the supported profile.

## Integration findings retained in the implementation

- A module-worker bootstrap failed in Chromium when created inside the opaque-origin iframe. A classic blob worker can start there and dynamically import the generated ES module from a worker-created blob. The iframe retains `sandbox="allow-scripts"` without `allow-same-origin`.
- The pinned Emscripten module requires `wasmBinary` in `INCOMING_MODULE_JS_API`, plus a `locateFile` override to avoid resolving a relative Wasm URL against a blob URL. Wasm bytes are supplied directly, and runtime network access is blocked.
- Legacy GL initialization depends on library loading order. The custom library removes stock GLUT functions/decorators and installs its bounded adapter; unimplemented stock names become explicit errors.
- Direct access from the runtime iframe to the IDE's document is denied in the browser integration test. Browser isolation does not hard-limit GPU usage or replace compiler-host isolation.
- Standard input uses an Asyncify-enabled `fd_read` bridge. Worker messages supply UTF-8 lines without weakening the iframe sandbox. Prompts flush before input requests, and suspended Wasm callbacks are protected against reentry.

The native compiler is still a trusted local developer service. These checks do not establish suitability for public untrusted compilation.
