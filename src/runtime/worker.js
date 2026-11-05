/* Trusted bootstrap. The compiled program and all callbacks stay in this worker.
 * The iframe controller owns termination, origin isolation and the watchdog. */
let program = null;
let started = false;
let stopped = false;
let logBytes = 0;
let windowBytes = 0;
let windowStart = performance.now();
let suppressed = false;
let pendingResize = null;
let inputBytes = new Uint8Array(0);
let inputEnded = false;
let inputRequestId = 0;
let pendingInput = null;
const MAX_TOTAL_LOG_BYTES = 256 * 1024;
const MAX_WINDOW_LOG_BYTES = 32 * 1024;
const MAX_LINE_LENGTH = 4096;
const encoder = new TextEncoder();
const output = {
  stdout: { bytes: [], decoder: new TextDecoder(), level: 'info' },
  stderr: { bytes: [], decoder: new TextDecoder(), level: 'error' },
};

function send(event) { self.postMessage(event); }

function log(level, value) {
  const text = String(value).slice(0, MAX_LINE_LENGTH);
  const now = performance.now();
  if (now - windowStart >= 1000) {
    windowStart = now;
    windowBytes = 0;
  }
  const bytes = encoder.encode(text).byteLength;
  if (logBytes + bytes > MAX_TOTAL_LOG_BYTES || windowBytes + bytes > MAX_WINDOW_LOG_BYTES) {
    if (!suppressed) {
      suppressed = true;
      send({ type: 'log', level: 'warning', text: 'Output limit reached. Further output may be suppressed; restart to reset the limit.' });
    }
    return;
  }
  logBytes += bytes;
  windowBytes += bytes;
  send({ type: 'log', level, text });
}

function errorMessage(error) {
  return String(error?.message || error || 'Unknown runtime failure').slice(0, 2000);
}

function flushStream(name, newline = false) {
  const stream = output[name];
  if (!stream.bytes.length && !newline) return;
  const text = stream.decoder.decode(Uint8Array.from(stream.bytes), { stream: true });
  stream.bytes = [];
  if (text || newline) log(stream.level, text);
}

function writeOutput(name, byte) {
  if (byte === null || byte === 10) { flushStream(name, byte === 10); return; }
  output[name].bytes.push(byte);
  if (output[name].bytes.length >= 4096) flushStream(name);
}

function flushOutput() {
  program?._fflush(0);
  flushStream('stdout'); flushStream('stderr');
}

function fail(error) {
  if (stopped) return;
  flushStream('stdout'); flushStream('stderr');
  stopped = true;
  send({ type: 'stdin', waiting: false, requestId: inputRequestId });
  send({ type: 'status', status: 'error', message: errorMessage(error) });
}

async function readInput(capacity) {
  if (pendingInput) throw new Error('A standard-input read is already waiting.');
  // Flush even prompts without a newline before announcing an input request.
  flushOutput();
  if (program) program.glstudioInputPending = true;
  try {
    if (!inputBytes.length && !inputEnded) {
      const requestId = ++inputRequestId;
      await new Promise(resolve => {
        pendingInput = { requestId, resolve };
        send({ type: 'stdin', waiting: true, requestId });
      });
    }
    const bytes = inputBytes.slice(0, capacity);
    inputBytes = inputBytes.slice(bytes.length);
    return bytes;
  } finally {
    if (program) program.glstudioInputPending = false;
  }
}

function dimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid viewport dimensions.');
  }
  return [Math.max(1, Math.min(4096, Math.floor(width))), Math.max(1, Math.min(4096, Math.floor(height)))];
}

function runtimeEvent(event) {
  if (event.type === 'log') log(event.level, event.text);
  else if (event.type === 'metrics') send(event);
  else if (event.type === 'status') {
    if (event.status === 'error' || event.status === 'stopped') stopped = true;
    send(event);
  }
}

