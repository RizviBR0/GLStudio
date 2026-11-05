# Local compiler

The current compiler is a **trusted local developer tool**. It compiles C++ to browser JavaScript/WebAssembly using Emscripten 6.0.13. It is not a secure public compilation sandbox. Only compile code you trust, and keep the service bound to `127.0.0.1`.

## Setup

Install Node.js, Git, and Python 3.10 or newer, then run `npm run setup:compiler`. The script installs the official SDK into `.tools/emsdk`, activates its embedded configuration, and makes no permanent system PATH changes. Set `GLSTUDIO_PYTHON` if the setup Python executable is not named `python`. The compiler uses the SDK's bundled Python on Windows unless explicitly overridden.

The SDK is pinned to 6.0.13. Update the version in both `server/compiler.ts` and `scripts/setup-toolchain.mjs` only after running the compatibility fixtures. `.tools/toolchain.json` records the local setup.

Run `npm run dev` for the app and compiler. The compiler listens on `http://127.0.0.1:3001`; the Vite app is expected at port 5173. Run `node --import tsx scripts/verify-compiler.mjs` to verify a real multi-file GLUT compilation and compiler diagnostic mapping.

## API

- `GET /api/health` returns availability, SDK version, and the trusted-local warning.
- `POST /api/compile` accepts `{ "files": [{ "path": "main.cpp", "content": "..." }] }`, requires JSON and `X-GLStudio-Client: 1`, and returns the shared `BuildResult` contract.
- Successful builds contain JavaScript text and base64 Wasm. No generated files are served as same-origin executable resources.
- One build runs at a time. A concurrent request returns 429 with `Retry-After: 2`. Invalid input returns 400; unavailable SDK returns 503; compilation errors return a normal `ok: false` build result.

The endpoint accepts up to 32 `.cpp`, `.cc`, `.cxx`, `.h`, or `.hpp` files totaling 1 MiB of UTF-8 source. Nested relative paths are supported. Absolute paths, traversal, aliases, duplicate case-insensitive names, reserved Windows names, and NUL bytes are rejected. The JSON transport ceiling is 2 MiB. Builds have a 120-second deadline, a 256 KiB retained-log limit, and a 32 MiB combined-artifact limit. Wasm linear memory grows from 32 MiB to at most 256 MiB.

Builds use fresh temporary directories. Cancellation on client disconnection and deadlines stop the process tree; completed directories are removed after validated containment checks. Source snapshots are hashed, and diagnostics refer only to exact project filenames. Source is never executed as native code by this service.

## Compatibility

The profile uses the project's explicit GLUT subset, Emscripten legacy GL emulation, and WebGL 1. Automatic library loading preserves the pinned SDK's required initialization order. The custom library removes stock GLUT symbols and replaces unsupported stock names with errors, preventing fallback to the DOM-bound implementation. The generated module is loaded in the dedicated graphical worker. This is not general desktop GLUT/freeglut compatibility; unsupported APIs must be reported as compilation or runtime errors.

Asyncify is enabled with a 64 KiB suspension stack. `runtime/stdio.library.js` provides an asynchronous stdin read while retaining ordinary reads for other virtual filesystem descriptors. This avoids shared memory and preserves the opaque-origin runtime sandbox. Asyncify can affect compilation time, code size and runtime cost; the compatibility corpus must pass after toolchain changes. The `runtime/include/windows.h` compatibility header accepts unused classroom includes and provides no Windows system implementation.

## Security limits

Host/origin validation and the custom request header reduce cross-origin drive-by access. They do not authenticate local processes. Native compilation still runs with the current user's operating-system permissions: source can attempt absolute includes, and compiler defects or hostile workloads may affect the host. Timeouts and filename validation do not create a security boundary. There is no enforced native-process memory quota. Never expose this server via a public tunnel or bind it to a LAN interface.

A public service needs disposable isolated compiler workers, OS resource quotas, restricted filesystem and network access, queue admission and abuse controls, and stronger isolation than an ordinary Docker container alone. Runtime browser isolation is a separate boundary and does not fix compiler-host risks.

Reference: [official SDK installation](https://emscripten.org/docs/getting_started/downloads.html), [OpenGL compatibility modes](https://emscripten.org/docs/porting/multimedia_and_graphics/OpenGL-support.html).
