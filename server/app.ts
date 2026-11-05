import express, { type ErrorRequestHandler } from 'express';
import { compileProject, CompileInputError, CompilerBusyError, CompilerUnavailableError, getCompilerHealth } from './compiler.js';
import type { BuildResult } from '../shared/contracts.js';

const HOSTS = new Set(['127.0.0.1:3001', 'localhost:3001']);
const ORIGINS = new Set(['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173', 'http://127.0.0.1:3001', 'http://localhost:3001']);
export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!HOSTS.has((req.headers.host || '').toLowerCase())) return void res.status(403).json({ message: 'Unexpected Host header. This service accepts localhost only.' });
  const origin = req.headers.origin;
  if (origin && !ORIGINS.has(origin)) return void res.status(403).json({ message: 'This origin is not allowed to use the local compiler.' });
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-GLStudio-Client');
  }
  if (req.method === 'OPTIONS') return void res.sendStatus(204);
  next();
});

app.get('/api/health', async (_req, res) => res.json(await getCompilerHealth()));
app.post('/api/compile', (req, res, next) => {
  if (req.headers['x-glstudio-client'] !== '1') return void res.status(403).json({ message: 'The local IDE client header is required.' });
  if (!req.is('application/json')) return void res.status(415).json({ message: 'Send application/json.' });
  next();
}, express.json({ limit: '2mb', strict: true }), async (req, res) => {
  const cancellation = new AbortController();
  const onClose = () => { if (!res.writableEnded) cancellation.abort(); };
  res.on('close', onClose);
  try {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || !('files' in body) || Object.keys(body).some((key) => key !== 'files')) throw new CompileInputError('The request must contain only a files array.');
    const result = await compileProject(body.files, cancellation.signal);
    if (!res.destroyed) res.json(result);
  } catch (error) {
    const status = error instanceof CompileInputError ? 400 : error instanceof CompilerBusyError ? 429 : error instanceof CompilerUnavailableError ? 503 : 500;
    if (status === 429) res.setHeader('Retry-After', '2');
    if (status === 500) console.error('Compilation service error:', error);
    const message = status === 500 ? 'The compiler service failed. Check the local server logs, then retry.' : (error as Error).message;
    const result: BuildResult = { ok: false, durationMs: 0, logs: message, diagnostics: [] };
    if (!res.destroyed) res.status(status).json(result);
  } finally {
    res.off('close', onClose);
  }
});

const errors: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error?.type === 'entity.too.large' ? 413 : 400;
  res.status(status).json({ ok: false, durationMs: 0, logs: status === 413 ? 'Request exceeds the 2 MiB JSON transport limit.' : 'Invalid JSON request.', diagnostics: [] } satisfies BuildResult);
};
app.use(errors);
app.use((_req, res) => { res.status(404).json({ message: 'Not found.' }); });

