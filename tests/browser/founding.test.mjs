import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import test from 'node:test';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { startApp } from '../server.mjs';

async function createCompany(page, origin, email, country) {
  const posts = [
    ['/api/signup', {email, password: 'A temporary browser test passphrase.'}],
    ['/api/workspace', {
      name:'Mapa Studio', country, stage:'forming',
      description:'We build mapping software for walking holidays.',
    }],
    ['/api/checklist', {items:[]}],
  ];
  for (const [path, data] of posts) {
    const result = await page.request.post(origin + path, {headers:{Origin:origin}, data});
    assert.ok(result.ok(), path + ' returned ' + result.status());
  }
  await page.goto(origin);
  await page.getByRole('heading', {name:'This week', exact:true}).waitFor();
}

async function previewAndDownloadDraft(page, brief) {
  await brief.getByRole('button', {name:'Preview Czech draft'}).click();
  const preview = await brief.getByRole('region', {name:'Czech working draft'}).locator('[lang="cs"]').textContent();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    brief.getByRole('button', {name:'Download draft'}).click(),
  ]);
  assert.match(download.suggestedFilename(), /\.txt$/i);
  const exported = await text(await download.createReadStream());
  assert.equal(exported, preview);
  return exported;
}

async function downloadWord(page, button, expectedName) {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  assert.equal(download.suggestedFilename(), expectedName);
  const directory = await mkdtemp(join(tmpdir(), 'companykeeping-word-'));
  try {
    const jar = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'jar') : 'jar';
    await promisify(execFile)(jar, ['xf', await download.path(), '[Content_Types].xml', 'word/document.xml'], {cwd:directory});
    const types = await readFile(join(directory, '[Content_Types].xml'), 'utf8');
    assert.match(types, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml/);
    const xml = await readFile(join(directory, 'word/document.xml'), 'utf8');
    return await page.evaluate(source => {
      const document = new DOMParser().parseFromString(source, 'application/xml');
      if (document.documentElement.localName !== 'document') throw new Error('Invalid Word document XML.');
      const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      return [...document.getElementsByTagNameNS(word, 'p')].map(p => p.textContent).join('\n');
    }, xml);
  } finally {
    await rm(directory, {recursive:true, force:true});
  }
}

