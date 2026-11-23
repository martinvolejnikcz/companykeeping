import { useState, type ReactNode } from 'react';
import { message } from './shared';

const shapes: Record<string, ReactNode> = {
  eye: <><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/></>,
  eyeOff: <path d="m3 3 18 18M9.7 5.3c.8-.2 1.5-.3 2.3-.3 6.2 0 10 7 10 7-.8 1.3-1.8 2.6-3 3.6M6.3 6.6A18 18 0 0 0 2 12s3.8 7 10 7c1.7 0 3.2-.5 4.6-1.3"/>,
  folder: <path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  edit: <path d="m14.5 5.5 4 4M4 20l4.7-1L20 7.7a2.8 2.8 0 0 0-4-4L4.7 15Z"/>,
  sprout: <path d="M12 21v-7m0 2c0-7-4-9-9-9 0 6 3 9 9 9Zm0-3c0-6 4-10 9-10 0 6-3 10-9 10Z"/>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M3 12c6 3 12 3 18 0m-9 0v3"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  sheets: <><path d="M5 3h12v15H5z"/><path d="M9 21h11V7M8 7h6M8 10h6"/></>,
  user: <><circle cx="12" cy="8" r="3.4"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></>
};

export function Icon({name, size = 20}: {name: string; size?: number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

export function Progress({index}: {index: number}) {
  return <ol className="entry-progress" aria-label="Workspace setup">{['Account','Company','Checklist'].map((label,i) =>
    <li key={label} className={i < index ? 'past' : i === index ? 'now' : ''} aria-current={i === index ? 'step' : undefined}>
      <span className="step-dot">{i < index ? <Icon name="check" size={12}/> : i+1}</span>{label}
    </li>
  )}</ol>;
}

export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  return {busy,error,run};
}

export function ErrorNote({error}: {error: string}) {
  return error ? <p role="alert" className="entry-error">{error}</p> : null;
}
