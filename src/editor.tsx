import { useEffect, useRef } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/languages/definitions/cpp/register.js';
import 'monaco-editor/editor/contrib/find/browser/findController.js';
// The lightweight editor API does not register the bundled Codicon font.
import 'monaco-editor/features/codicon/register.js';
import type { Diagnostic, SourceFile } from '../shared/contracts';
import type { StudioSettings } from './workspace';

loader.config({ monaco });
monaco.editor.defineTheme('glstudio-dark', {
    base: 'vs-dark', inherit: true,
    rules: [{ token: 'comment', foreground: '84969F' }, { token: 'keyword', foreground: 'F3AD78' }, { token: 'string', foreground: 'A7D5AE' }, { token: 'number', foreground: 'F1C992' }, { token: 'type.identifier', foreground: '8ECFB9' }],
    colors: { 'editor.background': '#1c2226', 'editor.foreground': '#e9edef', 'editorLineNumber.foreground': '#83939e', 'editorLineNumber.activeForeground': '#d4d4d8', 'editor.lineHighlightBackground': '#273037', 'editor.selectionBackground': '#6acbbd30', 'editor.inactiveSelectionBackground': '#6acbbd18', 'editorCursor.foreground': '#82dfd0', 'editorIndentGuide.background1': '#344047', 'editorWidget.background': '#223139', 'editorSuggestWidget.background': '#223139', 'editorGutter.background': '#1c2226' },
});
monaco.editor.defineTheme('glstudio-light', {
    base: 'vs', inherit: true,
    rules: [{ token: 'comment', foreground: '63746E' }, { token: 'keyword', foreground: '8B4DB8' }, { token: 'string', foreground: '287D54' }],
    colors: { 'editor.background': '#fbfdff', 'editor.lineHighlightBackground': '#f5f4f8', 'editorGutter.background': '#fbfdff', 'editorLineNumber.foreground': '#6d7180', 'editorCursor.foreground': '#7047c6' },
});

interface Props {
    file: SourceFile; files: SourceFile[]; settings: StudioSettings; theme: 'dark' | 'light'; diagnostics: Diagnostic[];
    onChange: (content: string) => void; onCursor: (line: number, column: number) => void;
    jump?: { path: string; line: number; column: number; token: number };
    searchToken: number;
}

export default function CodeEditor({ file, files, settings, theme, diagnostics, onChange, onCursor, jump, searchToken }: Props) {
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const cursorCallback = useRef(onCursor);
    cursorCallback.current = onCursor;
    useEffect(() => {
        let live = true;
        void document.fonts.load('13px "JetBrains Mono Variable"').then(() => { if (live) monaco.editor.remeasureFonts(); });
        return () => { live = false; };
    }, []);
    const mounted: OnMount = editor => {
        editorRef.current = editor;
        editor.onDidChangeCursorPosition(event => cursorCallback.current(event.position.lineNumber, event.position.column));
        editor.focus();
    };
    useEffect(() => {
        for (const model of monaco.editor.getModels()) {
            const path = decodeURIComponent(model.uri.path).replace(/^\/workspace\//, '');
            const markers = diagnostics.filter(diagnostic => diagnostic.file === path).map(diagnostic => ({
                severity: diagnostic.severity === 'error' ? monaco.MarkerSeverity.Error : diagnostic.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
                startLineNumber: Math.max(1, diagnostic.line), endLineNumber: Math.max(1, diagnostic.line),
                startColumn: Math.max(1, diagnostic.column), endColumn: Math.max(2, diagnostic.column + 1), message: diagnostic.message,
            }));
            monaco.editor.setModelMarkers(model, 'compiler', markers);
        }
    }, [diagnostics, file.path]);
    useEffect(() => {
        if (jump && jump.path === file.path) {
            editorRef.current?.setPosition({ lineNumber: jump.line, column: jump.column });
            editorRef.current?.revealLineInCenter(jump.line);
            editorRef.current?.focus();
        }
    }, [jump, file.path]);
    useEffect(() => {
        if (searchToken > 0) editorRef.current?.getAction('actions.find')?.run();
    }, [searchToken]);
    useEffect(() => {
        const keep = new Set(files.map(source => `file:///workspace/${source.path}`));
        for (const model of monaco.editor.getModels()) {
            if (model.uri.toString().startsWith('file:///workspace/') && !keep.has(model.uri.toString())) model.dispose();
        }
    }, [files]);
    return <Editor
        path={`file:///workspace/${file.path}`} language="cpp" value={file.content}
        theme={theme === 'light' ? 'glstudio-light' : 'glstudio-dark'} onMount={mounted}
        onChange={value => onChange(value ?? '')} keepCurrentModel saveViewState
        loading={<div className="editor-loading"><span className="spinner" /> Loading editor…</div>}
        options={{ automaticLayout: true, fontSize: settings.fontSize, fontFamily: "'JetBrains Mono Variable', 'Cascadia Mono', Consolas, monospace", fontWeight: '450', fontLigatures: false, lineHeight: Math.round(settings.fontSize * 1.9), minimap: { enabled: settings.minimap }, tabSize: settings.tabSize, insertSpaces: true, wordWrap: settings.wordWrap ? 'on' : 'off', padding: { top: 18, bottom: 24 }, scrollBeyondLastLine: false, renderLineHighlight: 'line', lineNumbersMinChars: 3, glyphMargin: false, folding: true, smoothScrolling: true, contextmenu: true, fixedOverflowWidgets: true, bracketPairColorization: { enabled: true }, overviewRulerBorder: false, hideCursorInOverviewRuler: true, scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }, stickyScroll: { enabled: false }, ariaLabel: `C++ editor, ${file.path}` }}
    />;
}
