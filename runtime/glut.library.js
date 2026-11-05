/* GL Studio's intentionally bounded GLUT adapter. All user callbacks run in a
 * dedicated worker. GL rendering remains Emscripten's LEGACY_GL_EMULATION.
 * GL/Browser initialization uses toolchain internals: pin and verify the SDK. */
// The pinned compiler loads WebGL before its legacy emulation only when auto
// libraries are enabled. Remove every stock GLUT symbol and its decorators
// before installing ours, so unsupported calls cannot acquire DOM behavior.
var stockGLUTSymbols = Object.keys(LibraryManager.library).filter((key) => /^glut[A-Z]/.test(key) && !key.includes('__'));
for (var key of Object.keys(LibraryManager.library)) {
  if (/^glut[A-Z]/.test(key)) delete LibraryManager.library[key];
}
addToLibrary({
  $GLStudio__deps: ['$GL', '$Browser', '$getWasmTableEntry', '$UTF8ToString', '$Asyncify'],
  $GLStudio__postset: `Module['glstudio'] = {
    'resize': (width, height) => GLStudio.resize(width, height),
    'input': (event) => GLStudio.input(event),
    'pause': (paused) => GLStudio.pause(paused),
    'capture': () => Module['canvas'].convertToBlob({type: 'image/png'}),
    'isActive': () => GLStudio.active,
    'hasWindow': () => GLStudio.created
  };`,
  $GLStudio: {
    created: false, active: false, paused: false, failed: false,
    displayMode: 0, preferredWidth: 640, preferredHeight: 480,
    display: 0, reshape: 0, idle: 0, keyboard: 0, keyboardUp: 0,
    special: 0, specialUp: 0, mouse: 0, motion: 0, passiveMotion: 0,
    dirty: true, modifiers: 0, mouseX: 0, mouseY: 0,
    timers: [], heldKeys: {}, heldButtons: {}, callbacks: {}, pendingResize: null,
    startedAt: 0, pausedAt: 0, pausedDuration: 0,
    frames: 0, metricsAt: 0, scheduled: null,

    emit(event) { Module['glstudioEvent']?.(event); },
    clock() {
      return (GLStudio.paused ? GLStudio.pausedAt : performance.now()) -
        GLStudio.startedAt - GLStudio.pausedDuration;
    },
    call(pointer, args) {
      if (!pointer || GLStudio.blocked()) return;
      if (!GLStudio.callbacks[pointer]) GLStudio.callbacks[pointer] = Asyncify.instrumentFunction(getWasmTableEntry(pointer));
      GLStudio.callbacks[pointer](...args);
    },
    blocked() { return !!(Module['glstudioInputPending'] || Asyncify.currData); },
    fail(error) {
      GLStudio.failed = true;
      GLStudio.active = false;
      GLStudio.emit({type: 'status', status: 'error', message: String(error?.message || error)});
    },
    dimensions(width, height) {
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
        throw new Error('Viewport dimensions must be positive finite numbers.');
      }
      return [Math.min(4096, Math.floor(width)), Math.min(4096, Math.floor(height))];
    },
    createWindow(title) {
      if (GLStudio.created) throw new Error('Only one GLUT window is supported.');
      if (GLStudio.displayMode & (0x0001 | 0x0004 | 0x0100 | 0x0200)) {
        throw new Error('Indexed color, accumulation, stereo and luminance GLUT display modes are unsupported.');
      }
      var canvas = Module['canvas'];
      var handle = GL.createContext(canvas, {
        majorVersion: 1, minorVersion: 0, alpha: !!(GLStudio.displayMode & 0x0008),
        depth: !!(GLStudio.displayMode & 0x0010), stencil: !!(GLStudio.displayMode & 0x0020),
        antialias: !!(GLStudio.displayMode & 0x0080),
        preserveDrawingBuffer: true, enableExtensionsByDefault: true
      });
      if (!handle || !GL.makeContextCurrent(handle)) {
        throw new Error('WebGL could not initialize. Enable browser graphics acceleration, then restart.');
      }
      Module['ctx'] = GL.getContext(handle).GLctx;
      Browser.useWebGL = true;
      // Browser.createContext would call DOM-dependent Browser.init. Only its
      // context-created hooks are required to initialize legacy GL emulation.
      Browser.moduleContextCreatedCallbacks.forEach((callback) => callback());
      GLStudio.created = true;
      GLStudio.metricsAt = performance.now();
      Module['ctx'].viewport(0, 0, canvas.width, canvas.height);
      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        GLStudio.fail('The graphics context was lost. Restart the program to recover.');
      });
      if (title) GLStudio.emit({type: 'log', level: 'info', text: 'Window: ' + UTF8ToString(title).slice(0, 160)});
      return 1;
    },
    schedule() {
      if (!GLStudio.active || GLStudio.failed) return;
      var tick = () => GLStudio.tick();
      GLStudio.scheduled = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(tick) : setTimeout(tick, 16);
    },
    tick() {
      if (!GLStudio.active || GLStudio.failed) return;
      try {
        if (!GLStudio.paused && !GLStudio.blocked()) {
          if (GLStudio.pendingResize) { var size = GLStudio.pendingResize; GLStudio.pendingResize = null; GLStudio.resize(...size); }
          var now = GLStudio.clock();
          var due = GLStudio.timers.filter((timer) => timer.at <= now);
          GLStudio.timers = GLStudio.timers.filter((timer) => timer.at > now);
          if (due.length > 256) throw new Error('Too many timer callbacks in one frame (maximum 256).');
          for (var index = 0; index < due.length; index++) {
            if (!GLStudio.active || GLStudio.blocked()) { GLStudio.timers.push(...due.slice(index)); break; }
            var timer = due[index];
            GLStudio.call(timer.callback, [timer.value]);
          }
          if (GLStudio.active) GLStudio.call(GLStudio.idle, []);
          if (GLStudio.active && !GLStudio.blocked() && GLStudio.dirty && GLStudio.display) {
            GLStudio.dirty = false;
            GLStudio.call(GLStudio.display, []);
            GLStudio.frames++;
          }
        }
        var realNow = performance.now();
        if (realNow - GLStudio.metricsAt >= 1000) {
          var canvas = Module['canvas'];
          GLStudio.emit({type: 'metrics', fps: Math.round(GLStudio.frames * 1000 / (realNow - GLStudio.metricsAt)), width: canvas.width, height: canvas.height});
          GLStudio.frames = 0;
          GLStudio.metricsAt = realNow;
        }
      } catch (error) {
        GLStudio.fail(error);
        return;
      }
      GLStudio.schedule();
    },
    resize(width, height) {
      var size = GLStudio.dimensions(width, height);
      if (GLStudio.blocked()) { GLStudio.pendingResize = size; return; }
      var canvas = Module['canvas'];
      if (canvas.width === size[0] && canvas.height === size[1]) return;
      canvas.width = size[0]; canvas.height = size[1];
      if (GLStudio.created && !GLStudio.failed) {
        if (GLStudio.reshape) GLStudio.call(GLStudio.reshape, size);
        else Module['ctx'].viewport(0, 0, size[0], size[1]);
      }
      GLStudio.dirty = true;
    },
    resetInput() {
      for (var key of Object.keys(GLStudio.heldKeys)) {
        var held = GLStudio.heldKeys[key];
        GLStudio.call(held.special ? GLStudio.specialUp : GLStudio.keyboardUp, [held.value, GLStudio.mouseX, GLStudio.mouseY]);
      }
      for (var button of Object.keys(GLStudio.heldButtons)) {
        GLStudio.call(GLStudio.mouse, [Number(button), 1, GLStudio.mouseX, GLStudio.mouseY]);
      }
      GLStudio.heldKeys = {}; GLStudio.heldButtons = {}; GLStudio.modifiers = 0;
    },
    pause(paused) {
      if (!GLStudio.active || paused === GLStudio.paused) return;
      if (paused) {
        GLStudio.resetInput();
        GLStudio.pausedAt = performance.now();
      } else {
        GLStudio.pausedDuration += performance.now() - GLStudio.pausedAt;
      }
      GLStudio.paused = paused;
      GLStudio.emit({type: 'status', status: paused ? 'paused' : 'running'});
    },
    specialKey(code) {
      var keys = {ArrowLeft: 100, ArrowUp: 101, ArrowRight: 102, ArrowDown: 103, PageUp: 104, PageDown: 105, Home: 106, End: 107, Insert: 108};
      if (Object.prototype.hasOwnProperty.call(keys, code)) return keys[code];
      if (/^F([1-9]|1[0-2])$/.test(code)) return Number(code.slice(1));
      return null;
    },
    asciiKey(key) {
      var keys = {Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Delete: 127};
      if (Object.prototype.hasOwnProperty.call(keys, key)) return keys[key];
      return key.length === 1 && key.charCodeAt(0) <= 255 ? key.charCodeAt(0) : null;
    },
    input(event) {
      if (!GLStudio.created || !GLStudio.active || GLStudio.failed || GLStudio.paused || GLStudio.blocked()) return;
      if (event.kind === 'blur') { GLStudio.resetInput(); return; }
      if (Number.isFinite(event.x)) GLStudio.mouseX = Math.trunc(event.x);
      if (Number.isFinite(event.y)) GLStudio.mouseY = Math.trunc(event.y);
      GLStudio.modifiers = (event.shiftKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.altKey ? 4 : 0);
      var x = GLStudio.mouseX, y = GLStudio.mouseY;
      try {
        if (event.kind === 'keydown' || event.kind === 'keyup') {
          var special = GLStudio.specialKey(event.code || event.key || '');
          var value = special === null ? GLStudio.asciiKey(event.key || '') : special;
          if (value === null) return;
          var down = event.kind === 'keydown';
          var key = (event.code || event.key || '').slice(0, 40);
          if (down) GLStudio.heldKeys[key] = {special: special !== null, value: value};
          else delete GLStudio.heldKeys[key];
          GLStudio.call(special !== null ? (down ? GLStudio.special : GLStudio.specialUp) : (down ? GLStudio.keyboard : GLStudio.keyboardUp), [value, x, y]);
        } else if (event.kind === 'mousedown' || event.kind === 'mouseup') {
          var button = event.button | 0;
          if (button < 0 || button > 2) return;
          var down = event.kind === 'mousedown';
          if (down) GLStudio.heldButtons[button] = true; else delete GLStudio.heldButtons[button];
          GLStudio.call(GLStudio.mouse, [button, down ? 0 : 1, x, y]);
        } else if (event.kind === 'mousemove') {
          GLStudio.call(Object.keys(GLStudio.heldButtons).length ? GLStudio.motion : GLStudio.passiveMotion, [x, y]);
        } else if (event.kind === 'wheel' && event.deltaY) {
          var button = event.deltaY < 0 ? 3 : 4;
          GLStudio.call(GLStudio.mouse, [button, 0, x, y]);
          GLStudio.call(GLStudio.mouse, [button, 1, x, y]);
        }
      } finally { GLStudio.modifiers = 0; }
    }
  },

  glVertex2d__deps: ['glVertex2f'],
  glVertex2d: (x, y) => _glVertex2f(x, y),
  glutInit__deps: ['$GLStudio'],
  glutInit: (argc, argv) => { GLStudio.startedAt = performance.now(); },
  glutInitDisplayMode__deps: ['$GLStudio'],
  glutInitDisplayMode: (mode) => { GLStudio.displayMode = mode; },
  glutInitWindowSize__deps: ['$GLStudio'],
  glutInitWindowSize: (width, height) => {
    var size = GLStudio.dimensions(width, height);
    GLStudio.preferredWidth = size[0]; GLStudio.preferredHeight = size[1];
  },
  glutInitWindowPosition: (x, y) => {},
  glutCreateWindow__deps: ['$GLStudio'],
  glutCreateWindow: (title) => GLStudio.createWindow(title),
  glutGetWindow__deps: ['$GLStudio'],
  glutGetWindow: () => GLStudio.created ? 1 : 0,
  glutSetWindow__deps: ['$GLStudio'],
  glutSetWindow: (window) => { if (window !== 1 || !GLStudio.created) throw new Error('Only GLUT window 1 is supported.'); },
  glutSetWindowTitle__deps: ['$GLStudio'],
  glutSetWindowTitle: (title) => { GLStudio.emit({type: 'log', level: 'info', text: 'Window: ' + UTF8ToString(title).slice(0, 160)}); },
  glutDestroyWindow__deps: ['glutLeaveMainLoop'],
  glutDestroyWindow: (window) => { if (window === 1) _glutLeaveMainLoop(); },
  glutDisplayFunc__deps: ['$GLStudio'], glutDisplayFunc: (callback) => { GLStudio.display = callback; },
  glutReshapeFunc__deps: ['$GLStudio'], glutReshapeFunc: (callback) => { GLStudio.reshape = callback; },
  glutIdleFunc__deps: ['$GLStudio'], glutIdleFunc: (callback) => { GLStudio.idle = callback; },
  glutKeyboardFunc__deps: ['$GLStudio'], glutKeyboardFunc: (callback) => { GLStudio.keyboard = callback; },
  glutKeyboardUpFunc__deps: ['$GLStudio'], glutKeyboardUpFunc: (callback) => { GLStudio.keyboardUp = callback; },
  glutSpecialFunc__deps: ['$GLStudio'], glutSpecialFunc: (callback) => { GLStudio.special = callback; },
  glutSpecialUpFunc__deps: ['$GLStudio'], glutSpecialUpFunc: (callback) => { GLStudio.specialUp = callback; },
  glutMouseFunc__deps: ['$GLStudio'], glutMouseFunc: (callback) => { GLStudio.mouse = callback; },
  glutMotionFunc__deps: ['$GLStudio'], glutMotionFunc: (callback) => { GLStudio.motion = callback; },
  glutPassiveMotionFunc__deps: ['$GLStudio'], glutPassiveMotionFunc: (callback) => { GLStudio.passiveMotion = callback; },
  glutTimerFunc__deps: ['$GLStudio'],
  glutTimerFunc: (milliseconds, callback, value) => {
    if (GLStudio.timers.length >= 2048) throw new Error('Too many pending GLUT timers (maximum 2048).');
    if (callback) GLStudio.timers.push({at: GLStudio.clock() + Math.max(1, milliseconds >>> 0), callback: callback, value: value});
  },
  glutPostRedisplay__deps: ['$GLStudio'], glutPostRedisplay: () => { GLStudio.dirty = true; },
  glutSwapBuffers: () => {},
  glutGetModifiers__deps: ['$GLStudio'], glutGetModifiers: () => GLStudio.modifiers,
  glutGet__deps: ['$GLStudio'],
  glutGet: (query) => {
    var canvas = Module['canvas'];
    switch (query) {
      case 100: case 101: return 0;
      case 102: case 200: return canvas.width;
      case 103: case 201: return canvas.height;
      case 104: return 32;
      case 105: return GLStudio.created ? Module['ctx'].getParameter(Module['ctx'].STENCIL_BITS) : 0;
      case 106: return GLStudio.created ? Module['ctx'].getParameter(Module['ctx'].DEPTH_BITS) : 0;
      case 115: return !!(GLStudio.displayMode & 2);
      case 116: return 1;
      case 502: return GLStudio.preferredWidth;
      case 503: return GLStudio.preferredHeight;
      case 504: return GLStudio.displayMode;
      case 700: return Math.max(0, Math.floor(GLStudio.clock()));
      default: throw new Error('Unsupported glutGet query: ' + query);
    }
  },
  glutReshapeWindow__deps: ['$GLStudio'],
  glutReshapeWindow: (width, height) => {
    GLStudio.dimensions(width, height);
    GLStudio.emit({type: 'log', level: 'warning', text: 'The IDE controls viewport size. Drag its divider to resize.'});
  },
  glutMainLoop__deps: ['$GLStudio'],
  glutMainLoop: () => {
    if (!GLStudio.created) throw new Error('Call glutCreateWindow before glutMainLoop.');
    if (!GLStudio.display) throw new Error('Register glutDisplayFunc before glutMainLoop.');
    if (GLStudio.active) throw new Error('A GLUT main loop is already running.');
    GLStudio.active = true;
    if (GLStudio.reshape) GLStudio.call(GLStudio.reshape, [Module['canvas'].width, Module['canvas'].height]);
    GLStudio.emit({type: 'status', status: 'running'});
    GLStudio.schedule();
    {{{ runtimeKeepalivePush() }}}
    throw 'unwind';
  },
  glutLeaveMainLoop__deps: ['$GLStudio'],
  glutLeaveMainLoop: () => {
    GLStudio.active = false;
    GLStudio.emit({type: 'status', status: 'stopped', message: 'Program left the GLUT event loop.'});
  },
  glutSolidCube__deps: ['glBegin', 'glEnd', 'glNormal3f', 'glVertex3f'],
  glutSolidCube: (size) => {
    var h = size / 2;
    var faces = [
      [[0,0,1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
      [[0,0,-1],[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]],
      [[1,0,0],[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],
      [[-1,0,0],[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],
      [[0,1,0],[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],
      [[0,-1,0],[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]
    ];
    _glBegin(0x0007);
    for (var face of faces) {
      _glNormal3f(...face[0]);
      for (var vertex of face.slice(1)) _glVertex3f(vertex[0]*h, vertex[1]*h, vertex[2]*h);
    }
    _glEnd();
  },
  glutWireCube__deps: ['glBegin', 'glEnd', 'glVertex3f'],
  glutWireCube: (size) => {
    var h = size / 2;
    var vertices = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
    var edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    _glBegin(0x0001);
    for (var edge of edges) for (var index of edge) { var v = vertices[index]; _glVertex3f(v[0]*h,v[1]*h,v[2]*h); }
    _glEnd();
  }
});

for (var symbol of stockGLUTSymbols) {
  if (!Object.prototype.hasOwnProperty.call(LibraryManager.library, symbol)) {
    addToLibrary({ [symbol]: new Function('throw new Error(' + JSON.stringify(symbol + ' is not supported by the GL Studio worker adapter.') + ');') });
  }
}
