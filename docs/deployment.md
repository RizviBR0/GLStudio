# Vercel deployment

The Vite frontend and `api/health.ts` / `api/compile.ts` deploy together. The cloud API uses the Vercel Sandbox SDK with project-scoped OIDC; no persistent service token is stored in this repository or passed to the compiler VM.

Set these production and preview environment variables before deploying:

- `GLSTUDIO_CLOUD_COMPILER_ENABLE=1`
- `GLSTUDIO_COMPILER_TEMPLATE=gl-studio-compiler-6013`

The named template must belong to the same Vercel project. It contains Emscripten 6.0.13 at `/vercel/toolchain/emsdk`, a warmed read-only toolchain cache, and a non-sudo `compiler` user with home `/home/compiler`. The initial template is created from a trusted toolchain installation, verified with the classroom fixture, then cleaned of all probe sources and outputs before snapshotting. On the first build the SDK seals an expiring baseline into a non-expiring clean snapshot. Keep this snapshot until deliberately replacing or retiring the compiler; snapshot storage incurs provider charges.

Every build creates a separate, non-persistent VM from that baseline with denied outbound network access and a 130-second lifetime. Source and adapters are uploaded only to the disposable VM. The compiler runs as `compiler` with frozen SDK caches, fixed flags, process/file/memory limits, a bounded log, and a wall timeout. The API stops the VM in `finally`; the lifetime remains the cleanup fallback. Generated programs run only in the browser's isolated runtime.

Cloud builds omit DWARF debug sections and reject oversized artifacts to fit the HTTP response limit. Compiler diagnostics retain source filenames and line numbers. Source-level debugging is not provided. The cloud API also limits source size, file count and flags; per-instance busy/rate controls are soft admission limits, not distributed abuse protection.

Preserve Vercel deployment protection for this initial deployment. An anonymous public compiler needs a separate release decision, distributed admission/budget controls and operational load testing. Do not expose the trusted-local native API to the internet.

For a release, run `npm ci`, `npm test` and `npm run build`, push the reviewed commit, and deploy that exact Git commit to the existing `gl-studio` Vercel project. Verify `/api/health`, a successful real GLUT build, invalid-code diagnostics, terminal input and rendered output. Confirm the named template points to a snapshot with no expiration after its first build, and compile a second program to check baseline reuse. Updating environment variables requires a new deployment. Removing the template or disabling project OIDC makes builds unavailable without affecting locally saved projects.
