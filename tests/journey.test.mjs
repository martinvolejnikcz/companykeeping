import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp } from './server.mjs';

const password = 'a private test passphrase';
const details = {
  name: 'Greenhouse Glass',
  country: 'Czechia',
  description: 'We restore leaded glass in historic houses.',
  stage: 'operating',
  demo: false,
};

async function founder(app, email, workspace = details) {
  const client = app.client();
  await client.ok('POST', '/api/signup', { email, password });
  assert.equal((await client.state()).workspace, null);
  await client.ok('POST', '/api/workspace', workspace);
  return client;
}

async function accept(client, items = []) {
  await client.ok('POST', '/api/checklist', { items });
  assert.equal((await client.state()).workspace.setupComplete, true);
}

async function byTitle(client, title) {
  const matches = (await client.state()).items.filter(item => item.title === title);
  assert.equal(matches.length, 1, `Expected one record named "${title}"`);
  return matches[0];
}

function denied(response, expected = [401, 403, 404]) {
  assert.ok(expected.includes(response.status), `Unexpected HTTP status ${response.status}`);
}

test('a founder can choose, edit, skip and add setup work before naming the company', async t => {
  const app = await startApp(t);
  const owner = await founder(app, 'founder@example.test', { ...details, name: '', stage: 'forming' });
  const draft = await owner.state();
  assert.equal(draft.workspace.stage, 'forming');
  assert.equal(draft.workspace.description, details.description);
  assert.equal(draft.workspace.country, details.country);
  assert.ok(draft.suggestions.length >= 2);
  assert.equal(draft.workspace.setupComplete, false);
  assert.equal(draft.items.length, 0);
  assert.doesNotMatch(JSON.stringify(draft), /Stillpoint|For General Use/i);

  const chosen = { ...draft.suggestions[0], title: 'Choose a studio name' };
  const added = { title: 'Meet a local glass supplier', nextAction: 'Arrange a visit', status: 'ready' };
  const invalid = await owner.request('POST', '/api/checklist', {
    items: [chosen, { title: 'Wait on an estimate', status: 'waiting', waitingFor: '' }],
  });
  assert.ok([400, 422].includes(invalid.status));
  const stillDraft = await owner.state();
  assert.equal(stillDraft.workspace.setupComplete, false);
  assert.equal(stillDraft.items.length, 0);
  await accept(owner, [chosen, added]);
  const after = await owner.state();
  assert.deepEqual(after.items.map(row => row.title).sort(), [chosen.title, added.title].sort());
  const item = await byTitle(owner, added.title);
  assert.equal(item.status, 'ready');
  assert.ok(!item.dueDate);

  const updates = {
    why: 'Confirm the first batch of replacement glass.',
    nextAction: 'Check the supplier response',
    status: 'waiting',
    waitingFor: 'A delivery estimate from the supplier',
    followUpDate: '2027-02-04',
    dueDate: '2027-02-08',
    sourceUrl: 'https://example.test/estimate-request',
    evidenceUrl: 'https://example.test/supplier-acknowledgement',
  };
  const endpoint = `/api/items/${item.id}`;
  await owner.ok('PATCH', endpoint, updates);
  const reloaded = (await owner.ok('GET', endpoint)).item;
  for (const [key, value] of Object.entries(updates)) assert.equal(reloaded[key], value);
  assert.deepEqual((await byTitle(owner, added.title)), reloaded);
  await owner.ok('PATCH', '/api/workspace', { name: 'Glass Studio' });
  await app.restart();
  assert.deepEqual((await owner.ok('GET', endpoint)).item, reloaded);
  const renamed = (await owner.state()).workspace;
  assert.equal(renamed.id, draft.workspace.id);
  assert.equal(renamed.name, 'Glass Studio');
});

