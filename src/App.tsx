import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, ChevronsLeftRight, Circle, CircleAlert, CircleCheck, CircleHelp, CircleX, Code2, Command, Copy, Download, Ellipsis, Expand, FileCode2, FilePlus2, Files, Folder, FolderOpen, Keyboard, LayoutPanelLeft, LoaderCircle, Maximize2, Monitor, Moon, PanelBottom, PanelLeftClose, PanelLeftOpen, Pause, Pencil, Play, Plus, RotateCcw, Search, Settings2, Sparkles, Square, Sun, Terminal, Trash2, Upload, X } from 'lucide-react';
import type { BuildArtifact, CompilerHealth, Diagnostic, RuntimeLog, RuntimeMetrics, RuntimeStatus, RuntimeStdin, SourceFile } from '../shared/contracts';
import { checkCompiler, compileProject } from './compiler-client';
import { Viewport, type ViewportHandle } from './Viewport';
import { ProgramInput } from './components/ProgramInput';
import { examples, type Example } from './examples';
import { defaultLayout, downloadProject, loadWorkspace, parseWorkspace, saveWorkspace, STORAGE_KEY, validPath, type StudioLayout, type StudioSettings, type Workspace } from './workspace';
import './styles.css';

const CodeEditor = lazy(() => import('./editor'));
interface LogLine extends RuntimeLog { id: number; time: string }
interface Toast { message: string; tone: 'info' | 'error' | 'success' }
type DialogName = 'settings' | 'examples' | 'commands' | 'file' | 'help' | null;
const cloneFiles = (files: SourceFile[]) => files.map(file => ({ ...file }));

