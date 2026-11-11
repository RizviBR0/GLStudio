// This document has an opaque origin. Only trusted bridge code runs on its
// main thread; all generated JavaScript and Wasm stays inside its worker.
export const runtimeDocument = `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob: 'wasm-unsafe-eval'; worker-src blob:; connect-src 'none'; img-src blob: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden}
body{display:grid;place-items:center}
canvas{display:block;width:0;height:0;outline:none;touch-action:none}
canvas:focus-visible{outline:2px solid #8cdeb0;outline-offset:-2px}
</style>
</head><body><canvas width="640" height="480" tabindex="0" aria-label="Program output"></canvas><script>
(() => {
  const canvas = document.querySelector('canvas');
  let port, worker;
  let drawingWidth = canvas.width, drawingHeight = canvas.height;
  let lastHeartbeat = Date.now(), initialized = false, finished = false;
  let messageCount = 0, logBytes = 0, windowStart = Date.now(), throttled = false;
  let mouseX = 0, mouseY = 0;
  let stdinRequest = 0;
  const send = value => port && port.postMessage(value);
  const fail = message => { if (worker) worker.terminate(); worker = null; finished = true; send({ type:'status', status:'error', message }); };
  const fitCanvas = () => {
    const {clientWidth, clientHeight} = document.documentElement;
    const scale = Math.min(clientWidth / drawingWidth, clientHeight / drawingHeight);
    canvas.style.width = drawingWidth * scale + 'px';
    canvas.style.height = drawingHeight * scale + 'px';
  };
  fitCanvas();
  new ResizeObserver(fitCanvas).observe(document.documentElement);
  window.addEventListener('message', event => {
    if (event.source !== parent || initialized || event.data?.type !== 'glstudio:init' || event.ports.length !== 1) return;
    initialized = true; port = event.ports[0];
    port.onmessage = event => {
      const data = event.data;
      if (data?.type === 'start' && !worker) {
        if (typeof data.workerSource !== 'string' || typeof data.javascript !== 'string' || !(data.wasm instanceof ArrayBuffer)) return fail('Invalid runtime payload.');
        if (!canvas.transferControlToOffscreen) return fail('Graphics output requires a browser with OffscreenCanvas support.');
        try {
          const url = URL.createObjectURL(new Blob([data.workerSource], { type:'text/javascript' }));
          // A classic bootstrap works in an opaque sandbox origin; it imports
          // the generated ES module from a blob created inside the worker.
          worker = new Worker(url, { name:'GL Studio graphics runtime' });
          worker.onerror = event => { event.preventDefault(); fail(event.message || 'The program stopped unexpectedly.'); };
          worker.onmessageerror = () => fail('Could not read program output.');
          worker.onmessage = event => {
            URL.revokeObjectURL(url);
            const value = event.data;
            if (!value || typeof value.type !== 'string') return;
            const now = Date.now();
            if (now - windowStart > 1000) { windowStart=now; messageCount=0; logBytes=0; throttled=false; }
            if (++messageCount > 300) {
              if (!throttled) send({ type:'log', level:'warning', text:'Output truncated. The program is printing too quickly.' });
              throttled=true; return;
            }
            if (value.type === 'heartbeat') { lastHeartbeat = now; return; }
            if (value.type === 'log') {
              if (typeof value.text !== 'string' || logBytes > 64000) return;
              const text=value.text.slice(0,8000); logBytes+=text.length;
              send({ type:'log', level:['info','error','warning'].includes(value.level) ? value.level : 'info', text });
            } else if (value.type === 'status') {
              if (!['loading','running','paused','stopped','error'].includes(value.status)) return;
              if (value.status === 'stopped' || value.status === 'error') { finished=true; worker?.terminate(); worker=null; }
              send({ type:'status', status:value.status, message:typeof value.message === 'string' ? value.message.slice(0,4000) : undefined });
            } else if (value.type === 'metrics') {
              const {fps, width, height} = value;
              if (!Number.isFinite(fps) || ![width, height].every(size => Number.isInteger(size) && size >= 1 && size <= 2048)) return;
              if (width !== drawingWidth || height !== drawingHeight) {
                drawingWidth = width;
                drawingHeight = height;
                fitCanvas();
              }
              send({type:'metrics',fps:Math.max(0,Math.min(1000,fps)),width,height});
            } else if (value.type === 'stdin' && typeof value.waiting === 'boolean' && Number.isSafeInteger(value.requestId) && value.requestId >= 0) {
              stdinRequest = value.waiting ? value.requestId : 0;
              send({type:'stdin',waiting:value.waiting,requestId:value.requestId});
            } else if (value.type === 'capture' && value.blob instanceof Blob && value.blob.type === 'image/png' && value.blob.size <= 16777216) send({ type:'capture', blob:value.blob });
          };
          const offscreen=canvas.transferControlToOffscreen();
          lastHeartbeat=Date.now();
          worker.postMessage({type:'start',javascript:data.javascript,wasm:data.wasm,canvas:offscreen},[offscreen,data.wasm]);
        } catch(error) { fail(error instanceof Error ? error.message : 'Could not start the program.'); }
      } else if (data?.type === 'stop') { worker?.terminate(); worker=null; finished=true; send({type:'status',status:'stopped'}); }
      else if (data?.type === 'pause' && typeof data.paused === 'boolean') worker?.postMessage({type:'pause',paused:data.paused});
      else if (data?.type === 'capture') worker?.postMessage({type:'capture'});
      else if (data?.type === 'stdin' && stdinRequest > 0 && data.requestId === stdinRequest && typeof data.text === 'string' && data.text.length <= 8192 && typeof data.eof === 'boolean') {
        stdinRequest = 0;
        worker?.postMessage({type:'stdin',requestId:data.requestId,text:data.text,eof:data.eof});
      }
    };
    port.start(); send({type:'ready'});
  });
  const input = (kind,event) => {
    if (!worker) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && Number.isFinite(event.clientX)) {
      mouseX = Math.max(0, Math.min(drawingWidth - 1, Math.round((event.clientX - rect.left) * drawingWidth / rect.width)));
    }
    if (rect.height > 0 && Number.isFinite(event.clientY)) {
      mouseY = Math.max(0, Math.min(drawingHeight - 1, Math.round((event.clientY - rect.top) * drawingHeight / rect.height)));
    }
    worker.postMessage({type:'input',event:{kind,key:event.key,code:event.code,button:event.button,x:mouseX,y:mouseY,shiftKey:!!event.shiftKey,ctrlKey:!!event.ctrlKey,altKey:!!event.altKey,deltaY:event.deltaY||0}});
  };
  for (const kind of ['keydown','keyup']) canvas.addEventListener(kind,event=>{if(event.key==='Tab')return;if(event.key!=='Escape')event.preventDefault();input(kind,event)});
  canvas.addEventListener('pointerdown',event=>canvas.setPointerCapture(event.pointerId));
  canvas.addEventListener('pointercancel',()=>input('blur',{}));
  for (const kind of ['mousedown','mouseup','mousemove']) canvas.addEventListener(kind,event=>{if(kind==='mousedown')canvas.focus();input(kind,event)});
  canvas.addEventListener('wheel',event=>{event.preventDefault();input('wheel',event)},{passive:false});
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  window.addEventListener('blur',()=>input('blur',{}));
  canvas.addEventListener('blur',()=>input('blur',{}));
  setInterval(()=>{if(worker&&!finished&&Date.now()-lastHeartbeat>12000)fail('Program stopped responding for 12 seconds.');},1000);
})();
</script></body></html>`;
