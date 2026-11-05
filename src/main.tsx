import React from 'react';
import ReactDOM from 'react-dom/client';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import App from './App';
import './fonts.css';
import './styles.css';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