test('independent founders see and change only their own records', async t => {
  const app = await startApp(t);
  const alice = await founder(app, 'alice@example.test');
  const bob = await founder(app, 'bob@example.test', { ...details, name: 'Copper Table', stage: 'forming' });
  const aliceDraft = await alice.state();
  const bobDraft = await bob.state();
  assert.notEqual(aliceDraft.workspace.id, bobDraft.workspace.id);
  assert.notDeepEqual(aliceDraft.suggestions.map(x => x.title), bobDraft.suggestions.map(x => x.title));
  assert.ok(aliceDraft.suggestions.some(x => x.recurrence === 'monthly'));
  const aliceTitle = 'Send Greenhouse Glass records';
  const bobTitle = 'Request Copper Table supplier quote';
  await accept(alice, [{ title: aliceTitle, evidenceUrl: 'https://example.test/alice-private' }]);
  await accept(bob, [{ title: bobTitle }]);
  const aliceItem = await byTitle(alice, aliceTitle);
  const bobItem = await byTitle(bob, bobTitle);
  for (const [client, own, other] of [[alice, aliceItem, bobItem], [bob, bobItem, aliceItem]]) {
    const list = (await client.state()).items;
    assert.deepEqual(list.map(x => x.id), [own.id]);
    const endpoint = `/api/items/${other.id}`;
    for (const [method, url, body] of [
      ['GET', endpoint], ['PATCH', endpoint, { title: 'Changed' }], ['POST', endpoint + '/complete', {}],
    ]) {
      const result = await client.request(method, url, body);
      denied(result, [403, 404]);
      assert.ok(!JSON.stringify(result.body).includes(other.title));
    }
  }
  assert.deepEqual(await byTitle(alice, aliceTitle), aliceItem);
  assert.deepEqual(await byTitle(bob, bobTitle), bobItem);
  const guest = app.client();
  assert.equal((await guest.state()).user, null);
  denied(await guest.request('GET', `/api/items/${aliceItem.id}`));
  denied(await guest.request('POST', '/api/items', { title: 'Without a session' }));
  const rotation = await alice.request('POST', '/api/login', { email: 'alice@example.test', password });
  assert.equal(rotation.ok, true);
  const oldCookie = rotation.setCookie.split(';')[0];
  const logout = await alice.request('POST', '/api/logout', {});
  assert.ok(logout.ok);
  assert.equal((await alice.state()).user, null);
  const replay = await guest.request('GET', '/api/state', undefined, { Cookie: oldCookie });
  assert.equal(replay.body.user, null);
  denied(await alice.request('GET', `/api/items/${aliceItem.id}`));
  denied(await alice.request('POST', '/api/login', { email: 'alice@example.test', password: 'wrong password' }));
  const login = await alice.request('POST', '/api/login', { email: 'alice@example.test', password });
  assert.ok(login.ok);
  assert.match(login.setCookie, /HttpOnly/i);
  assert.match(login.setCookie, /SameSite=(?:Lax|Strict)/i);
  assert.deepEqual(await byTitle(alice, aliceTitle), aliceItem);
});

