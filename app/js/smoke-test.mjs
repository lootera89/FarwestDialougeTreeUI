/**
 * Quick node smoke test for parser + effects (no browser).
 * Run: node app/js/smoke-test.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { parseDialogueAsset, serializeDialogueAsset } from './parser.js';
import {
  buildVisualSegments,
  applyEffectToSelection,
  stripTags,
  stripTrailingTags,
  hasTrailingTags,
  classifyEffect,
  insertTagAt,
} from './effects.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sample = readFileSync(join(__dirname, '../../sample/dialogues.txt'), 'utf8');

const { days, warnings } = parseDialogueAsset(sample);
console.assert(days.length === 7, `expected 7 days, got ${days.length}`);
console.assert(
  days[0].fields['Line1_9_8D8F2CF34BC4E1C347039CBFC9454FA5'] === 'WOO<30>OOOO!!',
  'day1 line1 mismatch'
);
console.assert(
  days[0].fields['Reply1_25_E59F96C24CBD5635D1328EBB487B4F2D'] === "It's okay, kiddo. Keep playing.",
  'unescape failed'
);

const round = parseDialogueAsset(serializeDialogueAsset(days));
console.assert(round.days.length === 7, 'roundtrip day count');
console.assert(
  round.days[6].fields['R5Line26_95_29D6473A4A953916F310AD8F0513809C'] === 'B<.1>L<100>UGHHHHH!',
  'roundtrip last day'
);

console.assert(classifyEffect('30').kind === 'strong');
console.assert(classifyEffect('.1').kind === 'slow', 'default .1 is slow/ffwdable');
console.assert(classifyEffect('.15').kind === 'slow');
console.assert(classifyEffect('.5').kind === 'superSlow');
console.assert(classifyEffect('.6').kind === 'superSlow');
console.assert(classifyEffect('3').kind === 'shake');
console.assert(classifyEffect('-1').kind === 'reset');

const segs = buildVisualSegments('WOO<30>OOOO!!');
console.assert(segs[0].text === 'WOO' && segs[0].kind === 'plain', 'seg0');
console.assert(segs[1].text === 'OOOO!!' && segs[1].kind === 'strong' && segs[1].raw === '30', 'seg1');

const segs2 = buildVisualSegments('I see...!<1> <.6>W<-1>e');
console.assert(stripTags('I see...!<1> <.6>W<-1>e') === 'I see...! We');
const slowRun = segs2.find((s) => s.tags && s.tags.includes('.6'));
console.assert(slowRun && slowRun.tags.includes('1') && slowRun.tags.includes('.6'), 'cluster tags');
console.assert(slowRun.text.includes('W'), 'cluster text');

const multi = buildVisualSegments('Hi<30><.5>there');
const mseg = multi.find((s) => s.text.includes('there'));
console.assert(mseg && mseg.tags.join(',') === '30,.5', `adjacent tags got ${mseg && mseg.tags}`);

// Shake then slow should stack
let stacked = applyEffectToSelection('Hello world', 6, 11, 'shake');
stacked = applyEffectToSelection(stacked.text, 6, 11, 'slow');
console.assert(
  stacked.text.includes('<3>') && stacked.text.includes('<.15>'),
  `stack apply got ${stacked.text}`
);
const stackSegs = buildVisualSegments(stacked.text);
console.assert(
  stackSegs.some((s) => (s.tags || []).includes('3') && (s.tags || []).includes('.15')),
  'stack visual tags'
);

const orphanSegs = buildVisualSegments('Hello<.5>');
console.assert(orphanSegs.some((s) => s.kind === 'orphan'), 'orphan marker');
console.assert(hasTrailingTags('Hello<.5>'));
console.assert(stripTrailingTags('Hello<.5><-1>') === 'Hello');
console.assert(stripTrailingTags('Hello<.5>world') === 'Hello<.5>world');

let t = applyEffectToSelection('Hello world', 6, 11, 'slow'); // "world" at end → no <-1>
console.assert(t.text === 'Hello <.15>world', `slow wrap got: ${t.text}`);
t = applyEffectToSelection(t.text, 6, 11, 'slow');
console.assert(t.text === 'Hello <.15>world', `idempotent slow got: ${t.text}`);

// Mid-string slow keeps <-1> before following letters
t = applyEffectToSelection('Hello world!', 6, 11, 'slow');
console.assert(t.text === 'Hello <.15>world<-1>!', `mid slow got: ${t.text}`);

t = applyEffectToSelection('WOOOOO!!', 3, 3, 'strongShake');
console.assert(t.text === 'WOO<30>OOO!!', `shake insert got: ${t.text}`);

const endBlock = applyEffectToSelection('Hello', 5, 5, 'slow');
console.assert(endBlock.error, 'should block tag at end');

const endInsert = insertTagAt('Hello', 5, '.5');
console.assert(endInsert.error, 'custom tag at end blocked');

const mom = 'Sorry, but my mom would get angry.';
let m = applyEffectToSelection(mom, 11, 33, 'superSlow');
console.assert(m.text === 'Sorry, but <.5>my mom would get angry<-1>.', m.text);
m = applyEffectToSelection(m.text, 11, 33, 'superSlow');
console.assert(m.text === 'Sorry, but <.5>my mom would get angry<-1>.', `mom idempotent: ${m.text}`);

console.log('OK — parser + effects smoke tests passed');
if (warnings.length) console.log('warnings:', warnings);
