import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { getCountryCode } from './countries';
import { CzechFormationWalkthrough } from './CzechFormationWalkthrough';
import { FoundingBrief } from './FoundingBrief';
import { getGuide, type GuideStep } from './guideContent';
import { api, message, type GuideAnswer, type GuideRoute, type State, type WorkspaceInfo } from './shared';
import './guide.css';

type GuideProps = {workspace: WorkspaceInfo; guide: State['guide']};
type SaveActions = {refresh: () => Promise<void>; notice: (text: string) => void};

function chapterHref(key: string) {
  return '#guide/' + encodeURIComponent(key);
}

function guideName(workspace: WorkspaceInfo) {
  return workspace.stage === 'forming' ? 'Formation guide' : 'Operations guide';
}

function hasCzechFormation(workspace: WorkspaceInfo) {
  return workspace.stage === 'forming' && getCountryCode(workspace.country) === 'CZ';
}

function FoundingDocumentsLink() {
  return <a className="fg-pack-shortcut" href="#guide/czech-sro">Prepare Czech founding documents</a>;
}

function Progress({steps, guide}: {steps: GuideStep[]; guide: State['guide']}) {
  const complete = steps.filter(step => guide[step.key]?.completed).length;
  const label = complete + ' of ' + steps.length + ' steps complete';
  return <div className="fg-progress"><span>{label}</span>
    <progress value={complete} max={steps.length} aria-label="Guide progress" aria-valuetext={label}/></div>;
}

export function WeeklyGuide({workspace, guide}: GuideProps) {
  const steps = getGuide(workspace, guide);
  const next = steps.find(step => !guide[step.key]?.completed);
  return <section className="fg-next" aria-label={guideName(workspace)}>
    <div className="fg-next-copy"><span className="fg-path">{guideName(workspace)} · {workspace.country}{next && ' · Step ' + (steps.indexOf(next) + 1)}</span>
      <h2>{next ? next.title : 'Your guide is complete'}</h2>
      <p>{next ? next.summary : 'Revisit your decisions as the business changes.'}</p>
      {hasCzechFormation(workspace) && <FoundingDocumentsLink/>}</div>
    <div className="fg-next-action"><Progress steps={steps} guide={guide}/>
      <a className="wk-btn primary" href={next ? chapterHref(next.key) : '#guide'}>{next ? (guide[next.key] ? 'Continue step' : 'Start step') : 'Review decisions'}</a></div>
  </section>;
}

function ChapterIndex({workspace, steps, guide, current}: GuideProps & {steps: GuideStep[]; current?: string}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  useEffect(() => { setExpanded(false); }, [current]);
  return <aside className="fg-index">
    <div className="fg-index-title"><div><h2>{guideName(workspace)}</h2><p>{workspace.country}</p></div>
      <button type="button" className="fg-index-toggle" aria-controls={listId} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Hide steps' : 'View steps'}</button></div>
    <Progress steps={steps} guide={guide}/>
    <nav className={'fg-chapters' + (expanded ? ' expanded' : '')} id={listId} aria-label="Guide steps"><ol>
      {steps.map((step, i) => {
        const record = guide[step.key];
        return <li key={step.key}><a href={chapterHref(step.key)} aria-current={current === step.key ? 'step' : undefined}>
          <span className={'fg-index-number' + (record?.completed ? ' complete' : '')} aria-hidden="true">{record?.completed ? '✓' : i + 1}</span>
          <span>{step.title}{record && <small>{record.completed ? 'Completed' : 'Draft saved'}</small>}</span></a></li>;
      })}
    </ol></nav>
  </aside>;
}

function Sources({sources}: {sources: GuideStep['sources']}) {
  if (!sources.length) return null;
  return <section className="fg-sources"><h2>Sources</h2><ul>{sources.map(source =>
    <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></li>
  )}</ul></section>;
}

