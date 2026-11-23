import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type Example, type State } from './shared';
import { ErrorNote, Icon, Progress, useSubmit } from './EntryUI';
import { CompanyForm, ChecklistForm } from './Setup';
import { CompanyLogoLink, MakerCredit } from './MakerCredit';

type EntryProps = { state: State; refresh: () => Promise<void> };

function AccountForm({login, wantsExample, refresh}: {login: boolean; wantsExample: boolean; refresh: EntryProps['refresh']}) {
  const [show, setShow] = useState(false);
  const {error,busy,run} = useSubmit();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void run(async () => {
      await api(login ? '/api/login' : '/api/signup', 'POST', {email: values.get('email'), password: values.get('password')});
      history.replaceState(null,'',location.pathname);
      await refresh();
      window.scrollTo(0,0);
    });
  }
  return <div className="entry-account">
    {!login && <Progress index={0} />}
    <h1>{login ? <>Open your <br/>workspace.</> : <>Open your <br/>company file.</>}</h1>
    <p className="entry-intro">{login ? 'Pick up your company guide where you left off, or open this week’s work.' : wantsExample ? 'Create an account to try our sample records in a private workspace of your own.' : 'Work through how to set up your business, prepare for a first sale, and keep the money and paperwork in order as you grow.'}</p>
    <form onSubmit={submit} className="entry-form">
      <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@company.com"/></label>
      <label htmlFor="account-password">Password</label>
      <div className="entry-password">
        <input id="account-password" name="password" type={show ? 'text' : 'password'} autoComplete={login ? 'current-password' : 'new-password'} placeholder={login ? 'Your password' : 'At least 8 characters'} minLength={login ? undefined : 8} maxLength={256} required/>
        <button type="button" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(!show)}><Icon name={show ? 'eyeOff' : 'eye'} size={19}/></button>
      </div>
      <ErrorNote error={error}/>
      <button className="entry-primary" type="submit" disabled={busy}>{busy ? (login ? 'Signing in…' : 'Creating account…') : (login ? 'Sign in' : 'Create account')}</button>
    </form>
  </div>;
}

function FilePreview({example,onClose,onChoose}: {example: Example; onClose: () => void; onChoose: () => void}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="example-dialog" onCancel={onClose} aria-labelledby="example-title">
    <div className="example-heading"><span><Icon name="folder"/>Sample company records</span>
      <button className="entry-icon" aria-label="Close preview" onClick={onClose}><Icon name="close"/></button></div>
    <h2 id="example-title">{example.workspace.name}</h2>
    <p>{example.workspace.description}</p>
    <div className="example-list">{example.suggestions.map(item =>
      <details key={item.title}><summary><span>{item.title}</span><small>{item.status === 'waiting' ? 'Waiting' : item.recurrence === 'monthly' ? 'Monthly' : 'Ready'}</small></summary>
        <p>{item.nextAction}</p>{item.waitingFor && <p>Waiting for {item.waitingFor.toLowerCase()}.</p>}
      </details>)}</div>
    <button className="entry-primary" onClick={onChoose}>Use these sample records</button>
  </dialog>;
}

export function Entry({state,refresh}: EntryProps) {
  const [login,setLogin] = useState(location.hash === '#signin');
  const [preview,setPreview] = useState<Example | null>(null);
  const [chosen,setChosen] = useState<Example | null>(null);
  const action = useSubmit();
  useEffect(() => {
    const hashChanged = () => setLogin(location.hash === '#signin');
    window.addEventListener('hashchange',hashChanged);
    return () => window.removeEventListener('hashchange',hashChanged);
  }, []);
  const account = !state.user;
  useEffect(() => {
    document.title = (account ? (login ? 'Sign in' : 'Create account') : state.workspace ? 'Starting checklist' : 'Your company') + ' · Companykeeping';
  },[account,login,state.workspace]);
  async function logout() {
    await api('/api/logout','POST');
    setChosen(null);
    history.replaceState(null,'',location.pathname);
    setLogin(false);
    await refresh();
  }
  return <div className="entry-page">
    <header className="entry-head"><div className="entry-wrap">
      <div className="brand-signature"><img src="/assets/index-tab.svg" className="entry-wordmark" alt="Companykeeping" /><MakerCredit/></div>
      {account ? <div className="entry-switch"><span>{login ? 'New to Companykeeping?' : 'Already have an account?'}</span>
        <a href={login ? '#signup' : '#signin'}>{!login && <Icon name="user" size={15}/>} {login ? 'Create account' : 'Sign in'}</a></div>
      : <button type="button" className="entry-link" disabled={action.busy} onClick={() => void action.run(logout)}>Sign out</button>}
    </div></header>
    {account ? <main className="entry-wrap entry-landing">
      <AccountForm key={String(login)} login={login} wantsExample={!!chosen} refresh={refresh}/>
      <aside className="entry-studio" aria-label="Sample records from For General Use">
        <div className="entry-art"><img src="/assets/company-file.jpg" alt="Manila company records folder with cobalt index dividers and clipped paperwork" fetchPriority="high"/></div>
        <div className="entry-caption"><div><Icon name="folder" size={23}/><div><small>From For General Use</small><strong>Our sample company file</strong></div></div>
          <button type="button" disabled={action.busy} onClick={() => void action.run(async () => setPreview(await api<Example>('/api/example')))}>Preview records</button>
        </div>
      </aside>
    </main> : !state.workspace ? <CompanyForm initialExample={chosen} refresh={refresh}/> : <ChecklistForm state={state} refresh={refresh}/>}
    <ErrorNote error={action.error}/>
    <footer className="entry-footer"><div className="entry-wrap"><span>About the company</span>
      <CompanyLogoLink/>
    </div></footer>
    {preview && <FilePreview example={preview} onClose={() => setPreview(null)} onChoose={() => {
      setChosen(preview); setPreview(null); location.hash='signup'; setLogin(false);
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[name=email]')?.focus());
    }}/>}
  </div>;
}
