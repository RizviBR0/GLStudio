import { useEffect, useRef } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/languages/definitions/cpp/register.js';
import 'monaco-editor/editor/contrib/find/browser/findController.js';
import type { Diagnostic, SourceFile } from '../shared/contracts';
import type { StudioSettings } from './workspace';

loader.config({ monaco });
monaco.editor.defineTheme('glstudio-dark', {
    base: 'vs-dark', inherit: true,
    rules: [{ token: 'comment', foreground: '65788B' }, { token: 'keyword', foreground: 'C39CF3' }, { token: 'string', foreground: '9DD6AA' }, { token: 'number', foreground: 'E5BC83' }, { token: 'type.identifier', foreground: '84C5DC' }],
    colors: { 'editor.background': '#14181f', 'editor.foreground': '#ced6e0', 'editorLineNumber.foreground': '#46505e', 'editorLineNumber.activeForeground': '#a1afbd', 'editor.lineHighlightBackground': '#1b2029', 'editor.selectionBackground': '#31526b77', 'editor.inactiveSelectionBackground': '#31526b44', 'editorCursor.foreground': '#81dfbb', 'editorIndentGuide.background1': '#252c36', 'editorWidget.background': '#202631', 'editorSuggestWidget.background': '#202631', 'editorGutter.background': '#14181f' },
});
monaco.editor.defineTheme('glstudio-light', {
    base: 'vs', inherit: true,
    rules: [{ token: 'comment', foreground: '74817E' }, { token: 'keyword', foreground: '8B4DB8' }, { token: 'string', foreground: '287D54' }],
    colors: { 'editor.background': '#fafbfc', 'editor.lineHighlightBackground': '#f0f3f6', 'editorGutter.background': '#fafbfc', 'editorLineNumber.foreground': '#9aa5b0', 'editorCursor.foreground': '#14785A' },
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
        options={{ automaticLayout: true, fontSize: settings.fontSize, fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace", fontLigatures: false, lineHeight: 23, minimap: { enabled: settings.minimap }, tabSize: settings.tabSize, insertSpaces: true, wordWrap: settings.wordWrap ? 'on' : 'off', padding: { top: 19, bottom: 24 }, scrollBeyondLastLine: false, renderLineHighlight: 'line', lineNumbersMinChars: 4, glyphMargin: false, folding: true, smoothScrolling: true, contextmenu: true, fixedOverflowWidgets: true, bracketPairColorization: { enabled: true }, overviewRulerBorder: false, hideCursorInOverviewRuler: true, scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }, stickyScroll: { enabled: false }, ariaLabel: `C++ editor, ${file.path}` }}
    />;
}
