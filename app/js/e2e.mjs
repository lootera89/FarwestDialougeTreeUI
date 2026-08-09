import { chromium } from 'playwright';
import { FIELD_DEFS } from './schema.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const line4Key = FIELD_DEFS.find((f) => f.label === 'Line 4').key;
const line1Key = FIELD_DEFS.find((f) => f.label === 'Line 1').key;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const selectPlain = async (page, key, target) => {
  const ok = await page.evaluate(
    ({ key, target }) => {
      const el = document.querySelector(`.visual-line[data-key="${key}"]`);
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.parentElement?.closest('.fx-balloon, .fx-orphan, .fx-chunk-orphan')
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
      const start = plain.indexOf(target);
      if (start < 0) return false;
      const end = start + target.length;
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
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return true;
    },
    { key, target }
  );
  assert(ok, `could not select "${target}"`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

await page.goto(BASE + '?t=' + Date.now(), { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Load sample' }).click();
await page.waitForTimeout(500);

assert(await page.getByRole('button', { name: 'Day 7' }).isVisible(), 'Day 7 tab missing');

// Balloons exist on sample Line 1 and sit above (absolute), not in plain text
const line1 = page.locator(`.visual-line[data-key="${line1Key}"]`);
assert(await line1.locator('.fx-balloon[data-balloon="30"]').count(), 'Line1 missing 30 balloon');
const line1Plain = await line1.evaluate((el) => {
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
assert(line1Plain === 'WOOOOOO!!', `Line1 plain interrupted: ${JSON.stringify(line1Plain)}`);

// Stacked sample tags (Day1 R3 has <1> <.6>)
const stacked = await page.locator('.fx-balloon[data-balloon="1 · .6"]').count();
assert(stacked > 0, 'missing stacked 1 · .6 balloon from sample');

await page.getByRole('button', { name: 'Copy Unreal code' }).click();
const exportBefore = await page.locator('#export-text').inputValue();
assert(exportBefore.includes('WOO<30>OOOO!!'), 'Line1 missing in export');
await page.getByRole('button', { name: 'Close' }).click();

const line4 = page.locator(`.visual-line[data-key="${line4Key}"]`);
await line4.click();
await selectPlain(page, line4Key, 'my mom would get angry');
await page.locator('.stamp[data-effect="slow"]').click();
await page.waitForTimeout(300);

const rawToggle = page.getByRole('button', { name: /raw tags/i });
if ((await rawToggle.textContent()).includes('Show')) await rawToggle.click();

const raw4 = page.locator(`.block[data-key="${line4Key}"] .raw-preview`);
assert(
  (await raw4.textContent()).trim() === 'Sorry, but <.15>my mom would get angry<-1>.',
  `slow wrap mismatch: ${(await raw4.textContent()).trim()}`
);

assert(await line4.locator('.fx-balloon[data-balloon=".15"]').count(), 'missing .15 balloon');

// Stack shake then slow on "angry"
await selectPlain(page, line4Key, 'angry');
await page.locator('.stamp[data-effect="shake"]').click();
await page.waitForTimeout(200);
await selectPlain(page, line4Key, 'angry');
await page.locator('.stamp[data-effect="slow"]').click();
await page.waitForTimeout(250);

const balloons = await line4.locator('.fx-balloon').evaluateAll((els) =>
  els.map((e) => e.getAttribute('data-balloon'))
);
assert(
  balloons.some((b) => b.includes('3') && b.includes('.15')),
  `expected stacked balloon, got ${JSON.stringify(balloons)}`
);

// Undo / redo
assert(!(await page.locator('#btn-undo').isDisabled()), 'undo should be enabled');
const beforeUndo = (await raw4.textContent()).trim();
await page.locator('#btn-undo').click();
await page.waitForTimeout(250);
assert((await raw4.textContent()).trim() !== beforeUndo, 'undo did not change line');
assert(!(await page.locator('#btn-redo').isDisabled()), 'redo should be enabled');
await page.locator('#btn-redo').click();
await page.waitForTimeout(250);
assert((await raw4.textContent()).trim() === beforeUndo, 'redo failed');

const raw1 = (await page.locator(`.block[data-key="${line1Key}"] .raw-preview`).textContent()).trim();
assert(raw1 === 'WOO<30>OOOO!!', `Line1 corrupted: ${raw1}`);

await page.getByRole('button', { name: 'Day 7' }).click();
await page.waitForTimeout(200);
assert((await page.locator('.visual-line').first().textContent()).includes('John'), 'Day7 missing John');

assert(errors.filter((e) => !e.includes('favicon')).length === 0, `page errors: ${errors.join('; ')}`);
console.log('E2E OK');
await browser.close();
