import { FIELD_DEFS, keysForGroup, emptyDay } from './schema.js';
import { parseDialogueAsset, serializeDialogueAsset } from './parser.js';
import {
  EFFECT_PRESETS,
  applyEffectToSelection,
  buildVisualSegments,
  effectClassName,
  insertTagAt,
  stripTags,
  stripTrailingTags,
} from './effects.js';

const SAMPLE_URL = './sample/dialogues.txt';

const state = {
  days: [emptyDay()],
  dayIndex: 0,
  activeField: null,
  activePlainRange: { start: 0, end: 0 },
  stamp: null,
  showRaw: false,
  editMode: 'visual',
  history: [],
  future: [],
  historyReady: false,
};

const HISTORY_LIMIT = 80;

function cloneDays(days) {
  return days.map((d) => ({ fields: { ...d.fields } }));
}

function snapshotNow() {
  return {
    days: cloneDays(state.days),
    dayIndex: state.dayIndex,
  };
}

function pushHistory() {
  if (!state.historyReady) return;
  state.history.push(snapshotNow());
  if (state.history.length > HISTORY_LIMIT) state.history.shift();
  state.future = [];
  updateHistoryButtons();
}

function restoreSnapshot(snap) {
  state.days = cloneDays(snap.days);
  state.dayIndex = Math.min(snap.dayIndex, state.days.length - 1);
  state.activeField = null;
  render();
  updateHistoryButtons();
}

function undo() {
  if (!state.history.length) return;
  state.future.push(snapshotNow());
  restoreSnapshot(state.history.pop());
  toast('Undo');
}

function redo() {
  if (!state.future.length) return;
  state.history.push(snapshotNow());
  restoreSnapshot(state.future.pop());
  toast('Redo');
}

function updateHistoryButtons() {
  const u = document.getElementById('btn-undo');
  const r = document.getElementById('btn-redo');
  if (u) u.disabled = state.history.length === 0;
  if (r) r.disabled = state.future.length === 0;
}

const els = {
  dayBar: document.getElementById('day-bar'),
  treeRoot: document.getElementById('tree-root'),
  importDialog: document.getElementById('import-dialog'),
  exportDialog: document.getElementById('export-dialog'),
  importText: document.getElementById('import-text'),
  exportText: document.getElementById('export-text'),
  toast: document.getElementById('toast'),
  customInput: document.getElementById('custom-tag-input'),
};

let toastTimer = null;
function toast(msg) {
  els.toast.hidden = false;
  els.toast.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2200);
}

function currentDay() {
  return state.days[state.dayIndex];
}

function setField(key, value) {
  currentDay().fields[key] = value;
}

function mutate(fn) {
  pushHistory();
  fn();
}

function getField(key) {
  return currentDay().fields[key] ?? '';
}

