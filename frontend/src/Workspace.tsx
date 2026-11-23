import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api } from './shared';
import type { Item, State, WorkspaceInfo } from './shared';
import './workspace.css';

const symbols = {
  plus: <path d="M12 5v14M5 12h14"/>,
  week: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h4m-4 3h6"/></>,
  records: <path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>,
  angle: <path d="m9 5 7 7-7 7"/>,
  down: <path d="m6 9 6 6 6-6"/>,
  back: <path d="m10 5-7 7 7 7M4 12h17"/>,
  user: <><circle cx="12" cy="8" r="3.2"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></>,
  repeat: <path d="m17 2 4 4-4 4M3 12V9a3 3 0 0 1 3-3h14M7 22l-4-4 4-4m14-2v3a3 3 0 0 1-3 3H4"/>,
  check: <path d="m4 12 5 5L20 6"/>,
  link: <path d="m10 14 4-4m-6 4-1 1a3 3 0 0 1-4-4l5-5a3.1 3.1 0 0 1 4.5 0m-.8 11.8a3.1 3.1 0 0 0 4.5 0l5-5a3 3 0 1 0-4.2-4.2l-1 1"/>,
  edit: <path d="m14 5 5 5M4 20l4.7-1L20 7.7a2 2 0 0 0-4-4L4.7 15Z"/>
};

function Icon({name, size = 18}: { name: keyof typeof symbols; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{symbols[name]}</svg>;
}

type Tab = 'week' | 'records';
type View = 'week' | 'records' | 'item' | 'new' | 'company';
type Filter = 'all' | 'open' | 'completed';
type Route = {view: View; tab: Tab; filter: Filter; id?: string};
type WorkspaceProps = {state: State; refresh: () => Promise<void>; notice: (message: string) => void};
type SaveProps = {refresh: WorkspaceProps['refresh']; notice: WorkspaceProps['notice']; tab: Tab};

function readRoute(hash: string): Route {
  const [path, query] = hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  const tab = path === 'records' || params.get('from') === 'records' ? 'records' : 'week';
  const show = params.get('show');
  const filter = show === 'open' || show === 'completed' ? show : 'all';
  if (path === 'records' || path === 'company') return {view: path, tab, filter};
  if (path === 'items/new') return {view: 'new', tab, filter};
  const match = /^items\/([a-zA-Z0-9_-]+)$/.exec(path);
  if (match) return {view: 'item', tab, filter, id: match[1]};
  return {view: 'week', tab: 'week', filter};
}

function detailHref(path: string, tab: Tab) {
  return '#' + path + (tab === 'records' ? '?from=records' : '');
}

function localDay(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function dateLabel(value: string | undefined | null, options: Intl.DateTimeFormatOptions = {month: 'short', day: 'numeric'}) {
  if (!value) return '';
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString('en-GB', options);
}

function monthLabel(period: string | undefined | null) {
  return period ? dateLabel(period + '-01', {month: 'long', year: 'numeric'}) : '';
}

function dateRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'long', year: 'numeric'});
  return formatter.formatRange(new Date(start + 'T12:00:00'), new Date(end + 'T12:00:00'));
}

function displayName(workspace: WorkspaceInfo) {
  return workspace.name || 'Untitled company';
}

function Masthead({workspace, email, tab, refresh, notice}: SaveProps & {workspace: WorkspaceInfo; email: string}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    function dismiss(event: MouseEvent) {
      if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) menu.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    }
    document.addEventListener('click', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  async function logout() {
    setBusy(true);
    try {
      await api('/api/logout', 'POST', {});
      history.replaceState(null, '', location.pathname + location.search);
      await refresh();
    } catch (error) {
      notice(error instanceof Error ? error.message : 'Could not sign out.');
      setBusy(false);
    }
  }
  return <header className="wk-masthead"><div className="wk-masthead-inner">
    <a className="wk-brand" href="#week" aria-label="Companykeeping home"><img src="/assets/index-tab.svg" alt="Companykeeping"/></a>
    <details ref={menu} className="wk-account"><summary aria-label="Account and company menu"><span className="wk-company-name">{displayName(workspace)}</span><span className="wk-avatar"><Icon name="user"/></span><Icon name="down" size={15}/></summary>
      <div className="wk-account-menu"><p>{email}</p><a href={detailHref('company', tab)} onClick={() => { if (menu.current) menu.current.open = false; }}>Edit company details</a><button type="button" onClick={logout} disabled={busy}>Sign out</button></div>
    </details></div></header>;
}

