import { chromium } from 'playwright';
import { FIELD_DEFS } from './schema.js';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const line1Key = FIELD_DEFS.find((f) => f.label === 'Line 1').key;
const line4Key = FIELD_DEFS.find((f) => f.label === 'Line 4').key;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const CHILD = `((Line1_9_8D8F2CF34BC4E1C347039CBFC9454FA5="WOO<30>OOOO!!",Line2_10_31E4E31F4760C365DC0487B0A7E34CD4="WOO<2>O-<.6>...",Line4_17_367AB18244586E69620720B2F11E376F="Sorry, but my mom would get angry.",R3Line16_71_AAA4EEF14828CCF6A2FE998C13466995="I see...!<1> <.6>W<-1>e"))`;
const GIRL = `((Line1_9_8D8F2CF34BC4E1C347039CBFC9454FA5="Hello from Girl"))`;

const dir = mkdtempSync(join(tmpdir(), 'da-'));
const childPath = join(dir, 'Child.txt');
const girlPath = join(dir, 'Girl.txt');
writeFileSync(childPath, CHILD);
writeFileSync(girlPath, GIRL);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(BASE + '?t=' + Date.now(), { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

assert(await page.locator('.empty-state').count(), 'empty state missing');
await page.getByRole('button', { name: 'Import DAs' }).first().click();
await page.setInputFiles('#import-files', [childPath, girlPath]);
await page.waitForTimeout(200);
await page.locator('#btn-import-confirm').click();
await page.waitForTimeout(400);

assert(await page.locator('.char-tab', { hasText: 'Child' }).count(), 'Child tab missing');
assert(await page.locator('.char-tab', { hasText: 'Girl' }).count(), 'Girl tab missing');

await page.locator('.char-tab', { hasText: 'Child' }).click();
await page.waitForTimeout(150);
const line1Plain = await page.locator(`.visual-line[data-key="${line1Key}"]`).evaluate((el) => {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('.fx-balloon')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  let t = '';
  let n;
  while ((n = walk.nextNode())) t += n.textContent;
  return t;
});
assert(line1Plain.includes('WOO'), `Child line1 missing: ${line1Plain}`);
assert(await page.locator('.fx-balloon[data-balloon="30"]').count(), 'missing balloon');
assert(await page.locator('.fx-balloon[data-balloon="1 · .6 · -1"]').count(), 'missing stacked balloon');
assert(await page.locator('.fx-chip-dot').count(), 'missing chip separator dots');

await page.locator('.char-tab', { hasText: 'Girl' }).click();
await page.waitForTimeout(150);
const girlText = await page.locator(`.visual-line[data-key="${line1Key}"]`).evaluate((el) => {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('.fx-balloon')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  let t = '';
  let n;
  while ((n = walk.nextNode())) t += n.textContent;
  return t;
});
assert(girlText.includes('Girl'), `Girl dialogue missing: ${girlText}`);

// Edit + undo on Child
await page.locator('.char-tab', { hasText: 'Child' }).click();
await page.waitForTimeout(100);
await page.locator(`.visual-line[data-key="${line4Key}"]`).click();
await page.evaluate((key) => {
  const el = document.querySelector(`.visual-line[data-key="${key}"]`);
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('.fx-balloon')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let plain = '';
  let n;
  while ((n = walk.nextNode())) {
    nodes.push(n);
    plain += n.textContent;
  }
  const start = plain.indexOf('mom');
  const end = start + 3;
  function loc(index) {
    let rem = index;
    for (const node of nodes) {
      if (rem <= node.textContent.length) return { node, offset: rem };
      rem -= node.textContent.length;
    }
    const last = nodes.at(-1);
    return { node: last, offset: last.textContent.length };
  }
  const a = loc(start);
  const b = loc(end);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}, line4Key);
await page.locator('.stamp[data-effect="slow"]').click();
await page.waitForTimeout(200);
assert(!(await page.locator('#btn-undo').isDisabled()), 'undo should enable');
await page.locator('#btn-undo').click();
await page.waitForTimeout(200);

console.log('E2E OK');
await browser.close();
