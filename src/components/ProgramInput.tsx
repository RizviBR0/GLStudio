import { useEffect, useRef, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import type { RuntimeStdin } from '../../shared/contracts';

interface Props {
  state: RuntimeStdin;
  active: boolean;
  onSend(text: string, eof: boolean): boolean;
}

export function ProgramInput({ state, active, onSend }: Props) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setText(''); if (state.waiting) input.current?.focus(); }, [state.waiting, state.requestId]);
  const submit = (eof = false) => { if (state.waiting && onSend(eof ? '' : text, eof)) setText(''); };
  return <form className={`program-input ${state.waiting ? 'waiting' : ''}`} onSubmit={event => { event.preventDefault(); submit(); }}>
    <span className="stdin-label" title="Standard input for the C++ program">stdin</span>
    <span className="stdin-prompt" aria-hidden="true">›</span>
    <input ref={input} aria-label="Program input" value={text} maxLength={8192} disabled={!state.waiting}
      placeholder={state.waiting ? 'Type a value and press Enter…' : active ? 'Input opens when your program reads stdin' : 'Run a program to enter input'}
      autoComplete="off" spellCheck={false} onChange={event => setText(event.target.value)}
      onKeyDown={event => { if (event.ctrlKey && event.key.toLowerCase() === 'd') { event.preventDefault(); event.stopPropagation(); submit(true); } }} />
    <button type="button" className="stdin-eof" disabled={!state.waiting} onClick={() => submit(true)} title="Close standard input (Ctrl+D)">EOF</button>
    <button type="submit" className="stdin-send" disabled={!state.waiting} aria-label="Send program input" title="Send input (Enter)"><CornerDownLeft size={15} /></button>
  </form>;
}