function Tabs({current}: {current: Tab}) {
  return <nav className="wk-tabs" aria-label="Workspace">
    <a className="wk-tab" href="#week" aria-current={current === 'week' ? 'page' : undefined}><Icon name="week"/>This week</a>
    <a className="wk-tab" href="#records" aria-current={current === 'records' ? 'page' : undefined}><Icon name="records"/>Company records</a>
  </nav>;
}

function PageHead({title, meta, addTo}: {title: string; meta?: string; addTo?: Tab}) {
  return <div className="wk-page-head"><div><h1 tabIndex={-1}>{title}</h1>{meta && <p>{meta}</p>}</div>
    {addTo && <a className="wk-btn primary" href={detailHref('items/new', addTo)}><Icon name="plus"/>Add item</a>}</div>;
}

function DetailHead({tab, title, meta}: {tab: Tab; title: string; meta?: string}) {
  return <div className="wk-detail-head"><a className="wk-back" href={'#' + tab}><Icon name="back" size={15}/>{tab === 'records' ? 'Company records' : 'This week'}</a><PageHead title={title} meta={meta}/></div>;
}

function ItemRow({item, tab}: {item: Item; tab: Tab}) {
  const subtitle = item.status === 'waiting' ? 'Waiting for ' + (item.waitingFor || 'a response') : item.nextAction;
  return <a className={'wk-item wk-item-' + item.status} href={detailHref('items/' + item.id, tab)}>
    <span className="wk-row-text"><strong>{item.title}</strong>{subtitle && <span className="wk-subtitle">{subtitle}</span>}</span>
    <span className="wk-row-labels">{item.recurrence === 'monthly' && <span><Icon name="repeat" size={14}/>{monthLabel(item.period) || 'Monthly'}</span>}
      {tab === 'records' && <span>{({ready: 'Ready', waiting: 'Waiting', done: 'Completed'})[item.status]}</span>}
      {item.dueDate && item.status !== 'done' && <span>Due {dateLabel(item.dueDate)}</span>}</span>
    <span className="wk-row-open"><Icon name="angle" size={16}/></span></a>;
}

function GroupHead({title, count}: {title: string; count: number}) {
  return <div className="wk-group-head"><span className="wk-section-mark" aria-hidden="true"/><h2>{title}</h2><span className="wk-count" aria-label={count + ' items'}>{count}</span></div>;
}

function Group({kind, items}: {kind: 'ready' | 'waiting'; items: Item[]}) {
  const ready = kind === 'ready';
  return <section className={'wk-group ' + kind}><GroupHead title={ready ? 'Ready to act' : 'Waiting on'} count={items.length}/>
    <div className="wk-rows">{items.length ? items.map(item => <ItemRow key={item.id} item={item} tab="week"/>) : <p className="wk-empty">{ready ? 'No items ready to act on. Add an item when you have a next action.' : 'Nothing waiting for a reply or confirmation.'}</p>}</div></section>;
}

function DuePanel({items, today, end}: {items: Item[]; today: string; end: string}) {
  const entries = items.flatMap(item => [
    {item, date: item.dueDate || '', kind: 'Due'},
    {item, date: item.followUpDate || '', kind: 'Follow up'}
  ]).filter(entry => entry.date && entry.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.item.title.localeCompare(b.item.title));
  return <section className="wk-due-panel"><GroupHead title="Coming due" count={entries.length}/>
    {entries.length ? <div className="wk-agenda">{entries.map(({item, date, kind}) =>
      <a key={item.id + kind} href={detailHref('items/' + item.id, 'week')} className="wk-date-item">
        <span className="wk-date-stamp"><span>{dateLabel(date, {month:'short'})}</span><b>{dateLabel(date, {day:'numeric'})}</b></span>
        <span><strong>{item.title}</strong><small className={date < today ? 'wk-overdue' : undefined}>{kind} · {date < today ? 'Overdue' : date === today ? 'Today' : dateLabel(date, {weekday:'long'})}</small></span></a>)}</div>
      : <p className="wk-empty">No due dates or follow-ups in the next seven days.</p>}</section>;
}

