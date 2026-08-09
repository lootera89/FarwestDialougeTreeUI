/**
 * Quick node smoke test for parser + effects (no browser).
 * Run: node --experimental-vm-modules app/js/smoke-test.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { parseDialogueAsset, serializeDialogueAsset, unescapeUnreal } from './parser.js';
import {
  buildVisualSegments,
  applyEffectToSelection,
  stripTags,
  classifyEffect,
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
console.assert(classifyEffect('.1').kind === 'verySlow');
console.assert(classifyEffect('.5').kind === 'slow');
console.assert(classifyEffect('3').kind === 'shake');
console.assert(classifyEffect('-1').kind === 'reset');

const segs = buildVisualSegments('WOO<30>OOOO!!');
console.assert(segs[0].text === 'WOO' && segs[0].kind === 'plain', 'seg0');
console.assert(segs[1].text === 'OOOO!!' && segs[1].kind === 'strong', 'seg1');

const segs2 = buildVisualSegments('I see...!<1> <.6>W<-1>e');
console.assert(stripTags('I see...!<1> <.6>W<-1>e') === 'I see...! We');

let t = 'Hello world';
t = applyEffectToSelection(t, 6, 11, 'slow'); // "world"
console.assert(t === 'Hello <.5>world<-1>', `slow wrap got: ${t}`);

t = applyEffectToSelection('WOOOOO!!', 3, 3, 'strongShake');
console.assert(t === 'WOO<30>OOO!!', `shake insert got: ${t}`);

console.log('OK — parser + effects smoke tests passed');
if (warnings.length) console.log('warnings:', warnings);