test('each completed monthly record keeps its own dated evidence and creates one next occurrence', async t => {
  const app = await startApp(t);
  const owner = await founder(app, 'bookkeeper@example.test');
  await accept(owner);
  const title = 'Send monthly records to the bookkeeper';
  const sourceUrl = 'https://example.test/bookkeeper-instructions';
  await owner.ok('POST', '/api/items', {
    title, why: 'Give the bookkeeper the full set of records.',
    nextAction: 'Send the monthly folder', recurrence: 'monthly', dueDate: '2027-01-31', sourceUrl,
  });
  const january = await byTitle(owner, title);
  const endpoint = `/api/items/${january.id}`;
  const evidenceUrl = 'https://example.test/january-confirmation';
  const [first, second] = await Promise.all([
    owner.request('POST', endpoint + '/complete', { evidenceUrl }),
    owner.request('POST', endpoint + '/complete', { evidenceUrl }),
  ]);
  assert.ok(first.ok || second.ok, 'one of the two concurrent completions must succeed');
  for (const result of [first, second]) assert.ok(result.ok || result.status === 409);

  const pair = (await owner.state()).items;
  assert.equal(pair.length, 2);
  const archived = pair.find(item => item.id === january.id);
  assert.equal(archived.status, 'done');
  assert.equal(archived.period, '2027-01');
  assert.equal(archived.evidenceUrl, evidenceUrl);
  assert.ok(archived.completedAt);
  const february = pair.find(item => item.id !== january.id);
  assert.equal(february.status, 'ready');
  assert.equal(february.period, '2027-02');
  assert.equal(february.dueDate, '2027-02-28');
  assert.ok(!february.evidenceUrl);
  assert.equal(february.sourceUrl, sourceUrl);
  assert.ok(archived.seriesId);
  assert.equal(february.seriesId, archived.seriesId);
  denied(await owner.request('PATCH', endpoint, { evidenceUrl: 'https://example.test/replacement' }), [400, 403, 409, 422]);
  await owner.ok('POST', `/api/items/${february.id}/complete`, { evidenceUrl: 'https://example.test/february-confirmation' });
  await app.restart();
  const series = (await owner.state()).items.filter(row => row.seriesId === archived.seriesId);
  assert.equal(series.length, 3);
  assert.deepEqual(series.find(row => row.id === archived.id), archived);
  assert.equal(series.find(row => row.id === february.id).evidenceUrl, 'https://example.test/february-confirmation');
  const march = series.find(row => row.status === 'ready');
  assert.equal(march.period, '2027-03');
  assert.equal(march.dueDate, '2027-03-31');
  assert.ok(!march.evidenceUrl);
});

test('demo suggestions require an explicit choice', async t => {
  const app = await startApp(t);
  const plain = await founder(app, 'business@example.test', { ...details, name: 'For General Use' });
  const plainState = await plain.state();
  assert.equal(plainState.workspace.name, 'For General Use');
  assert.equal(plainState.workspace.demo, false);
  assert.doesNotMatch(JSON.stringify(plainState.suggestions), /Stillpoint|For General Use/i);
  const demo = await founder(app, 'demo@example.test', {
    ...details, name: 'For General Use', description: 'A studio making products including Stillpoint.', demo: true,
  });
  const demoState = await demo.state();
  assert.equal(demoState.workspace.demo, true);
  const suggestions = demoState.suggestions;
  assert.match(JSON.stringify(suggestions), /Stillpoint/i);
  assert.ok(suggestions.some(x => x.status === 'waiting' && x.waitingFor));
  await accept(demo, suggestions);
  await demo.ok('PATCH', '/api/workspace', { name: 'My sample studio' });
  assert.equal((await demo.state()).workspace.demo, true);
  assert.equal((await plain.state()).items.length, 0);
  await demo.ok('POST', '/api/items', { title: 'Private studio decision' });
  const visitor = app.client();
  const example = await visitor.ok('GET', '/api/example');
  assert.equal(example.workspace.name, 'For General Use');
  assert.doesNotMatch(JSON.stringify(example), /Private studio decision/);
  assert.equal((await visitor.state()).user, null);
});