function ProfileCard({workspace, tab}: {workspace: WorkspaceInfo; tab: Tab}) {
  return <aside className="wk-profile-card" aria-label="Company profile"><div className="wk-folder-back"/><div className="wk-folder-middle"/><div className="wk-folder-face">
    <div className="wk-profile-top"><img src="/assets/emblem.svg" width="39" height="37" alt=""/><a className="wk-profile-edit" href={detailHref('company', tab)} aria-label="Edit company details"><Icon name="edit"/></a></div>
    <h2>{displayName(workspace)}</h2><p>{workspace.country} · {workspace.stage === 'forming' ? 'In formation' : 'Operating'}</p></div></aside>;
}

function Weekly({items, workspace}: {items: Item[]; workspace: WorkspaceInfo}) {
  const open = items.filter(item => item.status !== 'done');
  const today = localDay();
  const end = localDay(6);
  return <><PageHead title="This week" meta={dateRange(today, end)} addTo="week"/>
    <div className="wk-sheet wk-week-grid"><div className="wk-ledger">
      <Group kind="ready" items={open.filter(item => item.status === 'ready')}/>
      <Group kind="waiting" items={open.filter(item => item.status === 'waiting')}/></div>
      <div className="wk-side"><DuePanel items={open} today={today} end={end}/><ProfileCard workspace={workspace} tab="week"/></div></div></>;
}

