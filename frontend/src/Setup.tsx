import { useState, type FormEvent } from 'react';
import { api, type Profile, type Example, type ItemInput, type State } from './shared';
import { ErrorNote, Icon, Progress, useSubmit } from './EntryUI';

const blank: Profile = {name:'',country:'',description:'',stage:'forming'};
type Refresh = () => Promise<void>;

function FileCard({profile,children}: {profile: Profile; children?: React.ReactNode}) {
  return <aside className="setup-aside">
    <div className="setup-folder"><div className="folder-tab">Company file</div>
      <div className="folder-face"><img src="/assets/emblem.svg" alt="" width="51" height="51"/>
        <h2>{profile.name.trim() || 'Untitled company'}</h2>
        <dl><div><dt>Country or region</dt><dd>{profile.country.trim() || 'To be added'}</dd></div>
          <div><dt>Stage</dt><dd>{profile.stage === 'forming' ? 'In formation' : 'Operating'}</dd></div></dl>
      </div>
    </div>
    {children}
  </aside>;
}

export function CompanyForm({initialExample,refresh}: {initialExample: Example | null; refresh: Refresh}) {
  const [profile,setProfile] = useState<Profile>(initialExample?.workspace ?? blank);
  const [previous,setPrevious] = useState<Profile>(blank);
  const [demo,setDemo] = useState(!!initialExample);
  const {busy,error,run} = useSubmit();
  function update(key: keyof Profile, value: string) { setProfile(previous => ({...previous,[key]:value})); }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api('/api/workspace','POST',{...profile,demo});
      await refresh(); window.scrollTo(0,0);
    });
  }
  function chooseExample() {
    void run(async () => {
      if (demo) { setProfile(previous); setDemo(false); }
      else {
        const example = await api<Example>('/api/example');
        setPrevious(profile); setProfile(example.workspace); setDemo(true);
      }
    });
  }
  return <main className="entry-wrap setup-grid">
    <section className="setup-working"><Progress index={1}/>
      <h1>Your company</h1><p className="entry-intro">A few details help us suggest the right starting checklist.</p>
      <form className="entry-form profile-form" onSubmit={submit}>
        <label>Company name <small>Optional</small><input name="name" value={profile.name} onChange={e=>update('name',e.target.value)} maxLength={160} aria-describedby="name-help" placeholder="Your working or registered name"/></label>
        <p className="field-help" id="name-help">You can add a name after registration.</p>
        <label>Country or region<input name="country" value={profile.country} onChange={e=>update('country',e.target.value)} required maxLength={120} autoComplete="country-name" placeholder="Where you do business"/></label>
        <label>What does your business do?<textarea name="description" value={profile.description} onChange={e=>update('description',e.target.value)} required maxLength={1500} rows={2} placeholder="Describe the work and who it’s for."/></label>
        <fieldset><legend>Where are you now?</legend><div className="stage-options">
          {(['forming','operating'] as const).map(stage => <label key={stage}>
            <input type="radio" name="stage" checked={profile.stage === stage} onChange={()=>update('stage',stage)}/>
            <Icon name={stage === 'forming' ? 'sprout' : 'briefcase'} size={20}/>
            {stage === 'forming' ? 'Forming a company' : 'Already operating'}</label>)}
        </div></fieldset>
        <ErrorNote error={error}/>
        <button className="entry-primary" disabled={busy}>{busy ? 'Please wait…' : 'Build my checklist'}</button>
      </form>
    </section>
    <FileCard profile={profile}><div className="demo-choice"><h3>{demo ? 'Using the studio example' : 'Explore with a studio example'}</h3>
      <p>{demo ? 'Your file will include editable example work for For General Use and its product, Stillpoint.' : 'Try For General Use, the software studio building Stillpoint, with a sample checklist.'}</p>
      <button type="button" className="entry-link" disabled={busy} onClick={chooseExample}>{demo ? 'Use my own business' : 'Use studio example'}</button>
    </div></FileCard>
  </main>;
}

