import type { BuildResult, CompilerHealth, SourceFile } from '../shared/contracts';

export async function checkCompiler(): Promise<CompilerHealth> {
  const response = await fetch('/api/health', { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error('The local compiler service is not responding. Start it with npm run dev.');
  return response.json() as Promise<CompilerHealth>;
}

export async function compileProject(files: SourceFile[], signal?: AbortSignal): Promise<BuildResult> {
  const response = await fetch('/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GLStudio-Client': '1' },
    body: JSON.stringify({ files }), signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? result?.message ?? result?.logs ?? `Compilation request failed (${response.status}).`);
  return result as BuildResult;
}