/* ---------- Day bar ---------- */
function renderDayBar() {
  els.dayBar.innerHTML = '';
  state.days.forEach((_, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day-tab' + (i === state.dayIndex ? ' active' : '');
    btn.textContent = `Day ${i + 1}`;
    btn.addEventListener('click', () => {
      state.dayIndex = i;
      state.activeField = null;
      render();
    });
    els.dayBar.appendChild(btn);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'day-add';
  add.textContent = '+ Day';
  add.addEventListener('click', () => {
    mutate(() => {
      state.days.push(emptyDay());
      state.dayIndex = state.days.length - 1;
    });
    render();
  });
  els.dayBar.appendChild(add);

  if (state.days.length > 1) {
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'day-remove';
    rm.textContent = 'Remove day';
    rm.addEventListener('click', () => {
      mutate(() => {
        state.days.splice(state.dayIndex, 1);
        state.dayIndex = Math.max(0, state.dayIndex - 1);
      });
      render();
    });
    els.dayBar.appendChild(rm);
  }

  const help = document.createElement('span');
  help.className = 'help-chip';
  help.textContent = 'Click a line · select text · stamp an effect';
  els.dayBar.appendChild(help);
}

/* ---------- Visual editor helpers ---------- */
function renderVisualHTML(tagged) {
  const segs = buildVisualSegments(tagged);
  return segs
    .map((s) => {
      const tags = (s.tags || []).filter(Boolean);
      // Don't litter balloons with lone resets; still show them if stacked with others
      const commentTags =
        tags.length === 1 && tags[0] === '-1' ? [] : tags;
      const comment = commentTags.length ? escapeHtml(commentTags.join(' · ')) : '';
      const balloon = comment
        ? `<span class="fx-balloon" contenteditable="false" data-balloon="${comment}">${comment}</span>`
        : '';

      if (s.kind === 'orphan') {
        return `<span class="fx-chunk fx-chunk-orphan" contenteditable="false">${balloon}<span class="fx-orphan" data-kind="orphan"></span></span>`;
      }
      const safe = escapeHtml(s.text);
      return `<span class="fx-chunk">${balloon}<span class="fx-run ${effectClassName(s.kind)}" data-kind="${s.kind}">${safe}</span></span>`;
    })
    .join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isBalloonNode(node) {
  const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  return !!(el && el.closest && el.closest('.fx-balloon, .fx-orphan, .fx-chunk-orphan'));
}

/** Plain letters only — balloons never count. */
function visualPlainText(visualEl) {
  let out = '';
  const walk = document.createTreeWalker(visualEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return isBalloonNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  let n;
  while ((n = walk.nextNode())) out += n.textContent;
  return out;
}

function plainLengthBefore(visualEl, targetNode, targetOffset) {
  let len = 0;
  const walk = document.createTreeWalker(visualEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return isBalloonNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  let n;
  while ((n = walk.nextNode())) {
    if (n === targetNode) return len + targetOffset;
    len += n.textContent.length;
  }
  return len;
}

/** Get plain caret/selection offsets inside a visual-line contenteditable. */
function getPlainSelectionOffsets(visualEl) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !visualEl.contains(sel.anchorNode)) {
    return null;
  }
  const range = sel.getRangeAt(0);
  const start = plainLengthBefore(visualEl, range.startContainer, range.startOffset);
  const end = plainLengthBefore(visualEl, range.endContainer, range.endOffset);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function setPlainSelection(visualEl, start, end) {
  const textNodes = [];
  const walk = document.createTreeWalker(visualEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return isBalloonNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  let n;
  while ((n = walk.nextNode())) textNodes.push(n);

  function locate(index) {
    let remaining = index;
    for (const node of textNodes) {
      const len = node.textContent.length;
      if (remaining <= len) return { node, offset: remaining };
      remaining -= len;
    }
    const last = textNodes[textNodes.length - 1];
    if (last) return { node: last, offset: last.textContent.length };
    return { node: visualEl, offset: 0 };
  }

  const a = locate(start);
  const b = locate(end);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * After user types in visual mode, rebuild tagged string by preserving
 * effect spans' kinds mapped onto new plain text via a simple approach:
 * sync from contenteditable plain text is lossy for mid-edit tags.
 *
 * Strategy: while editing visually, we keep tagged in data-tagged attribute
 * and only allow text edits that strip tags if structure changes drastically.
 * Better approach: on input, map each span's new text back, keeping tags
 * between spans based on kind transitions.
 */
function visualDomToTagged(visualEl, previousTagged) {
  return rebuildTaggedFromPlain(previousTagged, visualPlainText(visualEl));
}

/**
 * Rebuild tagged string: keep tag positions relative to old plain text
 * using a diff-ish approach — for typing, replace entire text tokens
 * proportionally. Simpler robust approach used here:
 * If the plain text equals strip(old) except for local edits, splice.
 * Full solution: LCS on plain chars with tags anchored to following char.
 *
 * Practical approach for this editor:
 * Tags are anchors before runs of characters. We associate each tag with
 * the plain index it sits at. When plain text changes, map old plain indices
 * to new via a simple prefix/suffix match around the edit.
 */
function rebuildTaggedFromPlain(oldTagged, newPlain) {
  const oldPlain = stripTags(oldTagged ?? '');
  if (newPlain === oldPlain) return oldTagged ?? '';

  // Extract anchors: list of { plainIndex, tagRaw }
  const anchors = [];
  let plainIdx = 0;
  const re = /<([^<>]+)>|([^<]+)/g;
  let m;
  const src = oldTagged ?? '';
  while ((m = re.exec(src)) !== null) {
    if (m[1] != null) anchors.push({ plainIndex: plainIdx, tag: m[1] });
    else plainIdx += m[2].length;
  }

  // Find edit bounds between oldPlain and newPlain
  let prefix = 0;
  while (
    prefix < oldPlain.length &&
    prefix < newPlain.length &&
    oldPlain[prefix] === newPlain[prefix]
  ) {
    prefix += 1;
  }
  let oldSuffix = 0;
  while (
    oldSuffix < oldPlain.length - prefix &&
    oldSuffix < newPlain.length - prefix &&
    oldPlain[oldPlain.length - 1 - oldSuffix] === newPlain[newPlain.length - 1 - oldSuffix]
  ) {
    oldSuffix += 1;
  }
  const oldEditEnd = oldPlain.length - oldSuffix;
  const newEditEnd = newPlain.length - oldSuffix;

  // Map old plain index → new plain index
  function mapIndex(oldIndex) {
    if (oldIndex <= prefix) return oldIndex;
    if (oldIndex >= oldEditEnd) return newEditEnd + (oldIndex - oldEditEnd);
    // Inside deleted region: clamp to edit start
    return prefix;
  }

  // Build new tagged string
  let out = '';
  let cursor = 0; // in newPlain
  const mappedAnchors = anchors
    .map((a) => ({ plainIndex: mapIndex(a.plainIndex), tag: a.tag }))
    .sort((a, b) => a.plainIndex - b.plainIndex || 0);

  for (const a of mappedAnchors) {
    if (a.plainIndex < cursor) continue; // drop tags that collapsed into edit
    if (a.plainIndex > newPlain.length) break;
    out += newPlain.slice(cursor, a.plainIndex);
    out += `<${a.tag}>`;
    cursor = a.plainIndex;
  }
  out += newPlain.slice(cursor);
  // Drop tags that slipped past the last letter (they never play)
  return stripTrailingTags(out);
}

function rememberSelectionFromActive() {
  if (!state.activeField) return;
  const visual = document.querySelector(
    `.visual-line[data-key="${CSS.escape(state.activeField)}"]`
  );
  if (!visual) return;
  const offsets = getPlainSelectionOffsets(visual);
  if (offsets) state.activePlainRange = offsets;
}

function applyStamp(effectKey) {
  rememberSelectionFromActive();
  if (!state.activeField) {
    toast('Select a dialogue line first');
    return;
  }
  const key = state.activeField;
  const tagged = getField(key);
  const { start, end } = state.activePlainRange;

  if (effectKey === 'clear' && start === end) {
    const cleaned = stripTrailingTags(tagged);
    if (cleaned !== tagged) {
      mutate(() => setField(key, cleaned));
      renderTree(true);
      toast('Removed trailing tag');
      return;
    }
    toast('Select text to clear tags from');
    return;
  }

  const result = applyEffectToSelection(tagged, start, end, effectKey);
  if (result.error) {
    toast(result.error);
    return;
  }
  mutate(() => setField(key, result.text));

  const plainLen = stripTags(result.text).length;
  const selStart = Math.min(start, plainLen);
  const selEnd = Math.min(Math.max(end, start), plainLen);
  state.activePlainRange = { start: selStart, end: selEnd };

  renderTree(true);
  requestAnimationFrame(() => {
    const visual = document.querySelector(`.visual-line[data-key="${CSS.escape(key)}"]`);
    if (visual) {
      visual.focus();
      try {
        setPlainSelection(visual, selStart, selEnd);
      } catch {
        /* ignore */
      }
    }
  });
  const label = EFFECT_PRESETS[effectKey]?.label || (effectKey === 'clear' ? 'Cleared' : 'Applied');
  toast(result.cleanedTrailing ? `${label} · trimmed trailing tag` : label);
}

/* ---------- Block rendering ---------- */
function createLineBlock(fieldDef) {
  const tagged = getField(fieldDef.key);
  const isPlayer = fieldDef.role === 'reply';
  const block = document.createElement('div');
  block.className = 'block' + (isPlayer ? ' player' : '') + (state.activeField === fieldDef.key ? ' focused' : '');
  if (state.showRaw) block.classList.add('show-raw');
  block.dataset.key = fieldDef.key;

  const meta = document.createElement('div');
  meta.className = 'block-meta';
  meta.innerHTML = `<span>${escapeHtml(fieldDef.label)}</span>`;

  const tools = document.createElement('div');
  tools.className = 'block-tools';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'icon-btn';
  clearBtn.title = 'Clear line';
  clearBtn.textContent = '×';
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    mutate(() => setField(fieldDef.key, ''));
    renderTree(true);
  });
  tools.appendChild(clearBtn);
  meta.appendChild(tools);
  block.appendChild(meta);

  const visual = document.createElement('div');
  visual.className = 'visual-line';
  visual.contentEditable = 'true';
  visual.spellcheck = true;
  visual.dataset.key = fieldDef.key;
  visual.dataset.placeholder = isPlayer ? 'Player reply…' : 'Character line…';
  visual.innerHTML = renderVisualHTML(tagged);
  // Only blank the editor when there is truly nothing (no text, no orphan markers)

  visual.addEventListener('focus', () => {
    state.activeField = fieldDef.key;
    document.querySelectorAll('.block.focused').forEach((b) => b.classList.remove('focused'));
    block.classList.add('focused');
  });

  visual.addEventListener('mouseup', () => {
    state.activeField = fieldDef.key;
    const off = getPlainSelectionOffsets(visual);
    if (off) state.activePlainRange = off;
  });
  visual.addEventListener('keyup', () => {
    const off = getPlainSelectionOffsets(visual);
    if (off) state.activePlainRange = off;
  });

  let inputTimer = null;
  let typingHistoryArmed = true;
  visual.addEventListener('focus', () => {
    typingHistoryArmed = true;
  });
  visual.addEventListener('beforeinput', () => {
    if (typingHistoryArmed) {
      pushHistory();
      typingHistoryArmed = false;
    }
  });
  visual.addEventListener('input', () => {
    const prev = getField(fieldDef.key);
    const next = visualDomToTagged(visual, prev);
    setField(fieldDef.key, next);
    // Re-color without killing caret: defer full refresh slightly
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => {
      const off = getPlainSelectionOffsets(visual) || state.activePlainRange;
      visual.innerHTML = renderVisualHTML(getField(fieldDef.key));
      try {
        if (off) setPlainSelection(visual, off.start, off.end);
      } catch {
        /* ignore */
      }
      const raw = block.querySelector('.raw-preview');
      if (raw) raw.textContent = getField(fieldDef.key);
    }, 280);
  });

  // Prevent rich paste
  visual.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  block.appendChild(visual);

  const raw = document.createElement('div');
  raw.className = 'raw-preview';
  raw.textContent = tagged;
  block.appendChild(raw);

  return block;
}

function filledKeys(group) {
  return keysForGroup(group).filter((f) => getField(f.key).trim() !== '');
}

function createStack(group, { forceSlots = null, allowAdd = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'stack';

  const defs = keysForGroup(group);
  const filled = defs.filter((f) => getField(f.key).trim() !== '');
  let show = filled;
  if (forceSlots != null) {
    show = defs.slice(0, Math.max(forceSlots, filled.length ? defs.indexOf(filled[filled.length - 1]) + 1 : 0));
  } else {
    // Show filled + one empty slot if room (for adding next line)
    if (allowAdd && filled.length < defs.length) {
      show = defs.slice(0, filled.length + 1);
    } else if (!filled.length && allowAdd) {
      show = defs.slice(0, 1);
    }
  }

  // Opening: always show at least lines until first empty for editing comfort — show all used + next
  show.forEach((def) => wrap.appendChild(createLineBlock(def)));

  if (allowAdd && show.length < defs.length && show.length === filled.length) {
    // no empty slot shown — add button
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'day-add';
    add.textContent = '+ Add line';
    add.addEventListener('click', () => {
      // reveal next by putting a space? Better: re-render with force
      const next = defs[show.length];
      if (next) {
        // leave empty but force visible via temporary marker — use zero-width? 
        // Just set a flag on state
        state.forceShow = state.forceShow || {};
        state.forceShow[next.key] = true;
        renderTree(true);
      }
    });
    // Instead of this, include next empty in show already above
  }

  return wrap;
}

function createStackSmart(group, maxVisibleExtra = 1) {
  const wrap = document.createElement('div');
  wrap.className = 'stack';
  const defs = keysForGroup(group);
  let lastFilled = -1;
  defs.forEach((d, i) => {
    if (getField(d.key).trim() !== '' || state.forceShow?.[d.key]) lastFilled = i;
  });
  const until = Math.min(defs.length - 1, Math.max(0, lastFilled) + maxVisibleExtra);
  // Always show at least first slot
  const count = Math.max(1, until + 1);
  for (let i = 0; i < count; i++) {
    wrap.appendChild(createLineBlock(defs[i]));
  }
  if (count < defs.length) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'day-add';
    add.style.alignSelf = 'flex-start';
    add.textContent = '+ Line';
    add.addEventListener('click', () => {
      state.forceShow = state.forceShow || {};
      state.forceShow[defs[count].key] = true;
      renderTree(true);
    });
    wrap.appendChild(add);
  }
  return wrap;
}

function hat(text, player = false) {
  const el = document.createElement('div');
  el.className = 'hat' + (player ? ' player' : '');
  el.textContent = text;
  return el;
}

function renderTree(keepScroll = false) {
  const scrollParent = els.treeRoot;
  const scrollTop = scrollParent.scrollTop;

  const tree = document.createElement('div');
  tree.className = 'tree';

  // Opening
  const openSec = document.createElement('section');
  openSec.className = 'stack';
  openSec.appendChild(hat('Opening lines'));
  openSec.appendChild(createStackSmart('open'));
  tree.appendChild(openSec);

  tree.appendChild(Object.assign(document.createElement('div'), { className: 'connector' }));

  // Choice 1
  const c1 = document.createElement('div');
  c1.className = 'branch-row';

  const bA = document.createElement('div');
  bA.className = 'branch';
  bA.appendChild(hat('Reply A', true));
  bA.appendChild(createLineBlock(keysForGroup('choice1')[0]));
  bA.appendChild(hat('NPC responds'));
  bA.appendChild(createStackSmart('r1'));
  c1.appendChild(bA);

  const bB = document.createElement('div');
  bB.className = 'branch';
  bB.appendChild(hat('Reply B', true));
  bB.appendChild(createLineBlock(keysForGroup('choice1')[1]));
  bB.appendChild(hat('NPC responds'));
  bB.appendChild(createStackSmart('r2'));
  c1.appendChild(bB);

  tree.appendChild(c1);

  const merge1 = document.createElement('div');
  merge1.className = 'merge-note';
  merge1.textContent = '▼ both paths meet for the next choice ▼';
  tree.appendChild(merge1);

  // Choice 2
  const c2 = document.createElement('div');
  c2.className = 'branch-row';

  const bC = document.createElement('div');
  bC.className = 'branch';
  bC.appendChild(hat('Reply C', true));
  bC.appendChild(createLineBlock(keysForGroup('choice2')[0]));
  bC.appendChild(hat('NPC responds'));
  bC.appendChild(createStackSmart('r3'));
  c2.appendChild(bC);

  const bD = document.createElement('div');
  bD.className = 'branch';
  bD.appendChild(hat('Reply D', true));
  bD.appendChild(createLineBlock(keysForGroup('choice2')[1]));
  bD.appendChild(hat('NPC responds'));
  bD.appendChild(createStackSmart('r4'));
  c2.appendChild(bD);

  tree.appendChild(c2);

  const merge2 = document.createElement('div');
  merge2.className = 'merge-note';
  merge2.textContent = '▼ final choice ▼';
  tree.appendChild(merge2);

  // Choice 3
  const c3 = document.createElement('div');
  c3.className = 'branch-row';

  const bE = document.createElement('div');
  bE.className = 'branch';
  bE.appendChild(hat('Reply E', true));
  bE.appendChild(createLineBlock(keysForGroup('choice3')[0]));
  bE.appendChild(hat('NPC responds'));
  bE.appendChild(createStackSmart('r5', 0));
  c3.appendChild(bE);

  const bF = document.createElement('div');
  bF.className = 'branch';
  bF.appendChild(hat('Reply F', true));
  bF.appendChild(createLineBlock(keysForGroup('choice3')[1]));
  bF.appendChild(hat('NPC responds'));
  bF.appendChild(createStackSmart('r6', 0));
  c3.appendChild(bF);

  tree.appendChild(c3);

  // Raw toggle footer
  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top:1.25rem;display:flex;gap:0.5rem;justify-content:center;';
  const rawToggle = document.createElement('button');
  rawToggle.type = 'button';
  rawToggle.className = 'btn ghost';
  rawToggle.textContent = state.showRaw ? 'Hide raw tags' : 'Show raw tags';
  rawToggle.addEventListener('click', () => {
    state.showRaw = !state.showRaw;
    renderTree(true);
  });
  footer.appendChild(rawToggle);
  tree.appendChild(footer);

  els.treeRoot.innerHTML = '';
  els.treeRoot.appendChild(tree);

  if (keepScroll) scrollParent.scrollTop = scrollTop;
}

function render() {
  renderDayBar();
  renderTree();
}

/* ---------- Import / Export ---------- */
function replaceDocument(days, message, { record = true } = {}) {
  if (record && state.historyReady) pushHistory();
  state.days = days.length ? days : [emptyDay()];
  state.dayIndex = 0;
  state.forceShow = {};
  if (record) state.future = [];
  render();
  updateHistoryButtons();
  toast(message);
}

async function loadSample(opts = {}) {
  try {
    const res = await fetch(SAMPLE_URL);
    const text = await res.text();
    const { days, warnings } = parseDialogueAsset(text);
    replaceDocument(days, `Loaded ${days.length} day(s)`, opts);
    if (warnings.length) console.warn(warnings);
  } catch (err) {
    console.error(err);
    toast('Could not load sample — use Import paste');
  }
}

function doImport() {
  const text = els.importText.value;
  const { days, warnings } = parseDialogueAsset(text);
  replaceDocument(days, `Imported ${days.length} day(s)`);
  els.importDialog.close();
  if (warnings.length) console.warn(warnings);
}

function sanitizeTrailingTags() {
  let cleaned = 0;
  for (const day of state.days) {
    for (const key of Object.keys(day.fields)) {
      const v = day.fields[key] ?? '';
      const next = stripTrailingTags(v);
      if (next !== v) {
        day.fields[key] = next;
        cleaned += 1;
      }
    }
  }
  return cleaned;
}

function openExport() {
  const cleaned = sanitizeTrailingTags();
  if (cleaned) {
    // already mutated in place — record once
    // (history was not pushed; optional — skip to avoid noise)
    renderTree(true);
    toast(`Removed ${cleaned} trailing tag(s) before export`);
  }
  els.exportText.value = serializeDialogueAsset(state.days);
  els.exportDialog.showModal();
}

async function copyExport() {
  const text = els.exportText.value || serializeDialogueAsset(state.days);
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    els.exportText.select();
    document.execCommand('copy');
    toast('Copied');
  }
}

/* ---------- Wire UI ---------- */
document.querySelectorAll('.stamp[data-effect]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.stamp.active').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    applyStamp(btn.dataset.effect);
    setTimeout(() => btn.classList.remove('active'), 300);
  });
});

