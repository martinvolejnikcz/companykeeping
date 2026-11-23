import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, message, type NotaryBrief, type WorkspaceInfo } from './shared';
import { downloadCzechDocument } from './downloadCzechDocument';
import './foundingBrief.css';

type Mode = 'closed' | 'edit' | 'preview';
type TextKey = Exclude<keyof NotaryBrief, 'founders' | 'directors'>;
type DocumentKind = 'single' | 'multiple';
const documentOptions = [
  {kind: 'single', title: 'Zakladatelská listina', founders: 'One founder', filename: 'zakladatelska-listina'},
  {kind: 'multiple', title: 'Společenská smlouva', founders: 'Several founders', filename: 'spolecenska-smlouva'},
] as const;
const emptyFounder = () => ({name: '', contributionCzk: ''});

function blankBrief(kind: DocumentKind): NotaryBrief {
  return {
    companyName: '', registeredOffice: '', activity: '',
    founders: kind === 'single' ? [emptyFounder()] : [emptyFounder(), emptyFounder()],
    directors: [''], signing: '', registeredCapitalCzk: '', contributionAdministrator: '',
    paymentSchedule: '', otherFunding: '', notes: '', questions: '',
  };
}

function initialBrief(workspace: WorkspaceInfo, saved: NotaryBrief | null): NotaryBrief {
  const values = saved || {
    ...blankBrief('single'),
    companyName: workspace.name === 'Untitled company' ? '' : workspace.name,
    activity: workspace.description,
  };
  return {
    ...values,
    founders: values.founders.length ? values.founders : [emptyFounder()],
    directors: values.directors.length ? values.directors : [''],
  };
}

function normalizeAmount(value: string) {
  return value.replace(/\s+/g, '').replace(',', '.');
}

function minorUnits(value: string) {
  const numeric = normalizeAmount(value);
  if (!/^\d{1,15}(?:\.\d{1,2})?$/.test(numeric)) return null;
  const [whole, fraction = ''] = numeric.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function czk(minor: bigint) {
  const whole = (minor / 100n).toLocaleString('cs-CZ');
  const rest = minor % 100n;
  return whole + (rest ? ',' + String(rest).padStart(2, '0') : '') + ' Kč';
}

function fundingTotals(data: NotaryBrief) {
  const intended = minorUnits(data.registeredCapitalCzk);
  const amounts = data.founders.map(founder => minorUnits(founder.contributionCzk));
  if (!amounts.length || amounts.some(value => value === null)) return {intended, listed: null};
  return {intended, listed: amounts.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n)};
}

function filled(value: string | undefined, missing: string) {
  return value?.trim() || '[' + missing + ']';
}

function clause(prefix: string, value: string, missing: string) {
  const text = filled(value, missing);
  return prefix + text + (/[.!?…]$/.test(text) ? '' : '.');
}

function amountOrPlaceholder(value: string, placeholder: string) {
  const minor = minorUnits(value);
  return minor === null ? '[' + placeholder + ']' : czk(minor);
}

