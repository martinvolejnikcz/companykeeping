import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startApp } from '../server.mjs';

async function createFounder(page, origin, stage, withChecklist = true) {
  const headers = {Origin: origin};
  // Recreate a workspace whose owner finished onboarding before the guide existed.
  const entries = [
    ['/api/signup', {email: stage + '@guide.example', password: 'Local guide browser fixture.'}],
    ['/api/workspace', {name: 'Maproom Software', country: 'Czechia', description: 'We build route planning software for cyclists.', stage}],
  ];
  if (withChecklist) entries.push(['/api/checklist', {items: [{title:'Review the first customer proposal'}]}]);
  for (const [path, data] of entries) {
    const result = await page.request.post(origin + path, {data, headers});
    assert.ok(result.ok(), path + ' returned ' + result.status());
  }
  await page.goto(origin);
  await page.getByRole('heading', {name:withChecklist ? 'This week' : 'Your starting checklist', exact:true}).waitFor();
}

test('an existing Czech software founder saves guide decisions, revisits the business route and files a follow-up', {timeout:120_000}, async t => {
  const app = await startApp(t);
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  t.after(() => browser.close());
  const page = await browser.newPage({viewport:{width:1200, height:850}});
  page.setDefaultTimeout(10_000);
  await createFounder(page, app.origin, 'forming');

  await page.getByRole('link', {name:'Edit company details', exact:true}).click();
  assert.equal(await page.getByRole('combobox', {name:'Country or region'}).inputValue(), 'Czechia');
  const weekTab = page.getByRole('navigation', {name:'Workspace', exact:true}).getByRole('link', {name:'This week'});
  await weekTab.click();
  const recommendation = page.getByRole('region', {name:'Formation guide'});
  await recommendation.getByText('0 of 3 steps complete').waitFor();
  await recommendation.getByRole('link', {name:'Start step'}).click();

  const chapter = page.getByRole('article');
  const initialTitle = 'Who will sign your first contract?';
  await chapter.getByRole('heading', {name:initialTitle, level:1}).waitFor();
  const companyRoute = page.getByRole('radio', {name:'A limited company (s.r.o.)', exact:true});
  await companyRoute.check();
  const answer = 'We plan to sell a subscription to our mapping software through a Czech company.';
  await chapter.getByRole('textbox').fill(answer);
  await chapter.getByRole('button', {name:'Save draft'}).click();
  await chapter.getByRole('link', {name:'Create a follow-up'}).waitFor();
  await page.reload();
  assert.equal(await chapter.getByRole('textbox').inputValue(), answer);
  assert.ok(await companyRoute.isChecked());
  await chapter.getByRole('button', {name:'Finish step'}).click();
  await chapter.getByText(answer, {exact:true}).waitFor();
  await chapter.getByRole('link', {name:'Continue to next step'}).click();

  const registrationTitle = 'Prepare for the notary';
  await chapter.getByRole('heading', {name:registrationTitle, level:1}).waitFor();
  const foundingSource = 'https://portal.gov.cz/en/informace/requirements-for-legal-acts-associated-with-incorporation-INF-219';
  const registerSource = 'https://portal.gov.cz/en/informace/the-process-of-incorporation-and-setting-up-a-business-corporation-INF-221';
  assert.equal(await chapter.getByRole('link', {name:/founding documents/}).getAttribute('href'), foundingSource);
  assert.equal(await chapter.getByRole('link', {name:/company comes into existence/}).getAttribute('href'), registerSource);
  await chapter.getByRole('textbox').fill('Ask a notary to confirm the registration steps for our business.');
  await chapter.getByRole('button', {name:'Save draft'}).click();
  await chapter.getByRole('link', {name:'Create a follow-up'}).click();

  await page.getByRole('heading', {name:'Add an item'}).waitFor();
  const itemTitle = 'Arrange the founding meeting';
  assert.equal(await page.getByLabel('Item title', {exact:true}).inputValue(), itemTitle);
  assert.match(await page.getByLabel('Next action', {exact:true}).inputValue(), /notary/i);
  assert.equal(await page.getByLabel('Date source link', {exact:true}).inputValue(), foundingSource);
  await page.getByRole('button', {name:'Add item', exact:true}).click();
  await chapter.getByRole('heading', {name:registrationTitle, exact:true}).waitFor();
  await weekTab.click();
  await recommendation.getByText('1 of 3 steps complete').waitFor();
  await page.getByText(itemTitle, {exact:true}).waitFor();
  await page.reload();
  await recommendation.getByRole('link', {name:'Continue step'}).click();
  await chapter.getByRole('heading', {name:registrationTitle, exact:true}).waitFor();
  await page.getByRole('navigation', {name:'Guide steps'}).getByRole('link', {name:/Who will sign your first contract/}).click();
  await chapter.getByRole('button', {name:'Edit decision'}).click();
  await page.getByRole('radio', {name:'Self-employment (OSVČ)', exact:true}).check();
  await chapter.getByRole('textbox').fill('I now plan to sell the software as a sole trader.');
  await chapter.getByRole('button', {name:'Save changes'}).click();
  await chapter.getByRole('link', {name:'Continue to next step'}).click();
  await page.setViewportSize({width:360, height:800});
  await chapter.getByRole('heading', {name:'Check your activity with the trade office'}).waitFor();
  assert.equal(await chapter.getByRole('link', {name:/Getting a trade licence/}).getAttribute('href'),
    'https://portal.gov.cz/en/sluzby-vs/vznik-zivnostenskeho-opravneni-S757');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', {name:'View steps'}).click();
  await page.getByRole('navigation', {name:'Guide steps'}).getByRole('link', {name:/Walk through your first sale/}).click();
  await chapter.getByText(/working booking flow/).waitFor();

  const operating = await browser.newPage();
  await createFounder(operating, app.origin, 'operating', false);
  await operating.getByRole('button', {name:'Skip the checklist and open my guide'}).click();
  await operating.getByRole('article').getByRole('heading', {name:'Trace one payment from sale to bank'}).waitFor();
  await operating.getByRole('navigation', {name:'Workspace',exact:true}).getByRole('link', {name:'This week'}).click();
  const operations = operating.getByRole('region', {name:'Operations guide'});
  await operations.getByText('0 of 3 steps complete').waitFor();
  await operations.getByRole('heading', {name:'Trace one payment from sale to bank'}).waitFor();
  await operations.getByRole('link', {name:'Start step'}).click();
  await operating.getByRole('article').getByRole('textbox').waitFor();
  assert.match(new URL(operating.url()).hash, /operating-money$/);
  assert.equal(await operating.getByRole('group', {name:'Which route are you exploring?'}).count(), 0);
});
