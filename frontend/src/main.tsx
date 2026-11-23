import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Workspace } from './Workspace';
import { Entry } from './Entry';
import { api, message, type State } from './shared';
import './main.css';

function App() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState<{text: string} | null>(null);
  const refresh = useCallback(async () => {
    const next = await api<State>('/api/state');
    setState(next);
    setError('');
  }, []);
  const load = useCallback(() => {
    refresh().catch(error => setError(message(error)));
  }, [refresh]);
  useEffect(() => {
    load();
    const restore = (event: PageTransitionEvent) => { if (event.persisted) load(); };
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, [load]);
  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => setNotification(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notification]);
  const notice = useCallback((text: string) => setNotification({text}), []);

  if (error) return <main className="entry-failure">
    <img src="/assets/index-tab.svg" alt="Companykeeping" />
    <h1>Couldn’t open your workspace</h1><p>{error}</p>
    <button className="entry-primary" onClick={load}>Try again</button>
  </main>;
  if (!state) return <p className="loading">Opening Companykeeping…</p>;
  return <>
    {state.workspace?.setupComplete
      ? <Workspace state={state} refresh={refresh} notice={notice} />
      : <Entry state={state} refresh={refresh} />}
    <div id="notification" className={notification ? 'visible' : ''} role="status">{notification?.text}</div>
  </>;
}

createRoot(document.getElementById('app')!).render(<App />);