function Records({items, workspace, filter}: {items: Item[]; workspace: WorkspaceInfo; filter: Filter}) {
  const completed = items.filter(item => item.status === 'done').sort((a,b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  const open = items.filter(item => item.status !== 'done');
  const filters = [{key:'all', label:'All items', count:items.length}, {key:'open', label:'Open', count:open.length}, {key:'completed', label:'Completed', count:completed.length}];
  const list = filter === 'completed' ? completed : filter === 'open' ? open : [...open, ...completed];
  return <><PageHead title="Company records" meta={displayName(workspace)} addTo="records"/><div className="wk-sheet wk-week-grid">
    <section><nav className="wk-filters" aria-label="Filter records">{filters.map(({key,label,count}) => <a key={key} className="wk-filter" href={key === 'all' ? '#records' : '#records?show=' + key} aria-current={filter === key ? 'page' : undefined}>{label} <span>{count}</span></a>)}</nav>
    <div className="wk-rows">{list.length ? list.map(item => <ItemRow key={item.id} item={item} tab="records"/>) : <p className="wk-empty">{filter === 'completed' ? 'Completed items and their confirmations will appear here.' : 'No items filed here yet.'}</p>}</div></section>
    <div className="wk-side"><ProfileCard workspace={workspace} tab="records"/></div></div></>;
}

function HistoryPanel({item, items, tab}: {item?: Item; items: Item[]; tab: Tab}) {
  if (!item?.seriesId) return null;
  const related = items.filter(other => other.seriesId === item.seriesId && other.id !== item.id)
    .sort((a,b) => (b.period || '').localeCompare(a.period || ''));
  if (!related.length) return null;
  return <section className="wk-history"><h2>Other occurrences</h2>{related.map(other =>
    <a key={other.id} href={detailHref('items/' + other.id, tab)}><span><strong>{monthLabel(other.period) || other.title}</strong><small>{other.status === 'done' ? 'Completed' : 'Open occurrence'}</small></span><Icon name="angle" size={16}/></a>)}</section>;
}

function DocumentLink({url, children}: {url?: string | null; children: ReactNode}) {
  if (!url) return null;
  try {
    if (!['http:', 'https:'].includes(new URL(url).protocol)) return null;
  } catch {
    return null;
  }
  return <a className="wk-document-link" href={url} target="_blank" rel="noopener noreferrer"><Icon name="link" size={16}/>{children}</a>;
}

function CompletedView({item, items, tab}: {item: Item; items: Item[]; tab: Tab}) {
  const values = [
    ['Why it matters', item.why], ['Next action recorded', item.nextAction],
    ['Due date', dateLabel(item.dueDate, {dateStyle:'long'})], ['Follow-up date', dateLabel(item.followUpDate, {dateStyle:'long'})], ['Waiting for', item.waitingFor]
  ].filter(([,value]) => value);
  const meta = [monthLabel(item.period), 'Completed ' + dateLabel(item.completedAt, {dateStyle:'long'})].filter(Boolean).join(' · ');
  return <><DetailHead tab={tab} title={item.title} meta={meta}/><div className="wk-sheet wk-edit-grid"><div>
    <div className="wk-record-seal"><Icon name="check"/>Completed record</div><dl className="wk-record-values">{values.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <section className="wk-document-section"><h2>Documents &amp; confirmation</h2><DocumentLink url={item.evidenceUrl}>Open confirmation or document</DocumentLink><DocumentLink url={item.sourceUrl}>Open date source</DocumentLink>
      {!item.evidenceUrl && !item.sourceUrl && <p className="wk-empty">No links saved with this record.</p>}</section></div><div><HistoryPanel item={item} items={items} tab={tab}/></div></div></>;
}

type FieldProps = {label: string; name: string; value?: string | null; area?: boolean; required?: boolean; type?: string; hint?: string; limit?: number};
function Field({label, name, value, area, required, type = 'text', hint, limit}: FieldProps) {
  const id = useId();
  const attributes = {id, name, defaultValue: value || '', required, maxLength: limit, 'aria-describedby': hint ? id + '-hint' : undefined};
  return <div className="wk-field"><label htmlFor={id}>{label}</label>
    {area ? <textarea {...attributes} rows={2}/> : <input {...attributes} type={type}/>}
    {hint && <small id={id + '-hint'}>{hint}</small>}</div>;
}

type SelectProps = {label: string; name: string; value: string; choices: [string, string][]; change?: (value: string) => void};
function SelectField({label, name, value, choices, change}: SelectProps) {
  const id = useId();
  const selection = change ? {value, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => change(event.target.value)} : {defaultValue: value};
  return <div className="wk-field"><label htmlFor={id}>{label}</label><select id={id} name={name} {...selection}>
    {choices.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></div>;
}

function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function save(operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save changes. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return {busy, error, save};
}

function ItemEditor({item, items, tab, refresh, notice}: SaveProps & {item?: Item; items: Item[]}) {
  const [status, setStatus] = useState(item?.status || 'ready');
  const [recurrence, setRecurrence] = useState(item?.recurrence || 'none');
  const {busy, error, save} = useSave();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const complete = button?.value === 'complete';
    if (status !== 'waiting') data.waitingFor = '';
    void save(async () => {
      const path = !item ? '/api/items' : '/api/items/' + item.id + (complete ? '/complete' : '');
      await api(path, !item || complete ? 'POST' : 'PATCH', data);
      await refresh();
      if (!complete) location.hash = tab;
      notice(complete ? 'Item completed.' : item ? 'Changes saved.' : 'Item added.');
    });
  }
  return <><DetailHead tab={tab} title={item?.title || 'Add an item'} meta={item?.recurrence === 'monthly' ? monthLabel(item.period) || 'Monthly' : undefined}/>
    <form className="wk-sheet wk-edit-grid" onSubmit={submit}><div className="wk-form-main">
      <section className="wk-fields"><h2>Item details</h2>
      <Field label="Item title" name="title" value={item?.title} required limit={200}/>
      <Field label="Why it matters" name="why" value={item?.why} area limit={5000}/>
      <Field label="Next action" name="nextAction" value={item?.nextAction} area limit={5000}/>
      <SelectField name="status" label="Status" value={status} change={v => setStatus(v as 'ready' | 'waiting')} choices={[[ 'ready', 'Ready to act' ],[ 'waiting', 'Waiting' ]]}/>
      <div hidden={status !== 'waiting'}><Field label="Who or what are you waiting for?" name="waitingFor" value={item?.waitingFor} required={status === 'waiting'} limit={500}/></div></section>
      <section className="wk-fields"><h2>Dates &amp; recurrence</h2><div className="wk-pair">
      <Field label="Due date" name="dueDate" value={item?.dueDate} type="date"/><Field label="Follow-up date" name="followUpDate" value={item?.followUpDate} type="date"/></div>
      <SelectField name="recurrence" label="Repeat" value={recurrence} change={v => setRecurrence(v as 'none' | 'monthly')} choices={[[ 'none', 'Does not repeat' ],[ 'monthly', 'Monthly' ]]}/>
      {recurrence === 'monthly' && <Field label="Record month" name="period" value={item?.period || localDay().slice(0,7)} type="month" required hint="Choose the month this work belongs to."/>}
      <Field label="Date source link" name="sourceUrl" value={item?.sourceUrl} type="url" limit={2048} hint="Link to the instructions from your accountant or official source."/><DocumentLink url={item?.sourceUrl}>Open date source</DocumentLink></section>
      <section className="wk-fields"><h2>Confirmation</h2><Field label="Confirmation or document link" name="evidenceUrl" value={item?.evidenceUrl} type="url" limit={2048}/><DocumentLink url={item?.evidenceUrl}>Open saved document</DocumentLink></section>
      {error && <p className="wk-error" role="alert">{error}</p>}
      <div className="wk-save-bar"><button className="wk-btn primary" type="submit" value="save" disabled={busy}>{item ? 'Save changes' : 'Add item'}</button>
      {item && <button className="wk-btn secondary" type="submit" value="complete" disabled={busy}><Icon name="check"/>Mark complete</button>}</div></div>
      <aside className="wk-editor-side"><HistoryPanel item={item} items={items} tab={tab}/>
        {recurrence === 'monthly' && <p className="wk-recurring-note"><Icon name="repeat"/><span>Completing this month saves its confirmation and opens the next month.</span></p>}</aside></form></>;
}

function CompanyEditor({workspace, tab, refresh, notice}: SaveProps & {workspace: WorkspaceInfo}) {
  const {busy, error, save} = useSave();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    void save(async () => {
      await api('/api/workspace', 'PATCH', data);
      await refresh();
      location.hash = tab;
      notice('Company details saved.');
    });
  }
  return <><DetailHead title="Company details" tab={tab}/><form className="wk-sheet wk-profile-form" onSubmit={submit}><section className="wk-fields">
    <Field label="Company name" name="name" value={workspace.name} limit={160} hint="A working name is fine. You can also leave this blank."/>
    <Field label="Country or region" name="country" value={workspace.country} required limit={120}/>
    <Field label="What does the business do?" name="description" value={workspace.description} required area limit={1500}/>
    <SelectField name="stage" label="Company stage" value={workspace.stage} choices={[[ 'forming', 'Being formed' ],[ 'operating', 'Already operating' ]]}/>
    </section>{error && <p className="wk-error" role="alert">{error}</p>}<div className="wk-save-bar"><button className="wk-btn primary" type="submit" disabled={busy}>Save changes</button></div></form></>;
}

export function Workspace({state, refresh, notice}: WorkspaceProps) {
  const [hash, setHash] = useState(location.hash);
  const main = useRef<HTMLElement>(null);
  const priorPage = useRef('');
  const route = readRoute(hash);
  const {workspace, items, user} = state;
  const item = route.id ? items.find(record => String(record.id) === route.id) : undefined;
  const pageKey = hash + (item?.status === 'done' ? '/completed' : '');
  useEffect(() => {
    const update = () => setHash(location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    const h1 = main.current?.querySelector('h1');
    document.title = (h1?.textContent || 'Workspace') + ' · Companykeeping';
    if (priorPage.current !== pageKey) {
      h1?.focus({preventScroll:true});
      window.scrollTo(0,0);
      priorPage.current = pageKey;
    }
  }, [pageKey]);
  if (!workspace || !user) return null;
  const saveProps = {tab:route.tab, refresh, notice};
  let content;
  switch (route.view) {
    case 'records': content = <Records items={items} workspace={workspace} filter={route.filter}/>; break;
    case 'new': content = <ItemEditor key="new" items={items} {...saveProps}/>; break;
    case 'company': content = <CompanyEditor workspace={workspace} {...saveProps}/>; break;
    case 'item':
      if (!item) content = <DetailHead tab={route.tab} title="Item unavailable" meta="Choose an item from your company records."/>;
      else if (item.status === 'done') content = <CompletedView item={item} items={items} tab={route.tab}/>;
      else content = <ItemEditor key={item.id} item={item} items={items} {...saveProps}/>;
      break;
    default: content = <Weekly items={items} workspace={workspace}/>;
  }
  return <div className="wk-shell"><Masthead workspace={workspace} email={user.email} {...saveProps}/><main className="wk-main" ref={main}><Tabs current={route.tab}/><div className="wk-file">{content}</div></main>
    <footer className="wk-footer"><span>Companykeeping</span><span>A product by <a href="https://fgu.martinvolejnik.com" rel="external">For General Use</a></span></footer></div>;
}