test('guide decisions persist by workspace and partial saves preserve a step’s other fields', async t => {
  const app = await startApp(t);
  const guest = app.client();
  const path = '/api/guide/forming-model';
  assert.deepEqual((await guest.state()).guide, {});
  denied(await guest.request('PATCH', path, { answer: 'A guest answer' }), [401]);
  await guest.ok('POST', '/api/signup', { email: 'before-setup@example.test', password });
  assert.deepEqual((await guest.state()).guide, {});
  denied(await guest.request('PATCH', path, { answer: 'No company yet' }), [404]);

  const profile = { ...details, country: 'Czech Republic', stage: 'forming' };
  const alice = await founder(app, 'guide-owner@example.test', profile);
  const bob = await founder(app, 'guide-reader@example.test', profile);
  await accept(alice, [{ title: 'Ask an adviser' }]);
  const before = await alice.state();
  assert.deepEqual(before.guide, {});
  assert.equal((await alice.request('PATCH', path, { completed: true })).status, 400);
  assert.equal((await alice.request('PATCH', path, { answer: ' \n\t ', completed: true })).status, 400);
  assert.equal((await alice.request('PATCH', '/api/guide/unknown', { answer: 'Unlisted' })).status, 404);
  assert.deepEqual((await alice.state()).guide, {});

  const draft = { answer: 'Sell commissioned glasswork to architectural studios.', completed: false, route: 'company' };
  assert.deepEqual(await alice.ok('PATCH', path, { answer: draft.answer, route: draft.route }), draft);
  const other = { answer: 'Work on my own for the first year.', completed: false, route: 'individual' };
  assert.deepEqual(await bob.ok('PATCH', path, other), other);
  assert.equal((await bob.request('PATCH', path, { workspaceId: before.workspace.id, answer: 'New' })).status, 400);

  const completed = { ...draft, completed: true };
  assert.deepEqual(await alice.ok('PATCH', path, { completed: true }), completed);
  for (const bad of [
    { answer: '', route: 'individual' }, { answer: 'x'.repeat(3001) },
    { answer: 27 }, { completed: 'yes' }, { route: 'cooperative' },
  ]) {
    assert.equal((await alice.request('PATCH', path, bad)).status, 400);
  }
  assert.equal((await alice.request('PATCH', '/api/guide/forming-registration', { route: 'company' })).status, 400);
  await app.restart();
  assert.deepEqual((await alice.state()).guide, { 'forming-model': completed });
  assert.deepEqual((await bob.state()).guide, { 'forming-model': other });

  const revised = { answer: 'B'.repeat(3000), completed: false };
  assert.deepEqual(await alice.ok('PATCH', path, { ...revised, route: null }), revised);
  await Promise.all([
    alice.ok('PATCH', path, { answer: 'Make sample panels for the first customer.' }),
    alice.ok('PATCH', path, { route: 'undecided' }),
  ]);
  const final = await alice.state();
  assert.deepEqual(final.guide['forming-model'], {
    answer: 'Make sample panels for the first customer.', completed: false, route: 'undecided',
  });
  assert.deepEqual(final.items, before.items);
  assert.deepEqual((await bob.state()).guide, { 'forming-model': other });

  const registration = { answer: 'Check the steps confirmed by the local office.', completed: true };
  await alice.ok('PATCH', '/api/guide/forming-registration', registration);
  await bob.ok('PATCH', '/api/guide/forming-registration', registration);
  await alice.ok('PATCH', path, { route: 'individual', completed: true });
  const afterRoute = (await alice.state()).guide;
  assert.equal(afterRoute['forming-model'].completed, true);
  assert.deepEqual(afterRoute['forming-registration'], { ...registration, completed: false });
  await alice.ok('PATCH', '/api/guide/forming-registration', { completed: true });
  await alice.ok('PATCH', path, { route: 'individual' });
  await alice.ok('PATCH', '/api/workspace', { country: '  CZECHIA  ' });
  assert.equal((await alice.state()).guide['forming-registration'].completed, true);
  await alice.ok('PATCH', '/api/workspace', { country: 'Ireland' });
  const afterCountry = (await alice.state()).guide;
  assert.deepEqual(afterCountry['forming-model'], { ...afterRoute['forming-model'], completed: false });
  assert.deepEqual(afterCountry['forming-registration'], { ...registration, completed: false });
  assert.deepEqual((await bob.state()).guide['forming-registration'], registration);
});

