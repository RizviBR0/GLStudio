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
    rules: [{ token: 'comment', foreground: '85858F' }, { token: 'keyword', foreground: 'C4B5FD' }, { token: 'string', foreground: 'B2D9A0' }, { token: 'number', foreground: 'F0C58E' }, { token: 'type.identifier', foreground: '9CCFD8' }],
    colors: { 'editor.background': '#19191c', 'editor.foreground': '#e4e4e7', 'editorLineNumber.foreground': '#74747f', 'editorLineNumber.activeForeground': '#d4d4d8', 'editor.lineHighlightBackground': '#212125', 'editor.selectionBackground': '#a78bfa30', 'editor.inactiveSelectionBackground': '#a78bfa18', 'editorCursor.foreground': '#c4b5fd', 'editorIndentGuide.background1': '#2b2b31', 'editorWidget.background': '#232327', 'editorSuggestWidget.background': '#232327', 'editorGutter.background': '#19191c' },
});
monaco.editor.defineTheme('glstudio-light', {
    base: 'vs', inherit: true,
    rules: [{ token: 'comment', foreground: '74817E' }, { token: 'keyword', foreground: '8B4DB8' }, { token: 'string', foreground: '287D54' }],
    colors: { 'editor.background': '#ffffff', 'editor.lineHighlightBackground': '#f5f4f8', 'editorGutter.background': '#ffffff', 'editorLineNumber.foreground': '#787580', 'editorCursor.foreground': '#7047c6' },
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
        options={{ automaticLayout: true, fontSize: settings.fontSize, fontFamily: "'JetBrains Mono Variable', 'Cascadia Mono', Consolas, monospace", fontLigatures: false, lineHeight: 23, minimap: { enabled: settings.minimap }, tabSize: settings.tabSize, insertSpaces: true, wordWrap: settings.wordWrap ? 'on' : 'off', padding: { top: 14, bottom: 24 }, scrollBeyondLastLine: false, renderLineHighlight: 'line', lineNumbersMinChars: 3, glyphMargin: false, folding: true, smoothScrolling: true, contextmenu: true, fixedOverflowWidgets: true, bracketPairColorization: { enabled: true }, overviewRulerBorder: false, hideCursorInOverviewRuler: true, scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }, stickyScroll: { enabled: false }, ariaLabel: `C++ editor, ${file.path}` }}
    />;
}