async function start(message) {
  if (started) throw new Error('Restart requires a new execution worker.');
  started = true;
  if (!(message.canvas instanceof OffscreenCanvas)) throw new Error('This browser cannot provide the required worker graphics canvas.');
  if (typeof message.javascript !== 'string' || message.javascript.length > 8 * 1024 * 1024) throw new Error('Invalid program loader.');
  if (!(message.wasm instanceof ArrayBuffer) || message.wasm.byteLength > 32 * 1024 * 1024) throw new Error('Invalid WebAssembly artifact.');
  const [width, height] = dimensions(message.width, message.height);
  message.canvas.width = width;
  message.canvas.height = height;
  const url = URL.createObjectURL(new Blob([message.javascript], { type: 'text/javascript' }));
  try {
    const module = await import(/* @vite-ignore */ url);
    if (typeof module.default !== 'function') throw new Error('The build did not produce an Emscripten module factory.');
    program = await module.default({
      canvas: message.canvas,
      wasmBinary: new Uint8Array(message.wasm),
      // The binary is supplied above. Avoid resolving a relative Wasm path
      // against the generated module's non-hierarchical blob URL.
      locateFile: (path) => path,
      noInitialRun: true,
      print: (text) => log('info', text),
      printErr: (text) => log(/^warning\b/i.test(String(text)) ? 'warning' : 'error', text),
      stdout: (byte) => writeOutput('stdout', byte),
      stderr: (byte) => writeOutput('stderr', byte),
      onAbort: (reason) => fail(new Error('WebAssembly aborted: ' + reason)),
      glstudioEvent: runtimeEvent,
      glstudioReadInput: readInput,
    });
    if (pendingResize) program.glstudio?.resize(...pendingResize);
    send({ type: 'ready' });
    send({ type: 'status', status: 'running', message: 'Starting program…' });
    try {
      program.callMain([]);
      if (program.Asyncify.currData) await program.Asyncify.whenDone();
    } catch (error) {
      if (error !== 'unwind') throw error;
    }
    if (!stopped && !program.glstudio?.isActive()) {
      flushOutput();
      stopped = true;
      send({ type: 'status', status: 'stopped', message: program.glstudio?.hasWindow()
        ? 'Program finished. Register a display callback and call glutMainLoop to keep rendering.'
        : 'Program finished without creating a GLUT window.' });
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

setInterval(() => send({ type: 'heartbeat', at: performance.now() }), 1000);

self.addEventListener('error', (event) => {
  event.preventDefault();
  fail(event.error || event.message);
});
self.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  fail(event.reason);
});

self.addEventListener('message', async ({ data: message }) => {
  if (!message || typeof message !== 'object') return;
  try {
    if (message.type === 'start') {
      await start(message);
      return;
    }
    if (message.type === 'stdin' && !stopped) {
      if (!pendingInput || message.requestId !== pendingInput.requestId || typeof message.text !== 'string' || message.text.length > 8192 || typeof message.eof !== 'boolean') return;
      const bytes = encoder.encode(message.eof ? '' : message.text + '\n');
      if (bytes.length > 65536) return;
      inputBytes = bytes;
      inputEnded = message.eof;
      const pending = pendingInput;
      pendingInput = null;
      send({ type: 'stdin', waiting: false, requestId: pending.requestId });
      pending.resolve();
      return;
    }
    if (message.type === 'resize') {
      pendingResize = dimensions(message.width, message.height);
      if (!stopped) program?.glstudio?.resize(...pendingResize);
    } else if (message.type === 'input' && !stopped) {
      const event = message.event;
      if (!event || !['keydown', 'keyup', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'blur'].includes(event.kind)) return;
      program?.glstudio?.input({
        kind: event.kind,
        key: typeof event.key === 'string' ? event.key.slice(0, 40) : '',
        code: typeof event.code === 'string' ? event.code.slice(0, 40) : '',
        button: Number.isInteger(event.button) ? event.button : 0,
        x: Number.isFinite(event.x) ? Math.max(-8192, Math.min(8192, event.x)) : undefined,
        y: Number.isFinite(event.y) ? Math.max(-8192, Math.min(8192, event.y)) : undefined,
        deltaY: Number.isFinite(event.deltaY) ? Math.sign(event.deltaY) : 0,
        shiftKey: !!event.shiftKey, ctrlKey: !!event.ctrlKey, altKey: !!event.altKey,
      });
    } else if (message.type === 'pause' && !stopped) {
      program?.glstudio?.pause(!!message.paused);
    } else if (message.type === 'capture' && program?.glstudio?.hasWindow()) {
      try {
        const blob = await program.glstudio.capture();
        send({ type: 'capture', blob });
      } catch (error) {
        log('warning', 'Screenshot failed: ' + errorMessage(error));
      }
    }
  } catch (error) {
    fail(error);
  }
});
