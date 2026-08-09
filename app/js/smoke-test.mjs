/**
 * Quick node smoke test for parser + effects (no browser).
 * Run: node app/js/smoke-test.mjs
 */
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

const FIXTURE = `((Line1_9_8D8F2CF34BC4E1C347039CBFC9454FA5="WOO<30>OOOO!!",Line2_10_31E4E31F4760C365DC0487B0A7E34CD4="WOO<2>O-<.6>...",Reply1_25_E59F96C24CBD5635D1328EBB487B4F2D="Hi"),(Line1_9_8D8F2CF34BC4E1C347039CBFC9454FA5="Day two",R3Line16_71_AAA4EEF14828CCF6A2FE998C13466995="I see...!<1> <.6>W<-1>e"))`;

const { days, warnings } = parseDialogueAsset(FIXTURE);
console.assert(days.length === 2, `expected 2 days, got ${days.length}`);
console.assert(
  days[0].fields['Line1_9_8D8F2CF34BC4E1C347039CBFC9454FA5'] === 'WOO<30>OOOO!!',
  'day1 line1 mismatch'
);

const round = parseDialogueAsset(serializeDialogueAsset(days));
console.assert(round.days.length === 2, 'roundtrip day count');

console.assert(classifyEffect('30').kind === 'strong');
console.assert(classifyEffect('.1').kind === 'slow', 'default .1 is slow/ffwdable');
console.assert(classifyEffect('.15').kind === 'slow');
console.assert(classifyEffect('.5').kind === 'superSlow');
console.assert(classifyEffect('3').kind === 'shake');
console.assert(classifyEffect('-1').kind === 'reset');

const segs = buildVisualSegments('WOO<30>OOOO!!');
console.assert(segs[0].text === 'WOO' && segs[0].kind === 'plain', 'seg0');
console.assert(segs[1].text === 'OOOO!!' && segs[1].kind === 'strong' && segs[1].tags.includes('30'), 'seg1');

const segs2 = buildVisualSegments('I see...!<1> <.6>W<-1>e');
console.assert(stripTags('I see...!<1> <.6>W<-1>e') === 'I see...! We');
const wRun = segs2.find((s) => s.text.includes('W') && s.tags && s.tags.includes('.6'));
console.assert(wRun && wRun.tags.join(',') === '1,.6,-1', `W tags order got ${wRun && wRun.tags}`);

const duke = buildVisualSegments("It's Duke.<1> <.6>I<-1> know");
const dukeI = duke.find((s) => s.text.startsWith('I') && s.tags?.includes('.6'));
console.assert(dukeI, 'Duke I segment');
console.assert(
  dukeI.tags.join(',') === '1,.6,-1',
  `Duke I should be 1 · .6 · -1, got ${dukeI.tags}`
);
console.assert(dukeI.text === 'I', `balloon host should be letter I, got ${JSON.stringify(dukeI.text)}`);
console.assert(
  !duke.some((s) => s.text.includes('know') && s.tags.includes('-1')),
  '-1 must not sit on a separate overlapping balloon'
);

const pause = buildVisualSegments('thinking...<.5> <-1>I never');
const marked = pause.find((s) => s.tags.includes('.5') && s.tags.includes('-1'));
console.assert(marked && marked.kind === 'superSlow', `reset-ending cluster should mark: ${JSON.stringify(marked)}`);
console.assert(marked.text === 'I', `mark first letter, got ${JSON.stringify(marked)}`);
console.assert(marked.tags.join(',') === '.5,-1', 'pause tag order');

const multi = buildVisualSegments('Hi<30><.5>there');
const mseg = multi.find((s) => s.text.includes('there'));
console.assert(mseg && mseg.tags.join(',') === '30,.5', `adjacent tags got ${mseg && mseg.tags}`);

let stacked = applyEffectToSelection('Hello world', 6, 11, 'shake');
stacked = applyEffectToSelection(stacked.text, 6, 11, 'slow');
console.assert(
  stacked.text.includes('<3>') && stacked.text.includes('<.15>'),
  `stack apply got ${stacked.text}`
);

const orphanSegs = buildVisualSegments('Hello<.5>');
console.assert(orphanSegs.some((s) => s.kind === 'orphan'), 'orphan marker');
console.assert(hasTrailingTags('Hello<.5>'));
console.assert(stripTrailingTags('Hello<.5><-1>') === 'Hello');

let t = applyEffectToSelection('Hello world', 6, 11, 'slow');
console.assert(t.text === 'Hello <.15>world', `slow wrap got: ${t.text}`);
t = applyEffectToSelection('Hello world!', 6, 11, 'slow');
console.assert(t.text === 'Hello <.15>world<-1>!', `mid slow got: ${t.text}`);

const endBlock = applyEffectToSelection('Hello', 5, 5, 'slow');
console.assert(endBlock.error, 'should block tag at end');
const endInsert = insertTagAt('Hello', 5, '.5');
console.assert(endInsert.error, 'custom tag at end blocked');

console.log('OK — parser + effects smoke tests passed');
if (warnings.length) console.log('warnings:', warnings);