test('an existing company keeps its login and records when Flyway adds its founder guide', async t => {
  const app = await startApp(t, { initialMigrationTarget: '1' });
  const owner = app.client();
  await owner.ok('POST', '/api/signup', { email: 'first-release@example.test', password });
  await owner.ok('POST', '/api/workspace', details);
  await owner.ok('POST', '/api/checklist', { items: [] });
  const saved = await owner.ok('POST', '/api/items', {
    title: 'A pre-existing receipt', evidenceUrl: 'https://example.test/original-receipt',
  });
  await app.restart();
  const state = await owner.state();
  assert.equal(state.user.email, 'first-release@example.test');
  assert.deepEqual(state.items, [saved.item]);
  assert.deepEqual(state.guide, {});
  const step = { answer: 'Review customer payments on Friday.', completed: false };
  await owner.ok('PATCH', '/api/guide/operating-money', step);
  assert.deepEqual((await owner.state()).guide, { 'operating-money': step });
});

test('a private notary brief survives migration, reload and changes of business route', async t => {
  const app = await startApp(t, { initialMigrationTarget: '2' });
  const owner = await founder(app, 'notary-owner@example.test', { ...details, stage: 'forming' });
  const decision = { answer: 'I plan to own the company with a partner.', completed: true, route: 'company' };
  // Seed exactly the saved V2 row shape before Flyway changes the schema.
  await app.restart({ beforeMigrationSql: `
    INSERT INTO guide_steps (workspace_id, step_key, answer, completed, route)
      SELECT id, 'forming-model', 'I plan to own the company with a partner.', true, 'company' FROM workspaces;
  ` });
  const migrated = await owner.state();
  assert.equal(migrated.notaryBrief, null);
  assert.deepEqual(migrated.guide['forming-model'], decision);

  const empty = {
    companyName: '', registeredOffice: '', activity: '', founders: [], directors: [], signing: '',
    registeredCapitalCzk: '', otherFunding: '', notes: '', questions: '',
  };
  const path = '/api/notary-brief';
  const guest = app.client();
  assert.equal((await guest.state()).notaryBrief, null);
  denied(await guest.request('PUT', path, empty), [401]);
  const bob = await founder(app, 'other-notary@example.test');
  const blank = await bob.ok('PUT', path, empty);
  assert.deepEqual(blank, { ...empty, contributionAdministrator: '', paymentSchedule: '' });

  const full = {
    companyName: 'Maproom Studio', registeredOffice: 'Brno, proposed office', activity: 'Publishing mapping software.',
    founders: [{ name: 'Alex', contributionCzk: '14000.50' }, { name: 'Robin', contributionCzk: '6000' }],
    directors: ['Robin', 'Alex'], signing: 'Ask whether each director may sign independently.',
    registeredCapitalCzk: '20000.50', contributionAdministrator: 'Robin',
    paymentSchedule: 'Ask the notary to confirm when the founders should pay.',
    otherFunding: 'A separate founder loan for equipment.', notes: 'Compare office options.',
    questions: 'Which office consent documents should we collect?',
  };
  const saved = await owner.ok('PUT', path, { ...full, registeredCapitalCzk: '20000,50' });
  assert.deepEqual(saved, full);
  assert.deepEqual((await owner.state()).notaryBrief, full);
  assert.deepEqual((await bob.state()).notaryBrief, blank);
  for (const invalid of [
    { registeredCapitalCzk: '12.345' }, { registeredCapitalCzk: '-1' }, { registeredCapitalCzk: 100 },
    { registeredCapitalCzk: '1000000000000000' }, { founders: [{ name: 'Alice', contributionCzk: 'unknown' }] },
    { founders: [{ name: 'Missing amount field' }] }, { directors: [false] },
    { founders: Array(51).fill({ name: '', contributionCzk: '' }) }, { notes: 'x'.repeat(3001) },
  ]) {
    assert.equal((await owner.request('PUT', path, { ...full, ...invalid })).status, 400);
  }
  assert.equal((await owner.request('PUT', path, { companyName: 'Partial document' })).status, 400);
  assert.equal((await bob.request('PUT', path, { ...empty, workspaceId: migrated.workspace.id })).status, 400);
  assert.deepEqual((await owner.state()).notaryBrief, full);

  await owner.ok('PATCH', '/api/guide/forming-model', { route: 'individual' });
  await owner.ok('PATCH', '/api/workspace', { stage: 'operating', country: 'Ireland' });
  await app.restart();
  const later = await owner.state();
  assert.deepEqual(later.notaryBrief, full);
  assert.deepEqual(later.items, migrated.items);
  assert.deepEqual((await bob.state()).notaryBrief, blank);
  const revised = { ...full, founders: [full.founders[0]], directors: [], registeredCapitalCzk: '', questions: '' };
  await owner.ok('PUT', path, revised);
  assert.deepEqual((await owner.state()).notaryBrief, revised);
});