function composeDraft(data: NotaryBrief) {
  const founders = data.founders;
  const single = founders.length === 1;
  const formName = single ? 'zakladatelské listiny' : 'společenské smlouvy';
  const founderLines = founders.map((founder, i) => (i + 1) + '. ' + filled(founder.name, 'doplnit jméno nebo název zakladatele')
    + ' — navrhovaný vklad ' + amountOrPlaceholder(founder.contributionCzk, 'doplnit částku v Kč') + '.');
  const directors = data.directors.filter(name => name.trim());
  const {intended, listed} = fundingTotals(data);
  const section = (heading: string, ...paragraphs: string[]) => [heading, ...paragraphs.filter(Boolean)].join('\n');
  return [
    'Pracovní návrh ' + formName + ' pro českou s.r.o.\nPodklad pro notáře k projednání a doplnění.',
    section('I. Zakladatelé',
      single ? 'Jediný zakladatel ' + filled(founders[0].name, 'doplnit jméno nebo název') + ' zamýšlí založit společnost s ručením omezeným.'
      : 'Zakladatelé uvedení v článku III zamýšlejí společně založit společnost s ručením omezeným.',
      '[Doplnit identifikační údaje zakladatelů podle pokynů notáře.]'),
    section('II. Obchodní firma, sídlo a činnost',
      clause('Navrhovaná obchodní firma je ', data.companyName, 'doplnit úplný název včetně právní formy'),
      clause('Navrhované sídlo společnosti je ', data.registeredOffice, 'doplnit obec a adresu'),
      clause('Zamýšlený předmět podnikání nebo činnosti je uveden takto: ', data.activity, 'doplnit popis činnosti')),
    section('III. Základní kapitál, vklady a podíly',
      'Navrhovaný základní kapitál společnosti činí ' + amountOrPlaceholder(data.registeredCapitalCzk, 'doplnit výši základního kapitálu v Kč') + '.',
      founderLines.join('\n'),
      intended !== null && listed !== null && intended !== listed ? '[Vyjasnit rozdíl: součet uvedených vkladů je ' + czk(listed) + ', zamýšlený základní kapitál činí ' + czk(intended) + '.]' : '',
      '[Upřesnit podíly jednotlivých společníků, jejich druhy a případná zvláštní práva.]'),
    section('IV. Správa a splnění vkladové povinnosti',
      clause('Správcem vkladů má být ', data.contributionAdministrator, 'doplnit správce vkladů'),
      clause('Navrhovaný způsob a lhůta splnění vkladové povinnosti: ', data.paymentSchedule, 'doplnit způsob a lhůtu splacení nebo vnesení vkladů')),
    section('V. Jednatelé a zastupování společnosti',
      directors.length === 1 ? 'Prvním jednatelem má být ' + directors[0].trim() + '.'
      : directors.length > 1 ? 'Prvními jednateli mají být: ' + directors.join(', ') + '.'
      : '[Doplnit prvního jednatele nebo jednatele společnosti.]',
      '[Doplnit identifikační údaje jednatelů podle pokynů notáře.]',
      clause('Navrhovaný způsob jednání za společnost: ', data.signing, 'doplnit, kdo jedná samostatně nebo společně')),
    section('Podklady k projednání s notářem',
      data.otherFunding.trim() ? 'Další plánované financování mimo základní kapitál: ' + data.otherFunding.trim() : '',
      data.notes.trim() ? 'Další pokyny zakladatelů: ' + data.notes.trim() : '',
      data.questions.trim() ? 'Otázky pro notáře: ' + data.questions.trim() : '',
      'Prosíme o kontrolu navržených ustanovení, upřesnění otevřených údajů a přípravu konečného znění notářského zápisu.'),
  ].join('\n\n') + '\n';
}

type FieldProps = {
  label: string; value: string; onChange: (value: string) => void; limit: number;
  hint?: string; multiline?: boolean; amount?: boolean;
};

function BriefField({label, value, onChange, limit, hint, multiline, amount}: FieldProps) {
  const id = useId();
  const attributes = {id, value, maxLength:limit, 'aria-describedby': hint ? id + '-hint' : undefined};
  return <div className="nb-field"><label htmlFor={id}>{label}</label>
    {multiline ? <textarea {...attributes} rows={2} onChange={e => onChange(e.target.value)}/> :
      <input {...attributes} type="text" inputMode={amount ? 'decimal' : undefined} onChange={e => onChange(e.target.value)}/>}
    {hint && <small id={id + '-hint'}>{hint}</small>}</div>;
}