function FollowUp({step}: {step: GuideStep}) {
  return <div className="fg-follow-up"><div><span>Suggested follow-up</span><p>{step.followUp.title}</p></div>
    <a className="wk-btn secondary" href={'#items/new?from=guide&step=' + encodeURIComponent(step.key)}>Create a follow-up</a></div>;
}

function EarlierDecision({step, record}: {step: GuideStep; record: GuideAnswer}) {
  const route = step.routes?.find(choice => choice.value === record.route);
  return <details className="fg-earlier"><summary>Your earlier decision</summary>
    {route && <strong>{route.label}</strong>}
    <p>{record.answer}</p>
    <a href={chapterHref(step.key)}>Revisit “{step.title}”</a>
  </details>;
}

function Chapter({step, index, total, record, next, previous, pack, offerPack, refresh, notice}: SaveActions & {
  step: GuideStep; index: number; total: number; record?: GuideAnswer; next?: GuideStep;
  previous?: {step: GuideStep; record: GuideAnswer};
  pack?: ReactNode; offerPack: boolean;
}) {
  const [answer, setAnswer] = useState(record?.answer || '');
  const [route, setRoute] = useState<GuideRoute | null>(record?.route || null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsFocus, setNeedsFocus] = useState(false);
  const pending = useRef(false);
  const answerInput = useRef<HTMLTextAreaElement>(null);
  const savedHeading = useRef<HTMLHeadingElement>(null);
  const answerId = useId();
  const reviewing = !!record?.completed && !editing;
  useEffect(() => {
    if (!needsFocus) return;
    if (reviewing) savedHeading.current?.focus();
    else answerInput.current?.focus();
    setNeedsFocus(false);
  }, [needsFocus, reviewing]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const clicked = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const completed = clicked?.value === 'finish';
    if (completed && !answer.trim()) {
      setError('Write your decision before finishing this step.');
      answerInput.current?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    const input = step.routes ? {answer, completed, route} : {answer, completed};
    void (async () => {
      try {
        const saved = await api<GuideAnswer>('/api/guide/' + encodeURIComponent(step.key), 'PATCH', input);
        await refresh();
        setAnswer(saved.answer);
        setRoute(saved.route || null);
        setEditing(false);
        setNeedsFocus(true);
        notice(saved.completed ? 'Decision saved.' : 'Draft saved.');
      } catch (reason) {
        setError(message(reason));
      } finally {
        setBusy(false);
        pending.current = false;
      }
    })();
  }

  function editDecision() {
    setAnswer(record?.answer || '');
    setRoute(record?.route || null);
    setEditing(true);
    setNeedsFocus(true);
  }
  const savedChoice = step.routes?.find(choice => choice.value === record?.route)?.label;
  return <article className="fg-chapter">
    <header className="fg-chapter-head"><p>Step {index + 1} of {total}</p>
      <h1 tabIndex={-1}>{step.title}</h1><div>{step.summary}</div>
      {offerPack && <FoundingDocumentsLink/>}</header>
    {previous?.record.answer.trim() && <EarlierDecision step={previous.step} record={previous.record}/>}
    {pack || <><ul className="fg-instructions">{step.points.map(point => <li key={point}>{point}</li>)}</ul>
      {step.example && <aside className="fg-example"><strong>Example</strong><p>{step.example}</p></aside>}</>}
    <Sources sources={step.sources}/>
    {reviewing ? <section className="fg-decision fg-filed">
      <div className="fg-filed-head"><h2 tabIndex={-1} ref={savedHeading}>Your decision</h2>
        <button className="fg-text-btn" type="button" onClick={editDecision}>Edit decision</button></div>
      <p className="fg-question">{step.question}</p>
      {savedChoice && <p className="fg-answer-route">{savedChoice}</p>}
      <p className="fg-saved-answer">{record.answer}</p>
      <a className="wk-btn primary" href={next ? chapterHref(next.key) : '#guide'}>{next ? 'Continue to next step' : 'Review all decisions'}</a>
    </section> : <form className="fg-decision" onSubmit={submit}>
      <h2>Your decision</h2>
      {step.routes && <fieldset className="fg-route" disabled={busy}><legend>Which route are you exploring?</legend><div>
        {step.routes.map(choice => <label key={choice.value}><input type="radio" name="guide-route" value={choice.value}
          checked={route === choice.value} onChange={() => setRoute(choice.value)}/>{choice.label}</label>)}
      </div></fieldset>}
      <label className="fg-question" htmlFor={answerId}>{step.question}</label>
      <textarea id={answerId} ref={answerInput} value={answer} rows={4} maxLength={3000} onChange={e => setAnswer(e.target.value)} disabled={busy}/>
      {error && <p className="wk-error" role="alert">{error}</p>}
      <div className="fg-save"><button className="wk-btn primary" type="submit" value="finish" disabled={busy}>{record?.completed ? 'Save changes' : 'Finish step'}</button>
        <button className="wk-btn secondary" type="submit" value="draft" disabled={busy}>{record?.completed ? 'Reopen as draft' : 'Save draft'}</button>
        {busy && <span role="status">Saving…</span>}</div>
    </form>}
    {record && <FollowUp step={step}/>}
  </article>;
}

function GuideReview({steps, guide}: {steps: GuideStep[]; guide: State['guide']}) {
  return <article className="fg-chapter"><header className="fg-chapter-head"><p>Guide complete</p>
    <h1 tabIndex={-1}>Your decisions</h1><div>Reopen a step to update the decision or turn it into a follow-up.</div></header>
    <ol className="fg-review">{steps.map(step => <li key={step.key}><a href={chapterHref(step.key)}>{step.title}</a>
      <p>{guide[step.key]?.answer}</p></li>)}</ol></article>;
}

export function FounderGuide({workspace, guide, brief, selectedKey, refresh, notice}: GuideProps & SaveActions & {brief: State['notaryBrief']; selectedKey?: string}) {
  const steps = getGuide(workspace, guide);
  const unfinished = steps.find(step => !guide[step.key]?.completed);
  const selected = steps.find(step => step.key === selectedKey);
  const chapter = selected || unfinished;
  const czech = hasCzechFormation(workspace);
  const shortcut = czech && selectedKey === 'czech-sro';
  // Give the active chapter its own reloadable address before it can be completed.
  useEffect(() => {
    if (!shortcut && !selected && (unfinished || selectedKey)) location.replace(unfinished ? chapterHref(unfinished.key) : '#guide');
  }, [selected?.key, unfinished?.key, selectedKey, shortcut]);
  const next = steps.find(step => step.key !== chapter?.key && !guide[step.key]?.completed);
  const index = chapter ? steps.indexOf(chapter) : -1;
  const previous = steps[index - 1];
  const pack = <><FoundingBrief key={workspace.id} workspace={workspace} saved={brief} refresh={refresh} notice={notice}/><CzechFormationWalkthrough/></>;
  if (shortcut) {
    return <div className="fg-spread"><ChapterIndex workspace={workspace} guide={guide} steps={steps}/>
      <article className="fg-chapter"><header className="fg-chapter-head"><p>Czech s.r.o.</p>
        <h1 tabIndex={-1}>Prepare Czech founding documents</h1>
        <div>Prepare a draft for your notary and work through the practical steps of setting up a Czech limited company.</div></header>
        {pack}</article></div>;
  }
  return <div className="fg-spread"><ChapterIndex workspace={workspace} guide={guide} steps={steps} current={chapter?.key}/>
    {chapter ? <Chapter key={chapter.key} step={chapter} index={index} total={steps.length}
      pack={czech && chapter.key === 'forming-registration' && guide['forming-model']?.route === 'company' ? pack : undefined}
      offerPack={czech && chapter.key === 'forming-model'}
      previous={previous && guide[previous.key] ? {step: previous, record: guide[previous.key]} : undefined}
      record={guide[chapter.key]} next={next} refresh={refresh} notice={notice}/> : <GuideReview steps={steps} guide={guide}/>}</div>;
}