test('a founder’s software business model stays on their own first-sale step', async t => {
  const app = await startApp(t, { initialMigrationTarget: '3' });
  const profile = { ...details, stage: 'forming', description: 'We build software for studios.' };
  const owner = await founder(app, 'product-owner@example.test', profile);
  const other = await founder(app, 'client-owner@example.test', profile);
  await app.restart({ beforeMigrationSql: `
    INSERT INTO guide_steps (workspace_id, step_key, answer, completed)
      SELECT w.id, 'forming-first-sale', 'Start with a paid pilot.', true
      FROM workspaces w JOIN accounts a ON a.id=w.owner_id WHERE a.email='product-owner@example.test';
  ` });
  assert.deepEqual((await owner.state()).guide['forming-first-sale'], { answer: 'Start with a paid pilot.', completed: true });
  assert.deepEqual((await other.state()).guide, {});
  const sale = '/api/guide/forming-first-sale';
  const structure = '/api/guide/forming-model';
  const legalChoice = { answer: 'Set up a company with another founder.', completed: true, route: 'company' };
  await owner.ok('PATCH', structure, legalChoice);
  const answer = 'Sell a hosted scheduling app to studios.';
  const done = { answer, completed: true, softwareModel: 'product' };
  assert.deepEqual(await owner.ok('PATCH', sale, { softwareModel: 'product' }), {
    answer: 'Start with a paid pilot.', completed: true, softwareModel: 'product',
  });
  assert.deepEqual(await owner.ok('PATCH', sale, { answer, completed: true }), done);
  const separate = { answer: 'Develop a custom booking tool.', completed: false, softwareModel: 'client' };
  await other.ok('PATCH', sale, separate);

  for (const value of ['unknown', false, {}]) {
    assert.equal((await owner.request('PATCH', sale, { softwareModel: value, completed: false })).status, 400);
  }
  assert.equal((await owner.request('PATCH', structure, { softwareModel: 'product' })).status, 400);
  assert.equal((await owner.request('PATCH', sale, { route: 'company' })).status, 400);
  await app.restart();
  const reloaded = (await owner.state()).guide;
  assert.deepEqual(reloaded['forming-model'], legalChoice);
  assert.deepEqual(reloaded['forming-first-sale'], done);
  assert.deepEqual((await other.state()).guide['forming-first-sale'], separate);

  assert.deepEqual(await owner.ok('PATCH', sale, { softwareModel: 'exploring' }), { ...done, softwareModel: 'exploring' });
  assert.deepEqual(await owner.ok('PATCH', sale, { softwareModel: 'client', completed: false }), {
    answer, completed: false, softwareModel: 'client',
  });
  assert.deepEqual(await owner.ok('PATCH', sale, { softwareModel: null }), { answer, completed: false });
  assert.deepEqual((await owner.state()).guide['forming-model'], legalChoice);
  assert.deepEqual((await other.state()).guide['forming-first-sale'], separate);
});
