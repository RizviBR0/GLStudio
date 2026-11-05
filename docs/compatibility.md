# GL Studio browser compatibility profile

GL Studio compiles real C++ into WebAssembly using Emscripten. It uses Emscripten's **incomplete legacy OpenGL emulation** and a small, explicitly bounded GLUT adapter. It is not a native desktop OpenGL/freeglut environment.

## Supported adapter surface

- One graphical canvas, `glutInit`, RGB/RGBA display modes, optional depth/stencil/alpha/multisample buffers.
- Display, reshape, idle, timer, keyboard, special-key, key-up, mouse, motion and passive-motion callbacks.
- `glutPostRedisplay`, `glutMainLoop`, `glutLeaveMainLoop`, `glutGetModifiers`, a documented subset of `glutGet`, and solid/wire cubes.
- Immediate-mode OpenGL calls, matrix transforms and GLU operations are supplied by the pinned Emscripten SDK, not implemented by the adapter. Only exercised fixtures should be considered verified.
- ASCII/Latin-1 keyboard characters and standard GLUT special keys. Text composition and arbitrary Unicode character callbacks are outside this profile.
- Line-oriented UTF-8 standard input for `std::cin`, `std::getline`, `scanf` and related libc reads. Prompts without newlines flush before input is requested. Enter submits a line; EOF closes the stream until the next run.
- An unused `#include <windows.h>` is accepted by a documented compatibility header. It declares no Win32 system APIs; code that actually calls them still receives errors.
- `glVertex2d` converts to the existing floating-point vertex path. Browser rendering retains the precision limits of that path.

All C++ execution and callbacks run inside a dedicated worker. A tight loop can be terminated by discarding that worker. Workers do not impose a hard GPU-memory/driver isolation guarantee; the browser and GPU remain shared resources.

## Intentional differences

- The IDE owns the canvas dimensions. `glutInitWindowSize` stores a preferred size; `glutInitWindowPosition` has no browser effect. `glutReshapeWindow` reports a warning and does not resize the IDE. Drag the viewport divider instead.
- Reshape and pointer coordinates use drawing-buffer pixels. The embedding UI converts CSS pointer coordinates, caps DPR at 2, and preserves aspect ratio while limiting the canvas to 2048 pixels per axis.
- An absent reshape callback produces a default `glViewport` update. A supplied reshape callback owns its projection and viewport updates.
- `glutSwapBuffers` is a compatibility no-op; the browser presents after the rendering callback. Single/double buffering is not native desktop swap control.
- Display callbacks run on demand. Idle callbacks run at most once per animation tick. Timer callbacks run on the first animation tick after their deadline; this is not a real-time timer.
- Pause suspends GLUT display, idle, timer and input callbacks. It freezes the adapter's elapsed time and timer deadlines. It cannot suspend arbitrary computation already executing. Stop terminates the worker.
- At most 2048 pending timers and 256 due timers per frame are accepted. Exceeding these limits stops the runtime with an explanation.
- Screenshots retain the drawing buffer for reliability, with a rendering-cost tradeoff. Context loss requires Restart; automatic restoration of arbitrary application state is not attempted.
- A fresh worker/canvas is required for every run. Programs cannot open native windows, access the host filesystem, or rely on desktop-specific operating-system APIs.

## Unsupported

Multiple windows/subwindows, native menus, application-requested fullscreen/positioning, game modes, stereo/indexed/accumulation display modes, GLUT fonts, sphere/teapot helpers, native extensions and arbitrary external libraries are outside the initial profile. Use the IDE's fullscreen control. Unsupported GLUT declarations either produce a specific compile-time error or are absent from the restricted header. The adapter removes all stock GLUT symbols before installing its own functions; remaining stock names become explicit unsupported errors.

The current profile is for callback-driven graphics assignments. Its stdin row feeds the running program; it is not a shell or a complete PTY with raw terminal control. A native debugger is outside the profile. Compilation success alone does not prove graphics compatibility.

Input uses Asyncify and a bounded `fd_read` bridge, keeping the worker event loop and heartbeat responsive while C++ waits. Each input request has an identifier scoped to its execution channel, and stale/duplicate replies are rejected. Input is limited to 8192 characters per submitted line. GLUT callbacks are held while a Wasm input operation is suspended to prevent reentry into the suspended stack. Stop destroys the worker and its pending read; Restart begins with no retained input.

## Toolchain coupling and evidence

The adapter uses Emscripten's internal `GL.createContext`, `GL.makeContextCurrent` and `Browser.moduleContextCreatedCallbacks` to initialize legacy rendering without DOM-dependent GLUT code. Emscripten 6.0.13 requires automatic library loading for the WebGL-before-emulation initialization order; the custom library explicitly replaces the stock GLUT surface. Toolchain updates must run the triangle and interaction fixtures plus the infinite-loop termination check before adoption.

Primary references inspected during implementation:

- [Emscripten OpenGL support](https://emscripten.org/docs/porting/multimedia_and_graphics/OpenGL-support.html)
- [Compiler settings](https://emscripten.org/docs/tools_reference/settings_reference.html)
- [Stock GLUT source](https://github.com/emscripten-core/emscripten/blob/main/src/lib/libglut.js)
- [Legacy OpenGL emulation source](https://github.com/emscripten-core/emscripten/blob/main/src/lib/libglemu.js)
- [Browser context initialization](https://github.com/emscripten-core/emscripten/blob/main/src/lib/libbrowser.js)
- [Asyncify](https://emscripten.org/docs/porting/asyncify.html)
- [Filesystem and standard I/O](https://emscripten.org/docs/api_reference/Filesystem-API.html)

These references explain the route; the repository's executed verification results are the evidence for the pinned build. Do not describe additional Emscripten APIs as tested solely because a header or symbol exists.
