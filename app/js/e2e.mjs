import { chromium } from 'playwright';
import { FIELD_DEFS } from './schema.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const line4Key = FIELD_DEFS.find((f) => f.label === 'Line 4').key;
const line1Key = FIELD_DEFS.find((f) => f.label === 'Line 1').key;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Load sample' }).click();
await page.waitForTimeout(400);

// Day tabs
assert(await page.getByRole('button', { name: 'Day 7' }).isVisible(), 'Day 7 tab missing');

// Line 1 sample intact (via export before edits)
await page.getByRole('button', { name: 'Copy Unreal code' }).click();
const exportBefore = await page.locator('#export-text').inputValue();
assert(exportBefore.includes('WOO<30>OOOO!!'), `Line1 missing in export: ${exportBefore.slice(0, 120)}`);
await page.getByRole('button', { name: 'Close' }).click();

// Select text in Line 4 visual editor
const line4 = page.locator(`.visual-line[data-key="${line4Key}"]`);
await line4.click();
await page.evaluate((key) => {
  const el = document.querySelector(`.visual-line[data-key="${key}"]`);
  const text = el.textContent;
  const target = 'my mom would get angry';
  const start = text.indexOf(target);
  const end = start + target.length;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walk.nextNode())) nodes.push(n);
  function loc(index) {
    let rem = index;
    for (const node of nodes) {
      const len = node.textContent.length;
      if (rem <= len) return { node, offset: rem };
      rem -= len;
    }
    const last = nodes[nodes.length - 1];
    return { node: last, offset: last.textContent.length };
  }
  const a = loc(start);
  const b = loc(end);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}, line4Key);

await page.locator('.stamp[data-effect="slow"]').click();
await page.waitForTimeout(300);

// Show raw
const rawToggle = page.getByRole('button', { name: /raw tags/i });
if ((await rawToggle.textContent()).includes('Show')) {
  await rawToggle.click();
}

const raw4 = page.locator(`.block[data-key="${line4Key}"] .raw-preview`);
await page.waitForTimeout(100);
const raw4Text = (await raw4.textContent()).trim();
assert(
  raw4Text === 'Sorry, but <.5>my mom would get angry<-1>.',
  `Line4 raw expected Slow wrap, got: ${JSON.stringify(raw4Text)}`
);

// Idempotent second Slow
await line4.click();
await page.evaluate((key) => {
  const el = document.querySelector(`.visual-line[data-key="${key}"]`);
  const text = el.textContent;
  const target = 'my mom would get angry';
  const start = text.indexOf(target);
  const end = start + target.length;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walk.nextNode())) nodes.push(n);
  function loc(index) {
    let rem = index;
    for (const node of nodes) {
      const len = node.textContent.length;
      if (rem <= len) return { node, offset: rem };
      rem -= len;
    }
    const last = nodes[nodes.length - 1];
    return { node: last, offset: last.textContent.length };
  }
  const a = loc(start);
  const b = loc(end);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}, line4Key);
await page.locator('.stamp[data-effect="slow"]').click();
await page.waitForTimeout(200);
const raw4Again = (await raw4.textContent()).trim();
assert(
  raw4Again === 'Sorry, but <.5>my mom would get angry<-1>.',
  `Line4 not idempotent: ${JSON.stringify(raw4Again)}`
);

const raw1 = (await page.locator(`.block[data-key="${line1Key}"] .raw-preview`).textContent()).trim();
assert(raw1 === 'WOO<30>OOOO!!', `Line1 corrupted: ${JSON.stringify(raw1)}`);

// Day 7 loads
await page.getByRole('button', { name: 'Day 7' }).click();
await page.waitForTimeout(200);
const day7Line1 = page.locator('.visual-line').first();
const t = await day7Line1.textContent();
assert(t.includes('John'), `Day7 expected John, got ${t}`);

// Export still valid-ish
await page.getByRole('button', { name: 'Day 1' }).click();
await page.getByRole('button', { name: 'Copy Unreal code' }).click();
const exported = await page.locator('#export-text').inputValue();
assert(exported.startsWith('(('), 'export should start with ((');
assert(exported.includes('<.5>my mom would get angry<-1>'), 'export missing edited line');

assert(errors.filter((e) => !e.includes('favicon')).length === 0, `page errors: ${errors.join('; ')}`);

console.log('E2E OK');
await browser.close();
