import type { SourceFile } from '../shared/contracts';
import { examples } from './examples';

export type Theme = 'dark' | 'light' | 'system';
export interface StudioSettings { theme: Theme; fontSize: number; minimap: boolean; wordWrap: boolean; tabSize: number }
export interface StudioLayout { sidebar: boolean; terminal: boolean; split: number; panelHeight: number; mode: 'split' | 'editor' | 'output' }
export interface Workspace { version: 1; name: string; files: SourceFile[]; activeFile: string; openFiles: string[]; settings: StudioSettings; layout: StudioLayout; updatedAt: number }
export const STORAGE_KEY = 'glstudio.workspace.v1';
export const defaultSettings: StudioSettings = { theme: 'dark', fontSize: 14, minimap: false, wordWrap: false, tabSize: 4 };
export const defaultLayout: StudioLayout = { sidebar: true, terminal: true, split: 55, panelHeight: 190, mode: 'split' };
export const defaultWorkspace = (): Workspace => ({ version: 1, name: 'Hello, triangle', files: examples[0].files.map(file => ({ ...file })), activeFile: 'main.cpp', openFiles: ['main.cpp'], settings: { ...defaultSettings }, layout: { ...defaultLayout }, updatedAt: Date.now() });

export function validPath(path: string): boolean {
    return path.length <= 120 && /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(cpp|cc|cxx|h|hpp)$/i.test(path);
}

export function parseWorkspace(value: unknown): Workspace {
    if (!value || typeof value !== 'object') throw new Error('This is not a GL Studio project.');
    const data = value as Record<string, unknown>;
    if (data.version !== 1 || !Array.isArray(data.files) || data.files.length < 1 || data.files.length > 32) throw new Error('Use a version 1 GL Studio project with 1–32 files.');
    let bytes = 0;
    const names = new Set<string>();
    const files = data.files.map((entry: unknown): SourceFile => {
        if (!entry || typeof entry !== 'object') throw new Error('Invalid project file.');
        const file = entry as Record<string, unknown>;
        if (typeof file.path !== 'string' || !validPath(file.path) || typeof file.content !== 'string') throw new Error('Project filenames must be relative C++ source or header paths.');
        const key = file.path.toLowerCase();
        if (names.has(key)) throw new Error('Project contains duplicate filenames.');
        names.add(key);
        bytes += new TextEncoder().encode(file.content).length;
        if (bytes > 1024 * 1024) throw new Error('Project source exceeds the 1 MB limit.');
        return { path: file.path, content: file.content };
    });
    const settings = (data.settings && typeof data.settings === 'object' ? data.settings : {}) as Partial<StudioSettings>;
    const layout = (data.layout && typeof data.layout === 'object' ? data.layout : {}) as Partial<StudioLayout>;
    const activeFile = typeof data.activeFile === 'string' && files.some(file => file.path === data.activeFile) ? data.activeFile : files[0].path;
    const openFiles = Array.isArray(data.openFiles) ? data.openFiles.filter((path): path is string => typeof path === 'string' && files.some(file => file.path === path)) : [activeFile];
    if (!openFiles.includes(activeFile)) openFiles.push(activeFile);
    return {
        version: 1,
        name: typeof data.name === 'string' ? data.name.slice(0, 80) : 'Untitled project', files, activeFile, openFiles: [...new Set(openFiles)],
        settings: {
            theme: ['dark', 'light', 'system'].includes(settings.theme ?? '') ? settings.theme! : 'dark',
            fontSize: typeof settings.fontSize === 'number' ? Math.max(10, Math.min(24, settings.fontSize)) : defaultSettings.fontSize,
            minimap: settings.minimap === true, wordWrap: settings.wordWrap === true,
            tabSize: [2, 4, 8].includes(settings.tabSize ?? 0) ? settings.tabSize! : 4,
        },
        layout: {
            sidebar: layout.sidebar !== false, terminal: layout.terminal !== false,
            split: typeof layout.split === 'number' ? Math.max(28, Math.min(75, layout.split)) : 55,
            panelHeight: typeof layout.panelHeight === 'number' ? Math.max(120, Math.min(400, layout.panelHeight)) : 190,
            mode: ['split', 'editor', 'output'].includes(layout.mode ?? '') ? layout.mode! : 'split',
        }, updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
    };
}

export function loadWorkspace(): { workspace: Workspace; warning?: string } {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return { workspace: stored ? parseWorkspace(JSON.parse(stored)) : defaultWorkspace() };
    } catch {
        return { workspace: defaultWorkspace(), warning: 'Local storage could not be read. Your previous saved data has not been overwritten. Export your work to keep a backup.' };
    }
}

export function saveWorkspace(workspace: Workspace): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...workspace, updatedAt: Date.now() }));
}

export function downloadProject(workspace: Workspace): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${workspace.name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() || 'project'}.glstudio.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
