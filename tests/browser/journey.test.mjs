import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startApp } from '../server.mjs';

async function assertFitsPhone(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
    'The page must fit the phone without horizontal scrolling');
}

const monthly = 'Send monthly records to the bookkeeper';
const sourceUrl = 'https://example.test/bookkeeping/handover';
const confirmationUrl = 'https://example.test/receipts/january';

test('a founder chooses a checklist, tracks a follow-up and files a monthly confirmation in the browser', { timeout: 120_000 }, async t => {
  const app = await startApp(t);
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1200, height: 850}, timezoneId: 'UTC'});
  page.setDefaultTimeout(10_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(app.origin);
  await page.getByLabel('Email address').fill('founder@bookwork.example');
  await page.getByLabel('Password', {exact: true}).fill('A private passphrase for browser tests.');
  await page.getByRole('button', {name:'Create account'}).click();
  await page.getByRole('heading', {name:'Your company'}).waitFor();
  assert.equal(await page.getByLabel(/Company name/).inputValue(), '');
  await page.getByLabel('Country or region').fill('Ireland');
  await page.getByLabel('What does your business do?').fill('We restore bindings on old books.');
  await page.getByLabel('Already operating').check();
  await page.getByRole('button', {name:'Build my checklist'}).click();

  await page.getByRole('heading', {name:'Your starting checklist'}).waitFor();
  await page.getByRole('checkbox', {name:'Organize the company records'}).uncheck();
  await page.getByRole('button', {name:'Edit Review invoices awaiting payment'}).click();
  await page.getByLabel('Item title').fill('Review bookbinding invoices');
  await page.getByRole('button', {name:'Close editor for Review bookbinding invoices'}).click();
  await page.getByRole('button', {name:'Add my own item'}).click();
  await page.getByLabel('Item title').fill('Confirm delivery of the paper order');
  await page.getByLabel('Next action').fill('Ask the paper supplier for a dispatch date.');
  await page.getByRole('button', {name:'Open my workspace'}).click();

  await page.getByRole('heading', {name:'This week', exact:true}).waitFor();
  await page.getByRole('link', {name:/Review bookbinding invoices/}).waitFor();
  assert.equal(await page.getByRole('link', {name:/Organize the company records/}).count(), 0);
  assert.equal(await page.getByRole('link', {name:/Stillpoint/}).count(), 0);

  await page.setViewportSize({width: 390, height: 844});
  await assertFitsPhone(page);
  await page.getByRole('link', {name:/Confirm delivery of the paper order/}).click();
  assert.equal(await page.getByLabel('Due date', {exact:true}).inputValue(), '');
  await page.getByLabel('Next action').fill('Check for a dispatch confirmation.');
  await page.getByLabel('Status', {exact:true}).selectOption('waiting');
  await page.getByLabel('Who or what are you waiting for?').fill('The paper supplier');
  const tomorrow = await page.evaluate(() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  });
  await page.getByLabel('Follow-up date').fill(tomorrow);
  await page.getByRole('button', {name:'Save changes'}).click();
  await page.getByRole('heading', {name:'This week', exact:true}).waitFor();
  await page.reload();
  await page.getByText('Waiting for The paper supplier', {exact:true}).waitFor();
  await page.getByRole('link', {name:/Confirm delivery of the paper order.*Follow up/}).waitFor();
  await page.getByRole('link', {name:/Confirm delivery of the paper order.*Waiting for/}).click();
  assert.equal(await page.getByLabel('Next action').inputValue(), 'Check for a dispatch confirmation.');
  assert.equal(await page.getByLabel('Follow-up date').inputValue(), tomorrow);
  await assertFitsPhone(page);

  await page.getByRole('navigation', {name:'Workspace', exact:true}).getByRole('link', {name:'This week'}).click();
  await page.getByRole('link', {name:new RegExp(monthly)}).click();
  await page.getByLabel('Record month').fill('2032-01');
  await page.getByLabel('Due date', {exact:true}).fill('2032-01-31');
  await page.getByLabel('Date source link').fill(sourceUrl);
  await page.getByLabel('Confirmation or document link').fill(confirmationUrl);
  await page.getByRole('button', {name:'Mark complete'}).click();
  await page.getByText('Completed record', {exact:true}).waitFor();
  const completedUrl = page.url();
  assert.equal(await page.getByRole('link', {name:'Open confirmation or document'}).getAttribute('href'), confirmationUrl);
  await page.getByRole('link', {name:/February 2032.*Open occurrence/}).click();
  assert.equal(await page.getByLabel('Record month').inputValue(), '2032-02');
  assert.equal(await page.getByLabel('Due date', {exact:true}).inputValue(), '2032-02-29');
  assert.equal(await page.getByLabel('Confirmation or document link').inputValue(), '');
  assert.equal(await page.getByLabel('Date source link').inputValue(), sourceUrl);
  await page.getByRole('link', {name:/January 2032.*Completed/}).waitFor();

  await page.getByRole('navigation', {name:'Workspace', exact:true}).getByRole('link', {name:'Company records'}).click();
  const completedFilter = page.getByRole('link', {name:/^Completed 1$/});
  await completedFilter.click();
  await page.getByRole('navigation', {name:'Filter records'}).locator('a[aria-current="page"]').filter({hasText:'Completed'}).waitFor();
  assert.equal(await page.getByRole('link', {name:new RegExp(monthly)}).count(), 1);
  await page.getByRole('link', {name:new RegExp(monthly)}).click();
  assert.equal(new URL(page.url()).hash.split('?')[0], new URL(completedUrl).hash.split('?')[0]);
  await page.reload();
  const evidence = page.getByRole('link', {name:'Open confirmation or document'});
  await evidence.waitFor();
  assert.equal(await evidence.getAttribute('href'), confirmationUrl);
  assert.equal(await page.getByRole('link', {name:'Open date source'}).getAttribute('href'), sourceUrl);
  await assertFitsPhone(page);
  assert.deepEqual(pageErrors, []);
});