test('a Czech founder opens the s.r.o. walkthrough and prepares a private notary brief', {timeout:120_000}, async t => {
  const app = await startApp(t);
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  t.after(() => browser.close());
  const page = await browser.newPage({viewport:{width:1250, height:820}});
  page.setDefaultTimeout(10_000);
  await createCompany(page, app.origin, 'primary@founding.example', 'Czechia');
  const walkthrough = page.getByRole('link', {name:'Prepare Czech founding documents', exact:true});
  assert.equal(await walkthrough.getAttribute('href'), '#guide/czech-sro');
  await walkthrough.click();
  await page.waitForURL('**/#guide/czech-sro');

  const incorporation = page.getByRole('region', {name:'Czech incorporation process'});
  for (const [label, destination] of [
    ['See the Ministry of Justice model in Czech and English', 'https://or.justice.cz/ias/ui/vzorsmlouvy'],
    ['Start the online notary request', 'https://www.nkcr.cz/sro-online'],
    ['Gov.cz · Commercial Register entry', 'https://portal.gov.cz/sluzby-vs/zapis-do-obchodniho-rejstriku-S15721'],
    ['Find the company and its extract', 'https://or.justice.cz/ias/ui/rejstrik'],
  ]) {
    assert.equal(await incorporation.getByRole('link', {name:label}).getAttribute('href'), destination);
  }

  const money = page.getByRole('region', {name:'Where the money goes'});
  const contribution = money.getByLabel('Total monetary contributions (CZK)', {exact:true});
  assert.equal(await contribution.inputValue(), '50000');
  await money.getByText('Use a special capital account before registration.').waitFor();
  assert.match(await money.innerText(), /legal minimum before filing is CZK 15,000/);
  await contribution.fill('20000');
  await money.getByText('The contribution administrator may receive the money directly.').waitFor();
  assert.match(await money.innerText(), /legal minimum before filing is CZK 6,000/);
  await contribution.fill('20001');
  await money.getByText('Use a special capital account before registration.').waitFor();
  assert.match(await money.innerText(), /legal minimum before filing is CZK 6,000\.3/);
  await contribution.fill('50000');

  await page.goto(app.origin + '/#guide/forming-registration');
  await page.getByText('Register a Czech s.r.o. and choose a bank', {exact:true}).click();
  const banks = page.getByRole('region', {name:'Bank accounts for a Czech s.r.o.'});
  await banks.getByText('Fio banka', {exact:true}).waitFor();
  await banks.getByText('Komerční banka', {exact:true}).waitFor();
  await banks.getByText('Revolut Business', {exact:true}).waitFor();
  assert.equal(await banks.getByRole('link', {name:'Revolut pricing'}).getAttribute('href'),
    'https://www.revolut.com/cs-CZ/business/business-account-plans/');
  const brief = page.getByRole('region', {name:'Founding brief', exact:true});
  await brief.getByText('Yes, you need a notary to form a Czech s.r.o.', {exact:true}).waitFor();
  assert.equal(await brief.getByRole('link', {name:'Official Czech model (.docx)'}).getAttribute('href'),
    'https://or.justice.cz/ias/ui/download/vzor_spolecenske_smlouvy.docx');
  const forms = brief.getByRole('group', {name:'Choose a Czech founding document'});
  const blankButton = brief.getByRole('button', {name:'Download blank Word template'});
  await forms.getByRole('radio', {name:/Zakladatelská listina/}).check();
  const blankSole = await downloadWord(page, blankButton, 'zakladatelska-listina-vzor.docx');
  assert.match(blankSole, /zakladatelsk[áé] listin/iu);
  assert.doesNotMatch(blankSole, /Mapa Studio/);
  await forms.getByRole('radio', {name:/Společenská smlouva/}).check();
  const blankMultiple = await downloadWord(page, blankButton, 'spolecenska-smlouva-vzor.docx');
  assert.match(blankMultiple, /společensk[áé] smlouv/iu);
  assert.doesNotMatch(blankMultiple, /Mapa Studio/);
  await brief.getByRole('button', {name:'Prepare a founding brief'}).click();
  await brief.getByLabel('Founder 2 name').waitFor();
  await page.reload();
  await forms.getByRole('radio', {name:/Zakladatelská listina/}).check();
  await brief.getByRole('button', {name:'Prepare a founding brief'}).click();
  assert.equal(await brief.getByLabel('Proposed company name').inputValue(), 'Mapa Studio');
  assert.equal(await brief.getByLabel('Business activity').inputValue(), 'We build mapping software for walking holidays.');
  await brief.getByLabel('Proposed company name').fill('Mapový ateliér s.r.o.');
  await brief.getByLabel('Registered office').fill('Olomouc');
  await brief.getByLabel('Business activity').fill('Vývoj mapového softwaru');
  await brief.getByLabel('Founder 1 name').fill('Ada Nováková');
  await brief.getByLabel('Founder 1 contribution (CZK)').fill('50000');
  await brief.getByLabel('Director 1 name').fill('Ada Nováková');
  await brief.getByLabel('How directors will sign').fill('Každý jednatel jedná samostatně.');
  await brief.getByLabel('Total registered capital (CZK)').fill('50000');
  await brief.getByLabel('Contribution administrator').fill('Ada Nováková');
  await brief.getByLabel('Contribution payment schedule').fill('Před zápisem splatím celý vklad.');
  await brief.getByLabel('Questions for the notary').fill('Jak doložím souhlas s umístěním sídla?');
  await brief.getByRole('button', {name:'Save founding brief'}).click();
  await brief.getByRole('button', {name:'Edit founding brief'}).waitFor();
  await page.reload();
  await brief.getByRole('button', {name:'Edit founding brief'}).waitFor();
  const sole = await previewAndDownloadDraft(page, brief);
  assert.match(sole, /zakladatelsk[áé] listin/iu);
  for (const term of ['Mapový ateliér s.r.o.', 'Olomouc', 'Vývoj mapového softwaru', 'Ada Nováková', 'Jak doložím souhlas s umístěním sídla?']) {
    assert.ok(sole.includes(term), 'The single-founder export should include ' + term);
  }

  await brief.getByRole('button', {name:'Edit founding brief'}).click();
  await brief.getByRole('button', {name:'Add founder'}).click();
  await brief.getByLabel('Founder 1 contribution (CZK)').fill('30000');
  await brief.getByLabel('Founder 2 name').fill('Jan Veselý');
  await brief.getByLabel('Founder 2 contribution (CZK)').fill('20000');
  await brief.getByRole('button', {name:'Save founding brief'}).click();
  await brief.getByRole('button', {name:'Edit founding brief'}).waitFor();
  await page.reload();
  await brief.getByRole('button', {name:'Edit founding brief'}).waitFor();
  const multiple = await previewAndDownloadDraft(page, brief);
  const personalised = await downloadWord(page, brief.getByRole('button', {name:'Download Word draft'}), 'spolecenska-smlouva-navrh.docx');
  for (const term of ['Mapový ateliér s.r.o.', 'Ada Nováková', 'Jan Veselý', 'Vývoj mapového softwaru', 'Jak doložím souhlas s umístěním sídla?']) {
    assert.ok(personalised.includes(term), 'Personalised Word document should include ' + term);
  }
  assert.match(personalised, /společensk[áé] smlouv/iu);
  assert.match(personalised, /30[,\s]?000/);
  assert.match(personalised, /20[,\s]?000/);
  assert.match(multiple, /společensk[áé] smlouv/iu);
  assert.match(multiple, /Ada Nováková/);
  assert.match(multiple, /Jan Veselý/);
  assert.match(multiple, /30[,\s]?000/);
  assert.match(multiple, /20[,\s]?000/);
  await page.setViewportSize({width:360, height:800});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The founding documents page fits a phone');
  const state = await (await page.request.get(app.origin + '/api/state')).json();
  assert.deepEqual(state.guide, {});

  // An owner who explores the company pack can still continue a self-employment route.
  const chosen = await page.request.patch(app.origin + '/api/guide/forming-model', {
    headers:{Origin:app.origin}, data:{route:'individual', completed:true, answer:'I will trade in my own name.'},
  });
  assert.ok(chosen.ok());
  await page.goto(app.origin);
  await page.getByRole('region', {name:'Formation guide'}).getByRole('heading', {name:'Check your activity with the trade office'}).waitFor();

  await page.getByRole('link', {name:'Edit company details', exact:true}).click();
  await page.getByRole('combobox', {name:'Company stage'}).selectOption('operating');
  await page.getByRole('button', {name:'Save changes'}).click();
  await page.getByRole('region', {name:'Operations guide'}).waitFor();
  assert.equal(await page.getByRole('link', {name:'Prepare Czech founding documents'}).count(), 0);
  await page.getByRole('navigation', {name:'Workspace', exact:true}).getByRole('link', {name:'Company records'}).click();
  const savedDraft = page.getByRole('link', {name:'Saved founding draft', exact:true});
  assert.equal(await savedDraft.getAttribute('href'), '#records/founding-brief');
  await savedDraft.click();
  await page.getByRole('heading', {name:'Saved founding draft', exact:true}).waitFor();
  await page.reload();
  const recordPreview = page.getByRole('region', {name:'Czech working draft'});
  assert.equal(await recordPreview.locator('[lang="cs"]').textContent(), multiple);
  await recordPreview.getByRole('button', {name:'Edit founding brief'}).click();
  assert.equal(await page.getByLabel('Founder 2 name').inputValue(), 'Jan Veselý');

  const other = await browser.newPage();
  await createCompany(other, app.origin, 'other@founding.example', 'Ireland');
  assert.equal(await other.getByRole('link', {name:'Prepare Czech founding documents'}).count(), 0);
  await other.goto(app.origin + '/#guide/czech-sro');
  await other.getByRole('radio', {name:'Trading as an individual'}).waitFor();
  assert.equal(await other.getByRole('region', {name:'Founding brief', exact:true}).count(), 0);
  assert.equal(await other.getByRole('article').getByText(/OSVČ|Mapový ateliér|For General Use/).count(), 0);
  await other.getByRole('navigation', {name:'Workspace', exact:true}).getByRole('link', {name:'Company records'}).click();
  await other.getByRole('heading', {name:'Company records', exact:true}).waitFor();
  assert.equal(await other.getByRole('link', {name:'Saved founding draft', exact:true}).count(), 0);
});