document.getElementById('btn-custom-tag').addEventListener('click', () => {
  rememberSelectionFromActive();
  if (!state.activeField) {
    toast('Select a line first');
    return;
  }
  let raw = els.customInput.value.trim();
  if (!raw) {
    toast('Enter a tag value');
    return;
  }
  raw = raw.replace(/^<|>$/g, '');
  const key = state.activeField;
  const tagged = getField(key);
  const idx = state.activePlainRange.start;
  const result = insertTagAt(tagged, idx, raw);
  if (result.error) {
    toast(result.error);
    return;
  }
  mutate(() => setField(key, result.text));
  renderTree(true);
  toast(`Inserted <${raw}>`);
});

document.getElementById('btn-import').addEventListener('click', () => {
  els.importText.value = '';
  els.importDialog.showModal();
});
document.getElementById('btn-import-confirm').addEventListener('click', doImport);
document.getElementById('btn-load-sample').addEventListener('click', loadSample);
document.getElementById('btn-export').addEventListener('click', openExport);
document.getElementById('btn-copy-export').addEventListener('click', copyExport);
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);

document.addEventListener(
  'keydown',
  (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      undo();
      return;
    }
    if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      e.stopPropagation();
      redo();
      return;
    }
    if (!mod || !e.shiftKey) return;
    const map = { Digit1: 'slow', Digit2: 'superSlow', Digit3: 'shake', Digit4: 'strongShake' };
    if (map[e.code]) {
      e.preventDefault();
      applyStamp(map[e.code]);
    }
  },
  true
);

// Boot — history is live immediately so Undo works after the first edit
state.historyReady = true;
render();
updateHistoryButtons();
loadSample({ record: false }).finally(() => {
  state.history = [];
  state.future = [];
  updateHistoryButtons();
});