interface Row { key: number; selected: boolean; editing: boolean; item: ItemInput }

export function ChecklistForm({state,refresh}: {state: State; refresh: Refresh}) {
  const [rows,setRows] = useState<Row[]>(() => state.suggestions.map((item,key) => ({item,selected:true,editing:false,key})));
  const {busy,error,run} = useSubmit();
  const count = rows.filter(row=>row.selected).length;
  function change(key: number, updates: Partial<Row>) {
    setRows(rows => rows.map(row => row.key === key ? {...row,...updates} : row));
  }
  function add() {
    const key = (rows.at(-1)?.key ?? -1) + 1;
    setRows(rows => [...rows,{key,selected:true,editing:true,item:{title:'',why:'',nextAction:'',recurrence:'none'}}]);
    requestAnimationFrame(() => document.getElementById('title-' + key)?.focus());
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const empty = rows.find(row=>row.selected && !row.item.title.trim());
    if (empty) {
      change(empty.key,{editing:true});
      requestAnimationFrame(()=>document.getElementById('title-' + empty.key)?.focus());
      return;
    }
    void run(async () => {
      await api('/api/checklist','POST',{items:rows.filter(row=>row.selected).map(row=>row.item)});
      history.replaceState(null,'',location.pathname+'#week');
      await refresh(); window.scrollTo(0,0);
    });
  }
  const workspace = state.workspace!;
  return <main className="entry-wrap setup-grid checklist-grid">
    <section className="setup-working"><Progress index={2}/>
      <h1>Your starting checklist</h1>
      <p className="entry-intro">{workspace.stage === 'forming' ? 'Start with the work of setting up your company.' : 'Go straight to the work of running your business.'} Keep what fits, edit the details, or add your own item.</p>
      <form className="checklist-form" onSubmit={submit}>
        <div className="checklist-rows">{rows.map(row => <div className={'suggestion' + (row.selected ? '' : ' skipped')} key={row.key}>
          <div className="suggestion-head"><label><input type="checkbox" checked={row.selected} onChange={e=>change(row.key,{selected:e.target.checked})}/>
            <span>{row.item.title.trim() || 'New item'}</span></label>
            <button type="button" className="entry-icon" aria-label={(row.editing ? 'Close editor for ' : 'Edit ') + (row.item.title || 'new item')} aria-expanded={row.editing} onClick={()=>change(row.key,{editing:!row.editing})}><Icon name={row.editing ? 'close' : 'edit'} size={17}/></button></div>
          {row.editing ? <div className="suggestion-fields entry-form">
            <label>Item title<input id={'title-'+row.key} value={row.item.title} required={row.selected} maxLength={200} onChange={e=>change(row.key,{item:{...row.item,title:e.target.value}})}/></label>
            <label>Why it matters<textarea value={row.item.why || ''} maxLength={5000} onChange={e=>change(row.key,{item:{...row.item,why:e.target.value}})}/></label>
            <label>Next action<textarea value={row.item.nextAction || ''} maxLength={5000} onChange={e=>change(row.key,{item:{...row.item,nextAction:e.target.value}})}/></label>
            <label>Repeats<select value={row.item.recurrence || 'none'} onChange={e=>change(row.key,{item:{...row.item,recurrence:e.target.value as ItemInput['recurrence']}})}><option value="none">Does not repeat</option><option value="monthly">Monthly</option></select></label>
          </div> : <p>{row.item.why || row.item.nextAction}{row.item.recurrence==='monthly' && <small className="repeat-note">Repeats monthly</small>}</p>}
        </div>)}</div>
        <button type="button" className="add-own" onClick={add}><Icon name="plus" size={17}/>Add my own item</button>
        <ErrorNote error={error}/>
        <button className="entry-primary" disabled={busy}>{busy ? 'Opening workspace…' : 'Open my workspace'}</button>
      </form>
    </section>
    <FileCard profile={workspace}><div className="file-count"><strong>{count}</strong><span>{count === 1 ? 'item' : 'items'} selected</span></div></FileCard>
  </main>;
}
