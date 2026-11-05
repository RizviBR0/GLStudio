# GL Studio

A browser workspace for learning C++ computer graphics, combining a Monaco editor, a real Emscripten compiler, and an isolated WebGL viewport. It supports trusted local development and a protected Vercel deployment with disposable compiler VMs; see [cloud deployment](docs/deployment.md).

## Start locally

Prerequisites: Node.js 22.12 or newer, npm, Git, and Python 3.10 or newer. Native Windows is the currently verified compiler setup.

```sh
npm ci
npm run setup:compiler
npm run dev
```

Open **http://127.0.0.1:5173/** and click **Run code**, or press **Ctrl+Enter**. The SDK setup downloads the pinned Emscripten 6.0.13 toolchain into `.tools/emsdk`; it does not change your permanent PATH. Setup is a large one-time download. Subsequent builds use the installed toolchain.

The API binds to `127.0.0.1:3001`. Keep both services on localhost. This version uses native compilation with the current user's permissions and is intended for trusted local code. It requires a hardened compilation sandbox before accepting public submissions. See [compiler setup and security limits](docs/compiler.md).

## Current features

- C++ syntax coloring, multiple editor tabs, find/replace, bracket matching, compiler markers and clickable diagnostics.
- Source/header files in nested folders; create, rename and delete files; portable JSON project import/export.
- Real multi-file C++17 compilation to JavaScript and WebAssembly.
- One worker-owned WebGL canvas, legacy immediate-mode rendering through Emscripten, a bounded GLUT callback adapter, keyboard/mouse forwarding, animation pause/resume, hard stop and restart.
- Resizable editor/output and terminal panels, editor-only/output-only modes, fullscreen output and PNG screenshot export.
- Compiler/runtime output with bounded buffers, filtering, copy, clear and autoscroll; interactive program input for `cin`, `getline` and `scanf`.
- Dark, light and system themes, editor preferences, command palette, keyboard-accessible resize handles, and a mobile editor/output switch.
- Local autosave with quota/corruption feedback and cross-tab conflict detection. Export projects for a backup; local browser storage can be cleared or evicted.
- Triangle, DDA line drawing, and animated transformation examples.

When a program asks for input, type into the **stdin** row at the bottom of the terminal and press **Enter**. You can enter several values on one line, such as `100 100`, for chained `cin` reads. **EOF** or **Ctrl+D** closes standard input. Run again to start a fresh input stream.

Desktop GLUT programs are not universally compatible. The adapter deliberately supports a small single-window surface; native windows, GLUT menus/fonts, arbitrary libraries and source-level debugging are outside this preview. Classroom code may retain an unused `windows.h` include through a compatibility header, which exposes no Win32 system APIs. Monaco provides syntax features here, rather than a complete C++ language server. Read the [compatibility profile](docs/compatibility.md) before adapting an assignment.

## Checks

```sh
npm run typecheck
npm test
npm run verify:compiler
npm run build
npx playwright install chromium
npm run test:browser
```

The compiler smoke check performs a real multi-file GLUT build and checks source diagnostic locations. Browser checks exercise the complete editor → HTTP API → native compiler → Wasm worker → canvas path, including stopping an infinite loop.

See the [verification record](docs/verification.md) for the tested environment, graphics fixtures and remaining coverage limits.

## Structure

| Path | Responsibility |
| --- | --- |
| `src/` | React IDE, workspace persistence, Monaco and viewport controller |
| `shared/contracts.ts` | Build, diagnostic and runtime interfaces |
| `server/` | Local compilation API, validation, timeouts, artifact packaging and cleanup |
| `runtime/` | Restricted GLUT headers and the worker-compatible GLUT adapter |
| `src/runtime/` | Opaque-origin iframe bridge and dedicated worker bootstrap |
| `tests/` | API/input tests, C++ fixtures and browser integration tests |
| `scripts/` | Pinned SDK setup and compiler smoke verification |

Generated code is never executed by the server. The IDE passes build artifacts through a private message channel to a sandboxed opaque-origin iframe, which loads them in a fresh dedicated worker. The frame's content policy blocks network connections. Stop removes the runtime; a heartbeat watchdog terminates unresponsive execution after 12 seconds. Browser isolation does not provide hard GPU, JavaScript-memory or driver-level quotas.

## Next milestones

1. Expand the verified assignment corpus: Bresenham/midpoint algorithms, transformations and additional browser coverage.
2. Harden public compilation using disposable OS-isolated workers, enforceable resource limits, network restrictions, queue admission and abuse controls.
3. Add artifact caching with toolchain-aware keys and a versioned compatibility matrix.
4. Evaluate optional clangd/formatting support and richer project storage after the basic compiler/runtime contract is stable.

Accounts, cloud projects, collaboration and a remote shell are intentionally deferred.