function IconButton({ label, children, onClick, disabled, active, className = '' }: { label: string; children: ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean; className?: string }) {
    return <button className={`icon-button ${active ? 'active' : ''} ${className}`} type="button" aria-label={label} aria-pressed={active} title={label} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
    return <dialog ref={ref} className={`studio-dialog ${className}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="dialog-heading"><h2 id={titleId}>{title}</h2><IconButton label="Close dialog" onClick={onClose}><X size={17} /></IconButton></div>
        {children}
    </dialog>;
}

function ResizeHandle({ orientation, value, min, max, onChange, container }: { orientation: 'vertical' | 'horizontal'; value: number; min: number; max: number; onChange: (value: number) => void; container: React.RefObject<HTMLDivElement | null> }) {
    const start = useRef<{ y: number; value: number } | null>(null);
    const clamp = (next: number) => Math.max(min, Math.min(max, next));
    return <div role="separator" tabIndex={0} aria-label={orientation === 'vertical' ? 'Resize editor and output' : 'Resize terminal'} aria-orientation={orientation} aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={max} className={`resize-handle ${orientation}`}
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); start.current = { y: event.clientY, value }; }}
        onPointerMove={event => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            if (orientation === 'vertical') { const rect = container.current?.getBoundingClientRect(); if (rect) onChange(clamp((event.clientX - rect.left) / rect.width * 100)); }
            else if (start.current) onChange(clamp(start.current.value + start.current.y - event.clientY));
        }}
        onPointerUp={event => { event.currentTarget.releasePointerCapture(event.pointerId); start.current = null; }}
        onKeyDown={event => { const negative = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowDown'; const positive = orientation === 'vertical' ? 'ArrowRight' : 'ArrowUp'; if (event.key === negative || event.key === positive) { event.preventDefault(); onChange(clamp(value + (event.key === positive ? 1 : -1) * (orientation === 'vertical' ? 2 : 20))); } }} />;
}

export default function App() {
    const [initial] = useState(loadWorkspace);
    const [workspace, setWorkspace] = useState<Workspace>(initial.workspace);
    const workspaceRef = useRef(workspace); workspaceRef.current = workspace;
    const [persistenceBlocked, setPersistenceBlocked] = useState(Boolean(initial.warning));
    const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>(initial.warning ? 'error' : 'saved');
    const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
    const resolvedTheme = workspace.settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : workspace.settings.theme;
    const [dialog, setDialog] = useState<DialogName>(null);
    const [menu, setMenu] = useState<'project' | 'view' | null>(null);
    const [toast, setToast] = useState<Toast | null>(initial.warning ? { message: initial.warning, tone: 'error' } : null);
    const [health, setHealth] = useState<CompilerHealth | null>(null);
    const [healthLoading, setHealthLoading] = useState(true);
    const [compiling, setCompiling] = useState(false);
    const [artifact, setArtifact] = useState<BuildArtifact | null>(null);
    const [runKey, setRunKey] = useState(0);
    const [paused, setPaused] = useState(false);
    const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>('idle');
    const [stdin, setStdin] = useState<RuntimeStdin>({ waiting: false, requestId: 0 });
    const [metrics, setMetrics] = useState<RuntimeMetrics>({ fps: 0, width: 0, height: 0 });
    const [lastBuild, setLastBuild] = useState<{ duration: number; ok: boolean } | null>(null);
    const [builtSnapshot, setBuiltSnapshot] = useState('');
    const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
    const [terminalTab, setTerminalTab] = useState<'output' | 'problems'>('output');
    const [logs, setLogs] = useState<LogLine[]>([{ id: 0, time: '', level: 'info', text: 'GL Studio is ready. Run your code to bring the canvas to life.' }]);
    const [logSearch, setLogSearch] = useState('');
    const [autoscroll, setAutoscroll] = useState(true);
    const [cursor, setCursor] = useState({ line: 1, column: 1 });
    const [jump, setJump] = useState<{ path: string; line: number; column: number; token: number }>();
    const [searchToken, setSearchToken] = useState(0);
    const [mobileView, setMobileView] = useState<'editor' | 'output'>('editor');
    const [fileName, setFileName] = useState('');
    const [renameFrom, setRenameFrom] = useState<string | null>(null);
    const [fileError, setFileError] = useState('');
    const [commandSearch, setCommandSearch] = useState('');
    const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
    const requestId = useRef(0);
    const abort = useRef<AbortController | null>(null);
    const logId = useRef(1);
    const logQueue = useRef<LogLine[]>([]);
    const logTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const logEnd = useRef<HTMLDivElement>(null);
    const viewport = useRef<ViewportHandle | null>(null);
    const outputPanel = useRef<HTMLElement | null>(null);
    const workspaceArea = useRef<HTMLDivElement>(null);
    const importInput = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const currentFile = workspace.files.find(file => file.path === workspace.activeFile) ?? workspace.files[0];
    const errors = diagnostics.filter(diagnostic => diagnostic.severity === 'error').length;
    const warnings = diagnostics.filter(diagnostic => diagnostic.severity === 'warning').length;
    const sourceChanged = Boolean(artifact && builtSnapshot !== JSON.stringify(workspace.files));
    const active = runtimeStatus === 'running' || runtimeStatus === 'paused' || runtimeStatus === 'loading';

    const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => setToast({ message, tone }), []);
    const pushLog = useCallback((log: RuntimeLog) => {
        logQueue.current.push({ ...log, text: log.text.length > 12000 ? log.text.slice(0, 12000) + '\n[Output truncated after 12,000 characters.]' : log.text, id: logId.current++, time: new Date().toLocaleTimeString([], { hour12: false }) });
        if (logQueue.current.length > 100) logQueue.current.splice(0, logQueue.current.length - 100);
        if (!logTimer.current) logTimer.current = setTimeout(() => { const batch = logQueue.current.splice(0); setLogs(previous => [...previous, ...batch].slice(-300)); logTimer.current = null; }, 60);
    }, []);
    const updateSettings = useCallback((settings: Partial<StudioSettings>) => setWorkspace(previous => ({ ...previous, settings: { ...previous.settings, ...settings } })), []);
    const updateLayout = useCallback((layout: Partial<StudioLayout>) => setWorkspace(previous => ({ ...previous, layout: { ...previous.layout, ...layout } })), []);
    const refreshHealth = useCallback(async () => {
        setHealthLoading(true);
        try { setHealth(await checkCompiler()); }
        catch { setHealth({ available: false, mode: 'trusted-local', message: 'The local compiler service is not reachable. Start the development server and try again.' }); }
        finally { setHealthLoading(false); }
    }, []);
    const stop = useCallback(() => {
        requestId.current++;
        abort.current?.abort(); abort.current = null;
        setCompiling(false); setArtifact(null); setPaused(false); setRuntimeStatus('stopped');
        pushLog({ level: 'info', text: 'Execution stopped.' });
    }, [pushLog]);
    const run = useCallback(async () => {
        if (!health?.available) { notify(health?.message ?? 'Checking the compiler. Please try again in a moment.', 'error'); return; }
        abort.current?.abort();
        const controller = new AbortController(); abort.current = controller;
        const token = ++requestId.current;
        const files = cloneFiles(workspaceRef.current.files);
        const snapshot = JSON.stringify(files);
        setCompiling(true); setArtifact(null); setPaused(false); setRuntimeStatus('loading'); setDiagnostics([]); setLastBuild(null);
        updateLayout({ terminal: true }); setTerminalTab('output');
        pushLog({ level: 'info', text: `Building ${files.length} source ${files.length === 1 ? 'file' : 'files'} · C++17 · WebAssembly` });
        try {
            const result = await compileProject(files, controller.signal);
            if (token !== requestId.current) return;
            setLastBuild({ duration: result.durationMs, ok: result.ok });
            if (result.logs.trim()) pushLog({ level: result.ok ? 'info' : 'error', text: result.logs });
            if (snapshot !== JSON.stringify(workspaceRef.current.files)) {
                setRuntimeStatus('idle'); pushLog({ level: 'warning', text: 'The source changed while compiling. Run again to build the current version.' });
                notify('Source changed during the build. Run again to use your latest edits.'); return;
            }
            setDiagnostics(result.diagnostics);
            if (result.ok && result.artifact) {
                setBuiltSnapshot(snapshot); setArtifact(result.artifact); setRunKey(previous => previous + 1);
                pushLog({ level: 'info', text: `Build finished in ${(result.durationMs / 1000).toFixed(2)}s. Starting isolated runtime…` });
            } else {
                setRuntimeStatus('error'); setTerminalTab(result.diagnostics.length ? 'problems' : 'output');
                pushLog({ level: 'error', text: 'Build failed. Review the diagnostics below, make a change, and try again.' });
            }
        } catch (error) {
            if (token !== requestId.current || controller.signal.aborted) return;
            const message = error instanceof Error ? error.message : 'Compilation failed unexpectedly.';
            setRuntimeStatus('error'); pushLog({ level: 'error', text: message }); notify(message, 'error');
        } finally { if (token === requestId.current) { setCompiling(false); abort.current = null; } }
    }, [health, notify, pushLog, updateLayout]);
    const openFile = useCallback((path: string) => setWorkspace(previous => ({ ...previous, activeFile: path, openFiles: previous.openFiles.includes(path) ? previous.openFiles : [...previous.openFiles, path] })), []);
    const closeFile = (path: string) => setWorkspace(previous => {
        const openFiles = previous.openFiles.filter(file => file !== path);
        if (!openFiles.length) return previous;
        return { ...previous, openFiles, activeFile: previous.activeFile === path ? openFiles[openFiles.length - 1] : previous.activeFile };
    });
    const changeSource = useCallback((content: string) => {
        setWorkspace(previous => ({ ...previous, files: previous.files.map(file => file.path === previous.activeFile ? { ...file, content } : file) }));
        setDiagnostics([]);
    }, []);
    const goToDiagnostic = (diagnostic: Diagnostic) => {
        if (!workspace.files.some(file => file.path === diagnostic.file)) { notify('This diagnostic refers to a toolchain file outside your project.'); return; }
        openFile(diagnostic.file); updateLayout({ mode: 'split' }); setMobileView('editor');
        setJump({ path: diagnostic.file, line: diagnostic.line, column: diagnostic.column || 1, token: Date.now() });
    };
    const openFileDialog = (path?: string) => { setRenameFrom(path ?? null); setFileName(path ?? ''); setFileError(''); setDialog('file'); setMenu(null); };
    const submitFile = () => {
        const path = fileName.trim();
        if (!validPath(path)) { setFileError('Use a relative path such as main.cpp or include/shapes.h. Letters, numbers, _ and - are supported.'); return; }
        if (workspace.files.some(file => file.path !== renameFrom && file.path.toLowerCase() === path.toLowerCase())) { setFileError('A file with this name already exists.'); return; }
        if (!renameFrom && workspace.files.length >= 32) { setFileError('This workspace supports up to 32 files.'); return; }
        setWorkspace(previous => ({ ...previous,
            files: renameFrom ? previous.files.map(file => file.path === renameFrom ? { ...file, path } : file) : [...previous.files, { path, content: path.match(/\.(h|hpp)$/i) ? '#pragma once\n\n' : '// Add your C++ code here.\n' }],
            openFiles: renameFrom ? previous.openFiles.map(file => file === renameFrom ? path : file) : [...previous.openFiles, path], activeFile: path,
        }));
        setDiagnostics([]); setDialog(null);
    };
    const deleteFile = () => {
        if (!renameFrom || workspace.files.length <= 1) return;
        if (!window.confirm(`Delete ${renameFrom}? Export your project first if you need a backup.`)) return;
        setWorkspace(previous => {
            const files = previous.files.filter(file => file.path !== renameFrom);
            const openFiles = previous.openFiles.filter(file => file !== renameFrom);
            const activeFile = previous.activeFile === renameFrom ? files[0].path : previous.activeFile;
            return { ...previous, files, activeFile, openFiles: openFiles.includes(activeFile) ? openFiles : [...openFiles, activeFile] };
        }); setDiagnostics([]); setDialog(null);
    };
    const loadExample = (example: Example) => {
        if (!window.confirm(`Open “${example.name}”? This replaces the current project. Export your project first to keep a separate copy.`)) return;
        stop(); setWorkspace(previous => ({ ...previous, name: example.name, files: cloneFiles(example.files), activeFile: example.files[0].path, openFiles: example.files.map(file => file.path) }));
        setDiagnostics([]); setLastBuild(null); setDialog(null); setMobileView('editor'); notify(`${example.name} is ready to explore.`);
    };
    const exportProject = () => { downloadProject(workspaceRef.current); notify('Project exported. Keep the file as your backup.', 'success'); setMenu(null); };
    const importProject = async (file: File) => {
        if (file.size > 2 * 1024 * 1024) { notify('Project imports are limited to 2 MB.', 'error'); return; }
        try {
            const imported = parseWorkspace(JSON.parse(await file.text()));
            if (!window.confirm(`Open “${imported.name}”? This replaces the current project. Export your work first if needed.`)) return;
            stop(); setWorkspace(imported); setDiagnostics([]); setLastBuild(null); notify('Project imported.', 'success');
        } catch (error) { notify(error instanceof Error ? error.message : 'Could not import this project.', 'error'); }
    };
    const handleRuntimeStatus = useCallback((status: RuntimeStatus, message?: string) => {
        setRuntimeStatus(status);
        if (message && status === 'error') pushLog({ level: 'error', text: message });
    }, [pushLog]);
    const handleStdin = useCallback((state: RuntimeStdin) => {
        setStdin(state);
        if (state.waiting) { updateLayout({ terminal: true }); setTerminalTab('output'); }
    }, [updateLayout]);
    const sendInput = useCallback((text: string, eof: boolean) => {
        if (!viewport.current?.sendInput(text, eof)) return false;
        pushLog({ level: 'info', text: eof ? '› [end of input]' : `› ${text}` });
        return true;
    }, [pushLog]);
    const fullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await outputPanel.current?.requestFullscreen(); } catch { notify('Fullscreen is not available in this browser.', 'error'); } };

    useEffect(() => { void refreshHealth(); }, [refreshHealth]);
    useEffect(() => {
        const query = window.matchMedia('(prefers-color-scheme: dark)'); const handler = () => setSystemDark(query.matches);
        query.addEventListener('change', handler); return () => query.removeEventListener('change', handler);
    }, []);
    useEffect(() => { document.documentElement.dataset.theme = resolvedTheme; document.documentElement.style.colorScheme = resolvedTheme; }, [resolvedTheme]);
    useEffect(() => {
        if (persistenceBlocked) return;
        setSaveState('saving');
        const timer = setTimeout(() => {
            try { saveWorkspace(workspace); setSaveState('saved'); }
            catch { setSaveState('error'); setPersistenceBlocked(true); notify('Local storage is full or unavailable. Export your project now to keep your code.', 'error'); }
        }, 600);
        return () => clearTimeout(timer);
    }, [workspace, persistenceBlocked, notify]);
    useEffect(() => {
        const onHidden = () => { if (document.visibilityState === 'hidden' && !persistenceBlocked) { try { saveWorkspace(workspaceRef.current); } catch { /* UI reports on next ordinary save. */ } } };
        const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY && event.newValue) { setPersistenceBlocked(true); setSaveState('error'); notify('Another tab updated this project. Autosave is paused here; export this version before refreshing.', 'error'); } };
        document.addEventListener('visibilitychange', onHidden); window.addEventListener('storage', onStorage);
        return () => { document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('storage', onStorage); };
    }, [persistenceBlocked, notify]);
    useEffect(() => { if (autoscroll) logEnd.current?.scrollIntoView({ block: 'end' }); }, [logs, autoscroll, terminalTab]);
    useEffect(() => { if (!toast || toast.tone === 'error') return; const timer = setTimeout(() => setToast(null), 6500); return () => clearTimeout(timer); }, [toast]);
    useEffect(() => {
        if (!menu) return;
        const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
        document.addEventListener('pointerdown', dismiss); return () => document.removeEventListener('pointerdown', dismiss);
    }, [menu]);
    useEffect(() => () => { abort.current?.abort(); if (logTimer.current) clearTimeout(logTimer.current); }, []);
    const actions = useRef({ run, stop, exportProject, updateLayout }); actions.current = { run, stop, exportProject, updateLayout };
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const mod = event.ctrlKey || event.metaKey;
            if (!mod) return;
            if (event.shiftKey && event.key.toLowerCase() === 'p') { event.preventDefault(); setCommandSearch(''); setDialog(previous => previous === 'commands' ? null : 'commands'); return; }
            if (document.querySelector('dialog[open]')) return;
            if (event.key === 'Enter') { event.preventDefault(); void actions.current.run(); }
            else if (event.key.toLowerCase() === 'b') { event.preventDefault(); actions.current.updateLayout({ sidebar: !workspaceRef.current.layout.sidebar }); }
            else if (event.key.toLowerCase() === 'j') { event.preventDefault(); actions.current.updateLayout({ terminal: !workspaceRef.current.layout.terminal }); }
            else if (event.key.toLowerCase() === 's') { event.preventDefault(); actions.current.exportProject(); }
        };
        window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
    }, []);

    const commands = [
        { name: 'Run project', detail: 'Compile and run the current source', shortcut: 'Ctrl ↵', icon: Play, action: () => void run() },
        { name: 'Stop execution', detail: 'Terminate the active runtime', shortcut: '', icon: Square, action: stop },
        { name: 'New file', detail: 'Add a C++ source or header', shortcut: '', icon: FilePlus2, action: () => openFileDialog() },
        { name: 'Open examples', detail: 'Start with a graphics exercise', shortcut: '', icon: BookOpen, action: () => setDialog('examples') },
        { name: 'Find in editor', detail: 'Search and replace in the active file', shortcut: 'Ctrl F', icon: Search, action: () => { setMobileView('editor'); updateLayout({ mode: 'split' }); setSearchToken(previous => previous + 1); } },
        { name: 'Export project', detail: 'Save a portable backup', shortcut: 'Ctrl S', icon: Download, action: exportProject },
        { name: 'Import project', detail: 'Open a .glstudio.json file', shortcut: '', icon: Upload, action: () => importInput.current?.click() },
        { name: 'Toggle sidebar', detail: 'Show or hide the explorer', shortcut: 'Ctrl B', icon: PanelLeftOpen, action: () => updateLayout({ sidebar: !workspace.layout.sidebar }) },
        { name: 'Toggle terminal', detail: 'Show or hide build output', shortcut: 'Ctrl J', icon: PanelBottom, action: () => updateLayout({ terminal: !workspace.layout.terminal }) },
        { name: 'Reset layout', detail: 'Restore the default workspace', shortcut: '', icon: LayoutPanelLeft, action: () => updateLayout({ ...defaultLayout }) },
        { name: 'Settings', detail: 'Theme and editor preferences', shortcut: '', icon: Settings2, action: () => setDialog('settings') },
    ];
    const fileEntries: ReactNode[] = [];
    const displayedFolders = new Set<string>();
    for (const file of [...workspace.files].sort((a, b) => a.path.localeCompare(b.path))) {
        const parts = file.path.split('/');
        let hidden = false;
        for (let index = 0; index < parts.length - 1; index++) {
            const path = parts.slice(0, index + 1).join('/');
            if (!displayedFolders.has(path) && !hidden) {
                displayedFolders.add(path);
                const collapsed = collapsedFolders.has(path);
                fileEntries.push(<button key={`folder:${path}`} className="tree-folder" style={{ paddingLeft: 17 + index * 12 }} onClick={() => setCollapsedFolders(previous => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next; })} aria-expanded={!collapsed}>{collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<Folder size={15} /><span>{parts[index]}</span></button>);
            }
            if (collapsedFolders.has(path)) hidden = true;
        }
        if (!hidden) fileEntries.push(<div key={file.path} className={`tree-file ${file.path === workspace.activeFile ? 'selected' : ''}`}>
            <button style={{ paddingLeft: 27 + (parts.length - 1) * 12 }} className="tree-file-main" onClick={() => { openFile(file.path); setMobileView('editor'); }} title={file.path}><span className="cpp-file-icon">C<span>++</span></span><span>{parts[parts.length - 1]}</span></button>
            <IconButton label={`Rename or delete ${file.path}`} onClick={() => openFileDialog(file.path)}><Ellipsis size={15} /></IconButton>
        </div>);
    }
    const statusText = compiling ? 'Compiling' : stdin.waiting ? 'Waiting for input' : runtimeStatus === 'loading' ? 'Starting' : runtimeStatus === 'running' ? 'Running' : runtimeStatus === 'paused' ? 'Paused' : runtimeStatus === 'error' ? 'Needs attention' : runtimeStatus === 'stopped' ? 'Stopped' : 'Ready to run';
    const visibleLogs = logSearch ? logs.filter(log => log.text.toLowerCase().includes(logSearch.toLowerCase())) : logs;

    return <div className={`studio-app ${workspace.layout.sidebar ? '' : 'sidebar-hidden'} mobile-${mobileView}`}>
        <header className="titlebar">
            <a className="brand" href="#" onClick={event => event.preventDefault()} aria-label="GL Studio home"><span className="brand-symbol"><ChevronsLeftRight size={22} strokeWidth={2.5} /></span><span>GL<span className="brand-light"> Studio</span></span><span className="preview-badge">PREVIEW</span></a>
            <div className="main-menu" ref={menuRef}>
                <div className="menu-anchor"><button className={`text-button ${menu === 'project' ? 'selected' : ''}`} onClick={() => setMenu(menu === 'project' ? null : 'project')} aria-expanded={menu === 'project'}>Project<ChevronDown size={11} /></button>{menu === 'project' && <div className="dropdown"><button onClick={() => openFileDialog()}><FilePlus2 size={15} />New file</button><button onClick={() => { setDialog('examples'); setMenu(null); }}><BookOpen size={15} />Open example</button><div className="menu-divider" /><button onClick={exportProject}><Download size={15} />Export project<span>Ctrl S</span></button><button onClick={() => { importInput.current?.click(); setMenu(null); }}><Upload size={15} />Import project</button></div>}</div>
                <div className="menu-anchor"><button className={`text-button ${menu === 'view' ? 'selected' : ''}`} onClick={() => setMenu(menu === 'view' ? null : 'view')} aria-expanded={menu === 'view'}>View<ChevronDown size={11} /></button>{menu === 'view' && <div className="dropdown"><button onClick={() => { updateLayout({ mode: 'split' }); setMenu(null); }}><LayoutPanelLeft size={15} />Split workspace</button><button onClick={() => { updateLayout({ mode: 'editor' }); setMobileView('editor'); setMenu(null); }}><Code2 size={15} />Editor only</button><button onClick={() => { updateLayout({ mode: 'output' }); setMobileView('output'); setMenu(null); }}><Monitor size={15} />Output only</button><div className="menu-divider" /><button onClick={() => { updateLayout({ ...defaultLayout }); setMenu(null); }}><RotateCcw size={15} />Reset layout</button><button onClick={() => { setDialog('settings'); setMenu(null); }}><Settings2 size={15} />Settings</button></div>}</div>
            </div>
            <button className="command-trigger" onClick={() => { setCommandSearch(''); setDialog('commands'); }}><Search size={13} /><span>Search commands…</span><kbd>Ctrl Shift P</kbd></button>
            <div className="top-actions"><span className="local-label"><span />Local workspace</span><IconButton label="Toggle terminal (Ctrl+J)" active={workspace.layout.terminal} onClick={() => updateLayout({ terminal: !workspace.layout.terminal })}><PanelBottom size={17} /></IconButton><IconButton label="Settings" onClick={() => setDialog('settings')}><Settings2 size={17} /></IconButton></div>
        </header>

        <div className="app-body">
            <nav className="activity-bar" aria-label="Workspace tools">
                <div><IconButton label="Explorer (Ctrl+B)" active={workspace.layout.sidebar} onClick={() => updateLayout({ sidebar: !workspace.layout.sidebar })}><Files size={21} strokeWidth={1.6} /></IconButton><IconButton label="Find in editor" onClick={() => { setSearchToken(previous => previous + 1); setMobileView('editor'); updateLayout({ mode: 'split' }); }}><Search size={21} strokeWidth={1.6} /></IconButton><IconButton label="Example projects" active={dialog === 'examples'} onClick={() => setDialog('examples')}><BookOpen size={21} strokeWidth={1.6} /></IconButton><IconButton label="Build output" active={workspace.layout.terminal} onClick={() => { updateLayout({ terminal: !workspace.layout.terminal }); setTerminalTab('output'); }}><Terminal size={21} strokeWidth={1.6} /></IconButton></div>
                <div><IconButton label="Compatibility and keyboard shortcuts" onClick={() => setDialog('help')}><CircleHelp size={20} strokeWidth={1.6} /></IconButton><IconButton label="Settings" onClick={() => setDialog('settings')}><Settings2 size={21} strokeWidth={1.6} /></IconButton><div className="profile-mark" title="Local workspace">L</div></div>
            </nav>
            <aside className="sidebar" aria-label="File explorer">
                <div className="sidebar-heading"><span>EXPLORER</span><div><IconButton label="New file" onClick={() => openFileDialog()}><FilePlus2 size={15} /></IconButton><IconButton label="Hide sidebar" onClick={() => updateLayout({ sidebar: false })}><PanelLeftClose size={15} /></IconButton></div></div>
                <div className="project-title"><ChevronDown size={13} /><FolderOpen size={15} /><span title={workspace.name}>{workspace.name}</span><span className="file-count">{workspace.files.length}</span></div>
                <div className="file-tree">{fileEntries}</div>
                <button className="add-file" onClick={() => openFileDialog()}><Plus size={13} />New file</button>
                <div className="sidebar-bottom">
                    <div className="learn-card"><span className="learn-icon"><Sparkles size={16} /></span><h3>A good place to start</h3><p>Explore the ideas behind the pixels, one example at a time.</p><button onClick={() => setDialog('examples')}>Browse examples<ArrowRight size={14} /></button></div>
                    <button className="compatibility-link" onClick={() => setDialog('help')}><CircleHelp size={14} /><span>What can I run here?</span><ChevronRight size={13} /></button>
                </div>
            </aside>

            <main className="main-workspace">
                <div className="workspace-toolbar"><div className="workspace-name"><span className="project-dot" /><span>{workspace.name}</span><span className="workspace-divider">/</span><span className="muted">Workspace</span></div><div className="run-controls"><button className="example-button" onClick={() => setDialog('examples')}><BookOpen size={14} /><span>Examples</span></button><span className="toolbar-separator" />{(active || compiling) && <IconButton label="Stop execution" onClick={stop}><Square size={14} fill="currentColor" /></IconButton>}<button className="run-button" onClick={() => void run()} disabled={compiling || healthLoading || !health?.available} title={health?.available ? 'Compile and run (Ctrl+Enter)' : health?.message}>{compiling ? <LoaderCircle size={14} className="spin" /> : <Play size={14} fill="currentColor" />}<span>{compiling ? 'Compiling…' : 'Run code'}</span><kbd>Ctrl ↵</kbd></button></div></div>
                <div className="mobile-switch"><button className={mobileView === 'editor' ? 'active' : ''} onClick={() => { setMobileView('editor'); updateLayout({ mode: 'split' }); }}><Code2 size={14} />Editor</button><button className={mobileView === 'output' ? 'active' : ''} onClick={() => { setMobileView('output'); updateLayout({ mode: 'split' }); }}><Monitor size={14} />Output</button></div>
                <div className={`working-area layout-${workspace.layout.mode}`} ref={workspaceArea} style={{ '--editor-width': `${workspace.layout.split}%` } as CSSProperties}>
                    <section className="editor-panel" aria-label="Source editor">
                        <div className="editor-tabs" role="tablist" aria-label="Open files">{workspace.openFiles.map(path => <div className={`editor-tab ${path === workspace.activeFile ? 'active' : ''}`} key={path}><button role="tab" aria-selected={path === workspace.activeFile} onClick={() => openFile(path)} title={path}><span className="cpp-file-icon">C<span>++</span></span><span>{path.split('/').pop()}</span>{path === workspace.activeFile && saveState === 'saving' && <span className="unsaved-dot" title="Saving locally" />}</button>{workspace.openFiles.length > 1 && <button className="close-tab" aria-label={`Close ${path}`} onClick={() => closeFile(path)}><X size={12} /></button>}</div>)}<button className="new-tab-button" aria-label="New file" title="New file" onClick={() => openFileDialog()}><Plus size={14} /></button><span className="tabs-spacer" /><IconButton label="Toggle editor focus mode" active={workspace.layout.mode === 'editor'} onClick={() => updateLayout({ mode: workspace.layout.mode === 'editor' ? 'split' : 'editor' })}><Maximize2 size={13} /></IconButton></div>
                        <div className="breadcrumbs"><span>{workspace.name}</span><ChevronRight size={12} /><FileCode2 size={13} /><span>{currentFile.path}</span><span className="editor-language">C++</span></div>
                        <div className="editor-surface"><Suspense fallback={<div className="editor-loading"><span className="spinner" />Loading editor…</div>}><CodeEditor file={currentFile} files={workspace.files} settings={workspace.settings} theme={resolvedTheme} diagnostics={diagnostics} onChange={changeSource} onCursor={(line, column) => setCursor({ line, column })} jump={jump} searchToken={searchToken} /></Suspense></div>
                    </section>
                    <ResizeHandle orientation="vertical" value={workspace.layout.split} min={28} max={75} container={workspaceArea} onChange={split => updateLayout({ split })} />
                    <section className="output-panel" ref={outputPanel} aria-label="Graphical output">
                        <div className="output-heading"><div><Monitor size={14} /><span>OUTPUT</span><span className="webgl-badge">WebGL</span></div><div><IconButton label="Capture screenshot" disabled={!artifact || !active} onClick={() => viewport.current?.capture()}><Download size={14} /></IconButton><IconButton label="Fullscreen output" onClick={() => void fullscreen()}><Expand size={14} /></IconButton></div></div>
                        <div className="output-status"><span className={`runtime-indicator ${runtimeStatus} ${compiling ? 'building' : ''}`} /><span>{statusText}</span>{sourceChanged && <span className="changed-source" title="The viewport shows the last successful build">Source modified</span>}<div className="output-controls"><IconButton label={paused ? 'Resume animation callbacks' : 'Pause animation callbacks'} disabled={!artifact || !active || stdin.waiting} active={paused} onClick={() => setPaused(previous => !previous)}>{paused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}</IconButton><IconButton label="Restart last successful build" disabled={!artifact} onClick={() => { setRunKey(previous => previous + 1); setPaused(false); }}><RotateCcw size={13} /></IconButton><IconButton label="Stop runtime" disabled={!artifact} onClick={stop}><Square size={11} fill="currentColor" /></IconButton></div></div>
                        <div className="viewport-container"><Viewport ref={viewport} artifact={artifact} runKey={runKey} paused={paused} onLog={pushLog} onStatus={handleRuntimeStatus} onMetrics={setMetrics} onStdin={handleStdin} /></div>
                        <div className="viewport-footer"><span><span className="small-dot" />{metrics.width && artifact ? `${metrics.width} × ${metrics.height}` : 'Canvas ready'}</span><span>{active && metrics.fps > 0 ? `${Math.round(metrics.fps)} FPS` : '— FPS'}</span><span title="Programs execute in a dedicated worker">Worker isolated</span></div>
                        <div className="canvas-tip"><Keyboard size={13} /><span>Click the canvas to send keyboard and mouse input.</span></div>
                    </section>
                </div>
                {workspace.layout.terminal && <><ResizeHandle orientation="horizontal" value={workspace.layout.panelHeight} min={120} max={400} container={workspaceArea} onChange={panelHeight => updateLayout({ panelHeight })} /><section className="terminal-panel" style={{ height: workspace.layout.panelHeight }} aria-label="Build output and problems"><div className="terminal-heading"><div className="panel-tabs" role="tablist"><button role="tab" aria-selected={terminalTab === 'output'} className={terminalTab === 'output' ? 'active' : ''} onClick={() => setTerminalTab('output')}><Terminal size={13} />TERMINAL</button><button role="tab" aria-selected={terminalTab === 'problems'} className={terminalTab === 'problems' ? 'active' : ''} onClick={() => setTerminalTab('problems')}>PROBLEMS{diagnostics.length > 0 && <span className="count-badge">{diagnostics.length}</span>}</button></div><div className="terminal-actions"><label className="log-search"><Search size={12} /><input aria-label="Filter output" value={logSearch} onChange={event => setLogSearch(event.target.value)} placeholder="Filter output" /></label><IconButton label={autoscroll ? 'Disable autoscroll' : 'Enable autoscroll'} active={autoscroll} onClick={() => setAutoscroll(previous => !previous)}><ArrowDownToLine size={14} /></IconButton><IconButton label="Copy output" onClick={() => void navigator.clipboard.writeText(logs.map(log => log.text).join('\n')).then(() => notify('Output copied.', 'success')).catch(() => notify('Clipboard access is unavailable.', 'error'))}><Copy size={13} /></IconButton><IconButton label="Clear output" onClick={() => { logQueue.current = []; setLogs([]); }}><Trash2 size={13} /></IconButton><IconButton label="Hide terminal" onClick={() => updateLayout({ terminal: false })}><X size={14} /></IconButton></div></div>
                            {terminalTab === 'output' ? <div className="terminal-body" tabIndex={0} aria-label="Compiler and runtime output"><div className="terminal-intro"><span>GL STUDIO</span><span>Build & runtime output</span>{lastBuild && <span className={lastBuild.ok ? 'log-success' : 'log-error'}>{lastBuild.ok ? '✓ Build successful' : '× Build failed'} · {(lastBuild.duration / 1000).toFixed(2)}s</span>}</div>{visibleLogs.length ? visibleLogs.map(log => <div className={`log-line log-${log.level}`} key={log.id}><span className="log-time">{log.time || 'ready'}</span><span className="log-text">{log.text}</span></div>) : <div className="empty-log">{logSearch ? 'No output matches your filter.' : 'Output cleared. New build and runtime messages will appear here.'}</div>}<div ref={logEnd} /></div> : <div className="problems-body">{diagnostics.length ? diagnostics.map((diagnostic, index) => <button className={`diagnostic-row ${diagnostic.severity}`} key={`${diagnostic.file}:${diagnostic.line}:${index}`} onClick={() => goToDiagnostic(diagnostic)}>{diagnostic.severity === 'error' ? <CircleX size={15} /> : <CircleAlert size={15} />}<span>{diagnostic.message}<small>{diagnostic.file} · Ln {diagnostic.line}, Col {diagnostic.column}</small></span><ChevronRight size={14} /></button>) : <div className="empty-problems"><CircleCheck size={20} /><div>No problems to show.<small>Compiler diagnostics appear here after you run your project.</small></div></div>}</div>}
                            <ProgramInput state={stdin} active={active} onSend={sendInput} />
                        </section></>}
            </main>
        </div>

        <footer className="statusbar"><div><span className="status-brand"><ChevronsLeftRight size={15} /></span><button className="status-item compiler-status" onClick={() => void refreshHealth()} title={health?.message}>{healthLoading ? <LoaderCircle size={12} className="spin" /> : <span className={`compiler-dot ${health?.available ? 'available' : ''}`} />}<span>{healthLoading ? 'Connecting to compiler' : health?.available ? 'Compiler connected' : 'Compiler unavailable'}</span></button><button className="status-item" onClick={() => { updateLayout({ terminal: true }); setTerminalTab('problems'); }}><CircleX size={12} />{errors}<CircleAlert size={12} />{warnings}</button><span className={`status-item saved-state ${saveState === 'error' ? 'save-error' : ''}`} title="Saved in this browser only. Export your project for a backup.">{saveState === 'saved' ? <Check size={12} /> : saveState === 'saving' ? <Circle size={9} /> : <CircleAlert size={12} />}{saveState === 'saved' ? 'Saved locally' : saveState === 'saving' ? 'Saving…' : 'Export to save'}</span></div><div><span className="status-item cursor-status">Ln {cursor.line}, Col {cursor.column}</span><button className="status-item settings-status" onClick={() => setDialog('settings')}>Spaces: {workspace.settings.tabSize}</button><span className="status-item language-status">UTF-8</span><span className="status-item language-status">C++17</span><button className="status-item trusted-status" onClick={() => setDialog('help')}><span className="small-dot" />Trusted local mode</button></div></footer>

        <input ref={importInput} type="file" accept=".json,.glstudio.json" className="visually-hidden" aria-label="Import project file" onChange={event => { const file = event.target.files?.[0]; if (file) void importProject(file); event.target.value = ''; }} />
        {toast && <div className={`toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>{toast.tone === 'error' ? <CircleAlert size={17} /> : toast.tone === 'success' ? <CircleCheck size={17} /> : <CircleHelp size={17} />}<span>{toast.message}</span><IconButton label="Dismiss notification" onClick={() => setToast(null)}><X size={14} /></IconButton></div>}

        {dialog === 'settings' && <Modal title="Make it your workspace" onClose={() => setDialog(null)}><p className="dialog-description">A few small preferences for a more comfortable flow.</p><div className="setting-section"><h3>Appearance</h3><div className="theme-options">{([{ id: 'dark', label: 'Dark', icon: Moon }, { id: 'light', label: 'Light', icon: Sun }, { id: 'system', label: 'System', icon: Monitor }] as const).map(option => <button key={option.id} className={workspace.settings.theme === option.id ? 'selected' : ''} onClick={() => updateSettings({ theme: option.id })}><option.icon size={20} /><span>{option.label}</span>{workspace.settings.theme === option.id && <Check size={13} />}</button>)}</div></div><div className="setting-section"><h3>Editor</h3><label className="setting-row"><span>Font size<small>Keep your code easy to read.</small></span><select value={workspace.settings.fontSize} onChange={event => updateSettings({ fontSize: Number(event.target.value) })}>{[11, 12, 13, 14, 15, 16, 18, 20, 24].map(size => <option key={size} value={size}>{size}px</option>)}</select></label><label className="setting-row"><span>Indentation<small>Spaces per tab.</small></span><select value={workspace.settings.tabSize} onChange={event => updateSettings({ tabSize: Number(event.target.value) })}>{[2, 4, 8].map(size => <option key={size} value={size}>{size} spaces</option>)}</select></label><label className="setting-row"><span>Word wrap<small>Wrap long lines to fit the editor.</small></span><input type="checkbox" checked={workspace.settings.wordWrap} onChange={event => updateSettings({ wordWrap: event.target.checked })} /></label><label className="setting-row"><span>Minimap<small>A bird’s-eye view of your source.</small></span><input type="checkbox" checked={workspace.settings.minimap} onChange={event => updateSettings({ minimap: event.target.checked })} /></label></div><div className="setting-section"><h3>Workspace</h3><p className="setting-note">Autosave stays in this browser. It is not cloud storage or a backup.</p><div className="setting-actions"><button className="secondary-button" onClick={exportProject}><Download size={14} />Export project</button><button className="secondary-button" onClick={() => updateLayout({ ...defaultLayout })}><LayoutPanelLeft size={14} />Reset layout</button></div>{persistenceBlocked && <button className="text-link" onClick={() => { setPersistenceBlocked(false); notify('Local saving has been re-enabled.'); }}>Resume saving this version locally</button>}</div></Modal>}
        {dialog === 'examples' && <Modal title="Small programs. Big ideas." onClose={() => setDialog(null)} className="examples-dialog"><p className="dialog-description">Start with working C++ and make something your own. Opening an example replaces your current project.</p><div className="example-cards">{examples.map((example, index) => <button className="example-card" key={example.id} onClick={() => loadExample(example)}><div className={`example-art art-${example.id}`} aria-hidden="true">{index === 0 ? <span className="mini-triangle" /> : index === 1 ? <span className="mini-lines"><i /><i /></span> : <span className="mini-orbit"><i /></span>}</div><div><span className="example-tag">{example.tag}</span><h3>{example.name}</h3><p>{example.description}</p><span className="example-open">Open project<ArrowRight size={14} /></span></div></button>)}</div><p className="example-note"><FileCode2 size={14} />Every example compiles from real C++ into WebAssembly.</p></Modal>}
        {dialog === 'commands' && <Modal title="Command palette" onClose={() => setDialog(null)} className="command-dialog"><div className="command-input"><Search size={17} /><input autoFocus value={commandSearch} onChange={event => setCommandSearch(event.target.value)} placeholder="What would you like to do?" aria-label="Search commands" /></div><div className="command-list">{commands.filter(command => `${command.name} ${command.detail}`.toLowerCase().includes(commandSearch.toLowerCase())).map(command => <button key={command.name} onClick={() => { setDialog(null); command.action(); }}><command.icon size={17} /><span>{command.name}<small>{command.detail}</small></span>{command.shortcut && <kbd>{command.shortcut}</kbd>}</button>)}</div><div className="command-footer"><span>Use Tab to navigate · Enter to select</span><span>Esc to close</span></div></Modal>}
        {dialog === 'file' && <Modal title={renameFrom ? 'File settings' : 'Create a file'} onClose={() => setDialog(null)} className="file-dialog"><form onSubmit={event => { event.preventDefault(); submitFile(); }}><p className="dialog-description">Use a folder path to organize your files, such as <code>include/shapes.h</code>.</p><label className="field-label" htmlFor="file-path">File path</label><input id="file-path" className="text-input" autoFocus value={fileName} onChange={event => { setFileName(event.target.value); setFileError(''); }} placeholder="main.cpp" aria-invalid={Boolean(fileError)} aria-describedby={fileError ? 'file-error' : undefined} />{fileError && <p id="file-error" className="field-error">{fileError}</p>}<div className="dialog-actions">{renameFrom && <button className="danger-text" type="button" onClick={deleteFile} disabled={workspace.files.length <= 1}><Trash2 size={14} />Delete file</button>}<span /><button className="secondary-button" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="primary-button" type="submit">{renameFrom ? 'Save filename' : 'Create file'}</button></div></form></Modal>}
        {dialog === 'help' && <Modal title="A workspace for graphics, with clear limits" onClose={() => setDialog(null)} className="help-dialog"><p className="dialog-description">GL Studio compiles C++ with Emscripten and runs the result in a dedicated browser worker.</p><div className="help-block"><h3><Check size={16} />The supported starting point</h3><p>One canvas, immediate-mode primitives, colors and matrix transforms, display and reshape callbacks, timers, and keyboard/mouse input. Try the examples before adapting a desktop assignment.</p></div><div className="help-block"><h3><CircleAlert size={16} />Desktop GLUT is not browser GLUT</h3><p>Native windows, multiple windows, GLUT menus and fonts, arbitrary system libraries and desktop-specific APIs are outside this preview. Some legacy OpenGL operations are not emulated. Unsupported calls may fail compilation or report a runtime error.</p><p>Pause suspends adapter callbacks; Stop terminates the runtime worker. The terminal accepts line-based program input for cin, getline and scanf. Enter submits a line; EOF closes stdin. It is not a system shell. Syntax coloring and compiler diagnostics are available; full C++ IntelliSense is not.</p></div><div className="help-block local-warning"><h3><Monitor size={16} />Trusted local compilation</h3><p>The native compiler runs on your computer without a hardened server sandbox. Compile only source you trust. This development service must remain bound to localhost and must not be exposed to public submissions.</p><p>{health?.message}</p>{health?.version && <code>{health.version}</code>}</div><div className="help-shortcuts"><h3>Useful shortcuts</h3><div><span>Run project</span><kbd>Ctrl / ⌘ + Enter</kbd></div><div><span>Command palette</span><kbd>Ctrl / ⌘ + Shift + P</kbd></div><div><span>Toggle explorer</span><kbd>Ctrl / ⌘ + B</kbd></div><div><span>Toggle output panel</span><kbd>Ctrl / ⌘ + J</kbd></div><div><span>Export project backup</span><kbd>Ctrl / ⌘ + S</kbd></div><div><span>Find / replace in editor</span><kbd>Ctrl / ⌘ + F / H</kbd></div><p>In Monaco, Ctrl+M toggles whether Tab moves focus out of the editor.</p></div></Modal>}
    </div>;
}
