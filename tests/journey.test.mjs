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
  const plain = await founder(app, 'business@example.test');
  const plainState = await plain.state();
  assert.equal(plainState.workspace.name, details.name);
  assert.doesNotMatch(JSON.stringify(plainState.suggestions), /Stillpoint|For General Use/i);
  const demo = await founder(app, 'demo@example.test', {
    ...details, name: 'For General Use', description: 'A studio making products including Stillpoint.', demo: true,
  });
  const suggestions = (await demo.state()).suggestions;
  assert.match(JSON.stringify(suggestions), /Stillpoint/i);
  assert.ok(suggestions.some(x => x.status === 'waiting' && x.waitingFor));
  await accept(demo, suggestions);
  assert.equal((await plain.state()).items.length, 0);
  await demo.ok('POST', '/api/items', { title: 'Private studio decision' });
  const visitor = app.client();
  const example = await visitor.ok('GET', '/api/example');
  assert.equal(example.workspace.name, 'For General Use');
  assert.doesNotMatch(JSON.stringify(example), /Private studio decision/);
  assert.equal((await visitor.state()).user, null);
});
