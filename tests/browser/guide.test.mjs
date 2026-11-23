import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startApp } from '../server.mjs';

async function createFounder(page, origin, stage, withChecklist = true, profile = {}) {
  const headers = {Origin: origin};
  // Recreate a workspace whose owner finished onboarding before the guide existed.
  const entries = [
    ['/api/signup', {email: profile.email || stage + '@guide.example', password: 'Local guide browser fixture.'}],
    ['/api/workspace', {name: profile.name || 'Maproom Software', country: 'Czechia', description: profile.description || 'We build route planning software for cyclists.', stage}],
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
  await page.getByRole('navigation', {name:'Guide steps'}).locator('a[href="#guide/forming-first-sale"]').click();
  await chapter.getByRole('heading', {name:'Find your first software customer'}).waitFor();

  const models = chapter.getByRole('group', {name:'What are you building?'});
  const product = models.getByRole('radio', {name:'Our own software product'});
  const client = models.getByRole('radio', {name:'Custom software for clients'});
  await models.getByRole('radio', {name:'Still exploring'}).check();
  await chapter.getByRole('heading', {name:'Choose a software problem to investigate'}).waitFor();
  await product.check();
  await chapter.getByRole('heading', {name:'Test your product with one early user'}).waitFor();
  const firstSaleAnswer = chapter.getByRole('textbox');
  await chapter.getByRole('button', {name:'Use a starting draft'}).click();
  assert.ok((await firstSaleAnswer.inputValue()).trim());
  const productAnswer = 'Ask Maya at Hilltop Cycling to try planning her first two group rides with our app.';
  await firstSaleAnswer.fill(productAnswer);
  await chapter.getByRole('button', {name:'Save draft'}).click();
  await chapter.getByRole('link', {name:'Create a follow-up'}).waitFor();
  await page.reload();
  assert.ok(await product.isChecked());
  assert.equal(await firstSaleAnswer.inputValue(), productAnswer);
  await chapter.getByRole('link', {name:'Create a follow-up'}).click();
  assert.equal(await page.getByLabel('Item title', {exact:true}).inputValue(), 'Invite one early user to test the product');
  assert.ok((await page.getByLabel('Next action', {exact:true}).inputValue()).includes(productAnswer));
  await page.goBack();
  await client.check();
  await chapter.getByRole('heading', {name:'Scope a paid software pilot'}).waitFor();
  const pilotAnswer = 'Offer Rowan a paid pilot to build one route export for their touring agency.';
  await firstSaleAnswer.fill(pilotAnswer);
  await chapter.getByRole('button', {name:'Finish step'}).click();
  await chapter.getByText(pilotAnswer, {exact:true}).waitFor();
  await page.reload();
  await chapter.getByText(pilotAnswer, {exact:true}).waitFor();
  await chapter.getByRole('heading', {name:'Scope a paid software pilot'}).waitFor();
  await chapter.getByRole('link', {name:'Create a follow-up'}).click();
  assert.equal(await page.getByLabel('Item title', {exact:true}).inputValue(), 'Send a pilot proposal to one client');
  assert.ok((await page.getByLabel('Next action', {exact:true}).inputValue()).includes(pilotAnswer));
  await page.getByRole('button', {name:'Add item', exact:true}).click();
  await chapter.getByText(pilotAnswer, {exact:true}).waitFor();

  const other = await browser.newPage();
  await createFounder(other, app.origin, 'forming', true, {
    email:'ceramics@guide.example', name:'Oakbend Ceramics', description:'I make wheel-thrown mugs and sell them at craft fairs.',
  });
  await other.goto(app.origin + '/#guide/forming-first-sale');
  await other.getByRole('article').getByRole('heading', {name:'Walk through your first sale'}).waitFor();
  assert.equal(await other.getByRole('group', {name:'What are you building?'}).count(), 0);
  await other.getByRole('article').getByText(/A local shop wants a first batch/).waitFor();
  await other.getByRole('article').getByRole('textbox').waitFor();

  const operating = await browser.newPage();
  await createFounder(operating, app.origin, 'operating', false);
  await operating.getByRole('button', {name:'Skip the checklist and open my guide'}).click();
  await operating.getByRole('article').getByRole('heading', {name:'Trace one payment from sale to bank'}).waitFor();
  await operating.getByRole('navigation', {name:'Workspace',exact:true}).getByRole('link', {name:'This week'}).click();
  const operations = operating.getByRole('region', {name:'Operations guide'});
  await operations.getByText('0 of 3 steps complete').waitFor();
  await operations.getByRole('heading', {name:'Trace one payment from sale to bank'}).waitFor();
  assert.equal(await operations.getByRole('link', {name:'Plan a software launch'}).getAttribute('href'), '#guide/forming-first-sale');
  await operations.getByRole('link', {name:'Start step'}).click();
  await operating.getByRole('article').getByRole('textbox').waitFor();
  assert.match(new URL(operating.url()).hash, /operating-money$/);
  assert.equal(await operating.getByRole('group', {name:'Which route are you exploring?'}).count(), 0);
  await operating.getByRole('complementary').getByRole('link', {name:'Plan a software launch'}).click();
  const launch = operating.getByRole('article');
  const launchAnswer = 'Invite three dispatchers to try our new routing product.';
  await launch.getByRole('radio', {name:'Our own software product'}).check();
  await launch.getByRole('textbox').fill(launchAnswer);
  await launch.getByRole('button', {name:'Finish step'}).click();
  await launch.getByRole('link', {name:'Create a follow-up'}).click();
  assert.equal(await operating.getByLabel('Item title', {exact:true}).inputValue(), 'Invite one early user to test the product');
  assert.ok((await operating.getByLabel('Next action', {exact:true}).inputValue()).includes(launchAnswer));
  await operating.getByRole('navigation', {name:'Workspace',exact:true}).getByRole('link', {name:'This week'}).click();
  await operations.getByText('0 of 3 steps complete').waitFor();

  const returning = await browser.newPage();
  await returning.goto(app.origin + '/#guide/forming-first-sale');
  await returning.getByLabel('Email address').fill('operating@guide.example');
  await returning.getByLabel('Password', {exact:true}).fill('Local guide browser fixture.');
  await returning.getByRole('button', {name:'Sign in', exact:true}).click();
  await returning.getByRole('heading', {level:1, name:'Test your product with one early user'}).waitFor();
  await returning.getByText(launchAnswer, {exact:true}).waitFor();
  assert.equal(new URL(returning.url()).hash, '#guide/forming-first-sale');
});
