export interface SourceFile { path: string; content: string }
export interface Diagnostic { file: string; line: number; column: number; severity: 'error' | 'warning' | 'note'; message: string }
export interface BuildArtifact { javascript: string; wasmBase64: string; toolchain: string; buildId: string; sourceHash: string }
export interface BuildResult { ok: boolean; durationMs: number; logs: string; diagnostics: Diagnostic[]; artifact?: BuildArtifact }
export interface CompilerHealth { available: boolean; version?: string; mode: 'trusted-local' | 'cloud-sandbox'; message: string }
export type RuntimeStatus = 'idle' | 'loading' | 'running' | 'paused' | 'stopped' | 'error';
export interface RuntimeLog { level: 'info' | 'error' | 'warning'; text: string }
export interface RuntimeMetrics { fps: number; width: number; height: number }
export interface RuntimeStdin { waiting: boolean; requestId: number }
