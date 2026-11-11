import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { BuildArtifact, RuntimeLog, RuntimeMetrics, RuntimeStatus, RuntimeStdin } from '../shared/contracts';
import workerSource from './runtime/worker.js?raw';
import { runtimeDocument } from './runtime/frame';

export interface ViewportHandle { capture(): void; sendInput(text: string, eof?: boolean): boolean }
interface Props {
  artifact: BuildArtifact | null;
  runKey: number;
  paused: boolean;
  onLog(log: RuntimeLog): void;
  onStatus(status: RuntimeStatus, message?: string): void;
  onMetrics?(metrics: RuntimeMetrics): void;
  onStdin?(state: RuntimeStdin): void;
}

export const Viewport = forwardRef<ViewportHandle, Props>(function Viewport(props, ref) {
  const { artifact, runKey, paused } = props;
  const host = useRef<HTMLDivElement>(null);
  const channel = useRef<MessagePort | null>(null);
  const callbacks = useRef(props);
  const stdin = useRef<RuntimeStdin>({ waiting: false, requestId: 0 });
  const [error, setError] = useState('');
  callbacks.current = props;

  useImperativeHandle(ref, () => ({
    capture: () => channel.current?.postMessage({ type: 'capture' }),
    sendInput: (text, eof = false) => {
      if (!channel.current || !stdin.current.waiting || text.length > 8192) return false;
      channel.current.postMessage({ type: 'stdin', requestId: stdin.current.requestId, text, eof });
      stdin.current = { ...stdin.current, waiting: false };
      callbacks.current.onStdin?.(stdin.current);
      return true;
    },
  }), []);

  useEffect(() => {
    setError('');
    stdin.current = { waiting: false, requestId: 0 };
    callbacks.current.onStdin?.(stdin.current);
    callbacks.current.onMetrics?.({ fps: 0, width: 0, height: 0 });
    if (!artifact || !host.current) return;
    if (typeof OffscreenCanvas === 'undefined' || !HTMLCanvasElement.prototype.transferControlToOffscreen) {
      const message = 'Graphics output requires a browser with OffscreenCanvas support.';
      setError(message); callbacks.current.onStatus('error', message); return;
    }
    callbacks.current.onStatus('loading');
    const frame = document.createElement('iframe');
    frame.title = 'Graphics output';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('allow', 'fullscreen');
    frame.referrerPolicy = 'no-referrer';
    frame.srcdoc = runtimeDocument;
    const connection = new MessageChannel();
    channel.current = connection.port1;
    let alive = true;
    let started = false;
    const timeout = window.setTimeout(() => {
      if (!alive || started) return;
      const message = 'Program startup timed out.';
      setError(message); callbacks.current.onStatus('error', message); frame.remove();
    }, 15_000);
    connection.port1.onmessage = ({ data }) => {
      if (!alive || !data || typeof data.type !== 'string') return;
      if (data.type === 'ready') {
        if (started) return;
        started = true; window.clearTimeout(timeout);
        const binary = atob(artifact.wasmBase64);
        const wasm = Uint8Array.from(binary, char => char.charCodeAt(0)).buffer;
        connection.port1.postMessage({ type: 'start', workerSource, javascript: artifact.javascript, wasm }, [wasm]);
        if (callbacks.current.paused) connection.port1.postMessage({ type: 'pause', paused: true });
      } else if (data.type === 'log' && typeof data.text === 'string') {
        callbacks.current.onLog({ level: data.level, text: data.text });
      } else if (data.type === 'status') {
        if (data.status === 'error') setError(data.message || 'Program stopped unexpectedly.');
        if (data.status === 'error' || data.status === 'stopped') {
          stdin.current = { waiting: false, requestId: 0 };
          callbacks.current.onStdin?.(stdin.current);
        }
        callbacks.current.onStatus(data.status, data.message);
      } else if (data.type === 'stdin') {
        stdin.current = { waiting: data.waiting, requestId: data.requestId };
        callbacks.current.onStdin?.(stdin.current);
      } else if (data.type === 'metrics') callbacks.current.onMetrics?.({ fps: data.fps, width: data.width, height: data.height });
      else if (data.type === 'capture' && data.blob instanceof Blob && data.blob.type === 'image/png') {
        const url = URL.createObjectURL(data.blob);
        const link = document.createElement('a'); link.href = url; link.download = 'gl-studio-output.png'; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    };
    connection.port1.start();
    frame.onload = () => frame.contentWindow?.postMessage({ type: 'glstudio:init' }, '*', [connection.port2]);
    host.current.appendChild(frame);
    return () => {
      alive = false; window.clearTimeout(timeout);
      connection.port1.postMessage({ type: 'stop' }); connection.port1.close();
      connection.port2.close(); channel.current = null; frame.remove();
    };
  }, [artifact, runKey]);

  useEffect(() => { channel.current?.postMessage({ type: 'pause', paused }); }, [paused]);

  return <>
    <div ref={host} className="graphics-runtime" />
    {error && <div className="viewport-message" role="alert">{error}</div>}
  </>;
});