export function FoundingBrief({workspace, saved, refresh, notice, initialMode = 'closed'}: {
  workspace: WorkspaceInfo; saved: NotaryBrief | null; refresh: () => Promise<void>; notice: (text: string) => void;
  initialMode?: 'closed' | 'preview';
}) {
  const [data, setData] = useState(() => initialBrief(workspace, saved));
  const [kind, setKind] = useState<DocumentKind>(data.founders.length > 1 ? 'multiple' : 'single');
  const [choiceNote, setChoiceNote] = useState('');
  const [mode, setMode] = useState<Mode>(initialMode);
  const [dirty, setDirty] = useState(false);
  const [hasSaved, setHasSaved] = useState(!!saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyFailure, setCopyFailure] = useState('');
  const [exportError, setExportError] = useState('');
  const radioGroup = useId();
  const saving = useRef(false);
  const preview = useRef<HTMLPreElement>(null);
  const header = useRef<HTMLHeadingElement>(null);

  function update<K extends keyof NotaryBrief>(key: K, value: NotaryBrief[K]) {
    setData(current => ({...current, [key]: value}));
    setDirty(true);
    setError('');
  }

  function field(key: TextKey, label: string, limit: number, options: Partial<FieldProps> = {}) {
    return <BriefField label={label} limit={limit} value={data[key]} onChange={value => update(key, value)} {...options}/>;
  }

  function changeMode(next: Mode) {
    setCopyFailure('');
    setExportError('');
    if (next === 'closed') setKind(data.founders.length > 1 ? 'multiple' : 'single');
    setMode(next);
    header.current?.focus({preventScroll: true});
    header.current?.scrollIntoView({block:'start'});
  }

  function openSelectedDocument() {
    setChoiceNote('');
    if (kind === 'multiple' && data.founders.length === 1) {
      update('founders', [...data.founders, emptyFounder()]);
    } else if (kind === 'single' && data.founders.length > 1) {
      const entered = data.founders.filter(founder => founder.name.trim() || founder.contributionCzk.trim());
      if (entered.length > 1) {
        setChoiceNote('This draft already contains several founders. Their entries are still here. To prepare a single-founder deed, remove the founders you no longer intend to include.');
      } else {
        update('founders', entered.length ? entered : [emptyFounder()]);
      }
    }
    changeMode('edit');
  }

  function validAmounts() {
    const fields = [
      ...data.founders.map((founder, i) => ({label:'Founder ' + (i + 1) + ' contribution',value:founder.contributionCzk})),
      {label:'Total registered capital', value:data.registeredCapitalCzk},
    ];
    const invalid = fields.find(({value}) => value.trim() && minorUnits(value) === null);
    if (invalid) {
      setError(invalid.label + ' needs a CZK amount with up to 15 digits and two decimal places. You can also leave it blank.');
      return false;
    }
    return true;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current || !validAmounts()) return;
    saving.current = true;
    setBusy(true);
    setError('');
    const body: NotaryBrief = {
      ...data,
      founders: data.founders.map(founder => ({...founder, contributionCzk: normalizeAmount(founder.contributionCzk)})),
      registeredCapitalCzk: normalizeAmount(data.registeredCapitalCzk),
    };
    try {
      const stored = await api<NotaryBrief>('/api/notary-brief', 'PUT', body);
      setData(initialBrief(workspace, stored));
      setHasSaved(true);
      setDirty(false);
      changeMode('preview');
      notice('Founding brief saved.');
      await refresh();
    } catch (reason) {
      setError(message(reason));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const draft = composeDraft(data);
  async function downloadWord(blank: boolean) {
    setExportError('');
    const documentKind = blank ? kind : data.founders.length === 1 ? 'single' : 'multiple';
    const option = documentOptions.find(item => item.kind === documentKind)!;
    try {
      await downloadCzechDocument(blank ? composeDraft(blankBrief(kind)) : draft, option.filename + (blank ? '-vzor.docx' : '-navrh.docx'));
    } catch {
      setExportError('The Word document could not be downloaded. Try again.');
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyFailure('');
      notice('Draft copied.');
    } catch {
      preview.current?.focus();
      if (preview.current) window.getSelection()?.selectAllChildren(preview.current);
      setCopyFailure('The draft text is selected. Use your usual copy command or download the text file.');
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([draft], {type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'navrh-zakladatelskeho-dokumentu.txt';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const {listed, intended} = fundingTotals(data);
  const archived = initialMode === 'preview';
  return <section className="nb-file" aria-label="Founding brief">
    <header className="nb-head"><h2 tabIndex={-1} ref={header}>{archived ? 'Founding brief' : 'Czech s.r.o. founding documents'}</h2>
      {(hasSaved || dirty) && <span className="nb-status">{dirty ? 'Unsaved changes' : 'Saved in this workspace'}</span>}</header>
    {!archived && mode === 'closed' ? <p className="nb-intro nb-notary"><strong>Yes, you need a notary to form a Czech s.r.o.</strong>{' '}
      You can draft the terms yourself. The notary prepares the official deed for the founders to sign.{' '}
      <a href="https://portal.gov.cz/en/informace/the-process-of-incorporation-and-setting-up-a-business-corporation-INF-221" target="_blank" rel="noopener noreferrer">Gov.cz guidance</a></p>
      : <p className="nb-intro">Set out the founders, capital and signing arrangements in a Czech working draft for the notary to review.</p>}
    {exportError && <p className="wk-error" role="alert">{exportError}</p>}
    {mode === 'closed' ? <>
      {!archived && <fieldset className="nb-doc-chooser"><legend>Choose a Czech founding document</legend><div>
        {documentOptions.map(option => <label key={option.kind}>
          <input type="radio" name={radioGroup} checked={kind === option.kind} onChange={() => setKind(option.kind)}/>
          <span><strong lang="cs">{option.title}</strong><small>{option.founders}</small></span>
        </label>)}
      </div></fieldset>}
      <div className="nb-tools">
        <button type="button" className="wk-btn primary" onClick={archived ? () => changeMode('edit') : openSelectedDocument}>{hasSaved ? 'Edit founding brief' : 'Prepare a founding brief'}</button>
        {!archived && <button type="button" className="wk-btn secondary" onClick={() => void downloadWord(true)}>Download blank Word template</button>}
        {hasSaved && <button type="button" className="nb-link" onClick={() => changeMode('preview')}>Preview Czech draft</button>}
      </div>
      {!archived && <a className="nb-official" href="https://or.justice.cz/ias/ui/download/vzor_spolecenske_smlouvy.docx" target="_blank" rel="noopener noreferrer">Official Czech model (.docx)</a>}
    </>
    : mode === 'edit' ? <form aria-label="Edit founding brief" onSubmit={save}><fieldset className="nb-edit" disabled={busy}>
      {choiceNote && data.founders.length > 1 && <p className="nb-choice-note" role="status">{choiceNote}</p>}
      <section className="nb-section"><h3>Company details</h3><p>Use Czech wording where you have it. The draft includes your descriptions as you enter them and marks missing details in brackets.</p>
        {field('companyName','Proposed company name',200,{hint:'Include the intended legal form, for example Contour Studio s.r.o.'})}
        {field('registeredOffice','Registered office',500,{hint:'Give the proposed municipality and address (sídlo). A partial address is fine for a first draft.'})}
        {field('activity','Business activity',1500,{multiline:true,hint:'Describe what customers will pay the company to do.'})}</section>

      <section className="nb-section"><h3>Founders and capital</h3><p>Enter each proposed founder and the CZK value of their intended contribution to registered capital.</p>
        {data.founders.map((founder,i) => <div className="nb-person" key={i}><div className="nb-pair">
          <BriefField label={'Founder ' + (i + 1) + ' name'} value={founder.name} limit={200}
            onChange={value => update('founders', data.founders.map((row,n) => n === i ? {...row,name:value} : row))}/>
          <BriefField label={'Founder ' + (i + 1) + ' contribution (CZK)'} value={founder.contributionCzk} limit={24} amount
            onChange={value => update('founders', data.founders.map((row,n) => n === i ? {...row,contributionCzk:value} : row))}/></div>
          {data.founders.length > 1 && <button type="button" className="nb-link" onClick={() => update('founders',data.founders.filter((_,n) => n !== i))}>Remove founder {i + 1}</button>}</div>)}
        {data.founders.length < 50 && <button type="button" className="nb-add" onClick={() => update('founders',[...data.founders,emptyFounder()])}>Add founder</button>}
        {field('registeredCapitalCzk','Total registered capital (CZK)',24,{amount:true,hint:'The proposed základní kapitál. Enter operating funds separately below.'})}
        {listed !== null && <p className="nb-reconcile" aria-live="polite">Listed contributions total {czk(listed)}.{intended !== null && listed !== intended ? ' The proposed capital is ' + czk(intended) + '. The draft flags the difference for review.' : ''}</p>}
        {field('contributionAdministrator','Contribution administrator',200,{hint:'Who will receive or administer contributions before registration (správce vkladů)?'})}
        {field('paymentSchedule','Contribution payment schedule',1500,{multiline:true,hint:'Describe how and when each contribution would be paid or delivered, including any amount still to come.'})}
      </section>

      <section className="nb-section"><h3>Directors and signing</h3>
        {data.directors.map((name,i) => <div className="nb-person" key={i}>
          <BriefField label={'Director ' + (i + 1) + ' name'} value={name} limit={200} onChange={value => update('directors',data.directors.map((old,n) => n === i ? value : old))}/>
          {data.directors.length > 1 && <button type="button" className="nb-link" onClick={() => update('directors',data.directors.filter((_,n) => n !== i))}>Remove director {i + 1}</button>}</div>)}
        {data.directors.length < 50 && <button type="button" className="nb-add" onClick={() => update('directors',[...data.directors,''])}>Add director</button>}
        {field('signing','How directors will sign',1500,{multiline:true,hint:'Say whether each proposed jednatel can act alone or which directors should act together.'})}
      </section>

      <section className="nb-section"><h3>Notes for the notary</h3>
        {field('otherFunding','Additional funding',3000,{multiline:true,hint:'Record money planned for operating costs, such as a loan or other financing. This stays separate from registered capital.'})}
        {field('notes','Other drafting instructions',3000,{multiline:true,hint:'For example, how you want ownership or voting rights to work, or a possible non-cash contribution.'})}
        {field('questions','Questions for the notary',3000,{multiline:true})}</section>
      {error && <p role="alert" className="wk-error">{error}</p>}
      <div className="nb-tools"><button type="submit" className="wk-btn primary">{busy ? 'Saving…' : 'Save founding brief'}</button>
        <button type="button" className="wk-btn secondary" onClick={() => { if (validAmounts()) changeMode('preview'); }}>Preview Czech draft</button>
        <button type="button" className="nb-link" onClick={() => changeMode('closed')}>Collapse brief</button></div>
    </fieldset></form> : <section className="nb-preview" aria-label="Czech working draft">
      <div className="nb-preview-head"><h3>Czech working draft</h3><button type="button" className="nb-link" onClick={() => changeMode('edit')}>Edit founding brief</button></div>
      {error && <p role="alert" className="wk-error">{error}</p>}
      {copyFailure && <p role="status">{copyFailure}</p>}
      <div className="nb-tools">{(!hasSaved || dirty) && <button type="button" className="wk-btn primary" onClick={save} disabled={busy}>Save founding brief</button>}
        <button type="button" className="wk-btn secondary" onClick={() => void downloadWord(false)}>Download Word draft</button>
        <button type="button" className="wk-btn secondary" onClick={copy}>Copy draft</button>
        <button type="button" className="nb-link" onClick={download}>Download draft (.txt)</button>
        <button type="button" className="nb-link" onClick={() => changeMode('closed')}>Collapse brief</button></div>
      <pre tabIndex={0} ref={preview} lang="cs">{draft}</pre>
    </section>}
  </section>;
}
