import { FIELD_DEFS, keysForGroup, emptyDay } from './schema.js';
import { parseDialogueAsset, serializeDialogueAsset } from './parser.js';
import {
  EFFECT_PRESETS,
  applyEffectToSelection,
  buildVisualSegments,
  classifyEffect,
  effectClassName,
  insertTagAt,
  stripTags,
  stripTrailingTags,
} from './effects.js';

const STORAGE_KEY = 'farwest-dialogue-characters-v1';

function uid() {
  return crypto.randomUUID?.() || `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeCharacter(name, days = [emptyDay()]) {
  return {
    id: uid(),
    name: (name || 'Character').trim() || 'Character',
    days: days.length ? days : [emptyDay()],
    dayIndex: 0,
  };
}

function cloneCharacters(chars) {
  return chars.map((c) => ({
    id: c.id,
    name: c.name,
    dayIndex: c.dayIndex ?? 0,
    days: c.days.map((d) => ({ fields: { ...d.fields } })),
  }));
}

const state = {
  characters: [],
  characterIndex: 0,
  activeField: null,
  activePlainRange: { start: 0, end: 0 },
  stamp: null,
  showRaw: false,
  editMode: 'visual',
  history: [],
  future: [],
  historyReady: false,
  forceShow: {},
  pendingFiles: [], // { name, text } queued in import dialog
};

const HISTORY_LIMIT = 80;

function currentCharacter() {
  return state.characters[state.characterIndex] || null;
}

function currentDays() {
  return currentCharacter()?.days || [];
}

function getDayIndex() {
  return currentCharacter()?.dayIndex ?? 0;
}

function setDayIndex(i) {
  const ch = currentCharacter();
  if (ch) ch.dayIndex = i;
}

function snapshotNow() {
  return {
    characters: cloneCharacters(state.characters),
    characterIndex: state.characterIndex,
  };
}

function pushHistory() {
  if (!state.historyReady) return;
  state.history.push(snapshotNow());
  if (state.history.length > HISTORY_LIMIT) state.history.shift();
  state.future = [];
  updateHistoryButtons();
  persist();
}

function restoreSnapshot(snap) {
  state.characters = cloneCharacters(snap.characters);
  state.characterIndex = Math.min(snap.characterIndex, Math.max(0, state.characters.length - 1));
  state.activeField = null;
  state.forceShow = {};
  render();
  updateHistoryButtons();
  persist();
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

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        characters: state.characters,
        characterIndex: state.characterIndex,
      })
    );
  } catch {
    /* ignore quota */
  }
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.characters) || !data.characters.length) return false;
    state.characters = data.characters.map((c) => ({
      id: c.id || uid(),
      name: c.name || 'Character',
      dayIndex: c.dayIndex ?? 0,
      days: (c.days?.length ? c.days : [emptyDay()]).map((d) => ({
        fields: { ...(d.fields || {}) },
      })),
    }));
    state.characterIndex = Math.min(data.characterIndex ?? 0, state.characters.length - 1);
    return true;
  } catch {
    return false;
  }
}

const els = {
  dayBar: document.getElementById('day-bar'),
  charBar: document.getElementById('char-bar'),
  treeRoot: document.getElementById('tree-root'),
  importDialog: document.getElementById('import-dialog'),
  exportDialog: document.getElementById('export-dialog'),
  importText: document.getElementById('import-text'),
  importName: document.getElementById('import-name'),
  importFiles: document.getElementById('import-files'),
  importFileList: document.getElementById('import-file-list'),
  dropZone: document.getElementById('drop-zone'),
  exportText: document.getElementById('export-text'),
  exportCharLabel: document.getElementById('export-char-label'),
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
  }, 2400);
}

function currentDay() {
  const days = currentDays();
  return days[getDayIndex()] || null;
}

function setField(key, value) {
  const day = currentDay();
  if (!day) return;
  day.fields[key] = value;
  persist();
}

function mutate(fn) {
  pushHistory();
  fn();
  persist();
}

function getField(key) {
  return currentDay()?.fields[key] ?? '';
}

/* ---------- Character + day bars ---------- */
function renderCharBar() {
  els.charBar.innerHTML = '';

  if (!state.characters.length) {
    els.charBar.hidden = true;
    return;
  }
  els.charBar.hidden = false;

  const label = document.createElement('span');
  label.className = 'char-bar-label';
  label.textContent = 'Characters';
  els.charBar.appendChild(label);

  state.characters.forEach((ch, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'char-tab' + (i === state.characterIndex ? ' active' : '');
    btn.textContent = ch.name;
    btn.title = `${ch.days.length} day(s)`;
    btn.addEventListener('click', () => {
      state.characterIndex = i;
      state.activeField = null;
      state.forceShow = {};
      render();
      persist();
    });
    els.charBar.appendChild(btn);
  });

  const rename = document.createElement('button');
  rename.type = 'button';
  rename.className = 'day-add';
  rename.textContent = 'Rename';
  rename.addEventListener('click', () => {
    const ch = currentCharacter();
    if (!ch) return;
    const next = prompt('Character name', ch.name);
    if (!next || !next.trim()) return;
    mutate(() => {
      ch.name = next.trim();
    });
    render();
  });
  els.charBar.appendChild(rename);

  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'day-remove';
  rm.textContent = 'Remove';
  rm.addEventListener('click', () => {
    const ch = currentCharacter();
    if (!ch) return;
    if (!confirm(`Remove ${ch.name}?`)) return;
    mutate(() => {
      state.characters.splice(state.characterIndex, 1);
      state.characterIndex = Math.max(0, state.characterIndex - 1);
    });
    render();
  });
  els.charBar.appendChild(rm);

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'day-add';
  add.textContent = '+ Import';
  add.addEventListener('click', openImport);
  els.charBar.appendChild(add);
}

function renderDayBar() {
  els.dayBar.innerHTML = '';
  const days = currentDays();
  if (!currentCharacter()) {
    els.dayBar.hidden = true;
    return;
  }
  els.dayBar.hidden = false;

  days.forEach((_, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day-tab' + (i === getDayIndex() ? ' active' : '');
    btn.textContent = `Day ${i + 1}`;
    btn.addEventListener('click', () => {
      setDayIndex(i);
      state.activeField = null;
      render();
      persist();
    });
    els.dayBar.appendChild(btn);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'day-add';
  add.textContent = '+ Day';
  add.addEventListener('click', () => {
    mutate(() => {
      currentDays().push(emptyDay());
      setDayIndex(currentDays().length - 1);
    });
    render();
  });
  els.dayBar.appendChild(add);

  if (days.length > 1) {
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'day-remove';
    rm.textContent = 'Remove day';
    rm.addEventListener('click', () => {
      mutate(() => {
        currentDays().splice(getDayIndex(), 1);
        setDayIndex(Math.max(0, getDayIndex() - 1));
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
function balloonChipClass(raw) {
  const kind = classifyEffect(raw).kind;
  switch (kind) {
    case 'slow':
      return 'fx-chip fx-chip-slow';
    case 'superSlow':
      return 'fx-chip fx-chip-super-slow';
    case 'shake':
      return 'fx-chip fx-chip-shake';
    case 'strong':
      return 'fx-chip fx-chip-strong';
    case 'reset':
      return 'fx-chip fx-chip-reset';
    default:
      return 'fx-chip fx-chip-unknown';
  }
}

function renderBalloon(commentTags) {
  if (!commentTags.length) return '';
  const label = escapeHtml(commentTags.join(' · '));
  const parts = commentTags
    .map((raw, i) => {
      const chip = `<span class="${balloonChipClass(raw)}">${escapeHtml(raw)}</span>`;
      if (i === 0) return chip;
      return `<span class="fx-chip-dot">·</span>${chip}`;
    })
    .join('');
  return `<span class="fx-balloon" contenteditable="false" data-balloon="${label}">${parts}</span>`;
}

function renderVisualHTML(tagged) {
  const segs = buildVisualSegments(tagged);
  return segs
    .map((s) => {
      const tags = (s.tags || []).filter(Boolean);
      // Don't litter balloons with lone resets; still show them if stacked with others
      const commentTags =
        tags.length === 1 && tags[0] === '-1' ? [] : tags;
      const balloon = renderBalloon(commentTags);

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
  if (!currentCharacter()) {
    toast('Import a character first');
    return;
  }
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

  if (!currentCharacter()) {
    els.treeRoot.innerHTML = `
      <div class="empty-state">
        <h2>No characters yet</h2>
        <p>Import your Unreal dialogue data assets to start editing.</p>
        <button type="button" class="btn primary" id="btn-empty-import">Import DAs</button>
        <p class="empty-hint">Tip: copy each DA’s dialogue array into a <code>.txt</code> named like <code>Child.txt</code>, <code>Girl.txt</code>, then drop them all at once.</p>
      </div>`;
    document.getElementById('btn-empty-import')?.addEventListener('click', openImport);
    return;
  }

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
  renderCharBar();
  renderDayBar();
  renderTree();
}

/* ---------- Import / Export ---------- */
function looksLikeBinary(text) {
  if (!text) return true;
  let nuls = 0;
  const sample = text.slice(0, 8000);
  for (let i = 0; i < sample.length; i++) if (sample.charCodeAt(i) === 0) nuls += 1;
  return nuls > 5;
}

function looksLikeDialoguePaste(text) {
  const t = text.trim();
  return /\(\s*\(/.test(t) || /Line1_\d+_/.test(t) || /Reply1_\d+_/.test(t);
}

function characterNameFromFile(filename) {
  const base = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  return base.replace(/[_-]+/g, ' ').replace(/\s+DA$/i, '').trim() || 'Character';
}

function upsertCharacter(name, days, { select = true } = {}) {
  const existing = state.characters.findIndex(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
  if (existing >= 0) {
    state.characters[existing].days = days;
    state.characters[existing].dayIndex = 0;
    if (select) state.characterIndex = existing;
  } else {
    state.characters.push(makeCharacter(name, days));
    if (select) state.characterIndex = state.characters.length - 1;
  }
}

function importParsedCharacters(entries) {
  // entries: [{ name, text }]
  const imported = [];
  const errors = [];
  for (const entry of entries) {
    const name = (entry.name || 'Character').trim();
    const text = entry.text || '';
    if (looksLikeBinary(text) || /\.uasset$/i.test(entry.filename || '')) {
      errors.push(
        `${name}: can’t read binary .uasset — copy the dialogue array to a .txt first`
      );
      continue;
    }
    if (!looksLikeDialoguePaste(text)) {
      errors.push(`${name}: not a dialogue array paste`);
      continue;
    }
    const { days, warnings } = parseDialogueAsset(text);
    if (!days.length) {
      errors.push(`${name}: no days found`);
      continue;
    }
    upsertCharacter(name, days, { select: false });
    imported.push(`${name} (${days.length}d)`);
    if (warnings?.length) console.warn(name, warnings);
  }
  if (imported.length) {
    // select last imported
    const lastName = entries.filter((e) => imported.some((i) => i.startsWith(e.name))).at(-1)?.name;
    const idx = state.characters.findIndex(
      (c) => c.name.toLowerCase() === (lastName || '').toLowerCase()
    );
    if (idx >= 0) state.characterIndex = idx;
    else state.characterIndex = state.characters.length - 1;
  }
  return { imported, errors };
}

function openImport() {
  state.pendingFiles = [];
  els.importText.value = '';
  if (els.importName) els.importName.value = '';
  renderPendingFiles();
  els.importDialog.showModal();
}

function renderPendingFiles() {
  if (!els.importFileList) return;
  if (!state.pendingFiles.length) {
    els.importFileList.hidden = true;
    els.importFileList.innerHTML = '';
    return;
  }
  els.importFileList.hidden = false;
  els.importFileList.innerHTML = state.pendingFiles
    .map(
      (f, i) =>
        `<div class="import-file-row"><strong>${escapeHtml(f.name)}</strong><span>${f.text.length.toLocaleString()} chars</span><button type="button" data-i="${i}" class="icon-btn" title="Remove">×</button></div>`
    )
    .join('');
  els.importFileList.querySelectorAll('button[data-i]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.pendingFiles.splice(Number(btn.dataset.i), 1);
      renderPendingFiles();
    });
  });
}

async function readDroppedFiles(fileList) {
  const files = [...fileList];
  for (const file of files) {
    if (/\.uasset$/i.test(file.name)) {
      toast(`${file.name}: drop a .txt paste, not the .uasset`);
      continue;
    }
    const text = await file.text();
    state.pendingFiles.push({
      name: characterNameFromFile(file.name),
      filename: file.name,
      text,
    });
  }
  renderPendingFiles();
}

function doImport() {
  const entries = [...state.pendingFiles];
  const paste = els.importText.value.trim();
  const pasteName = (els.importName?.value || '').trim();
  if (paste) {
    if (!pasteName && !entries.length) {
      toast('Enter a character name for the paste');
      return;
    }
    entries.push({
      name: pasteName || 'Character',
      text: paste,
    });
  }
  if (!entries.length) {
    toast('Add .txt files or a paste first');
    return;
  }

  pushHistory();
  const { imported, errors } = importParsedCharacters(entries);
  state.forceShow = {};
  state.pendingFiles = [];
  els.importDialog.close();
  render();
  persist();
  updateHistoryButtons();

  if (imported.length) toast(`Imported ${imported.join(', ')}`);
  if (errors.length) {
    console.warn(errors);
    setTimeout(() => toast(errors[0]), 500);
  }
}

function sanitizeTrailingTags() {
  let cleaned = 0;
  for (const ch of state.characters) {
    for (const day of ch.days) {
      for (const key of Object.keys(day.fields)) {
        const v = day.fields[key] ?? '';
        const next = stripTrailingTags(v);
        if (next !== v) {
          day.fields[key] = next;
          cleaned += 1;
        }
      }
    }
  }
  return cleaned;
}

function openExport() {
  if (!currentCharacter()) {
    toast('Import a character first');
    return;
  }
  const cleaned = sanitizeTrailingTags();
  if (cleaned) {
    renderTree(true);
    toast(`Removed ${cleaned} trailing tag(s) before export`);
    persist();
  }
  const ch = currentCharacter();
  els.exportCharLabel.textContent = `Character: ${ch.name}`;
  els.exportText.value = serializeDialogueAsset(ch.days);
  els.exportDialog.showModal();
}

async function copyExport() {
  const ch = currentCharacter();
  const text = els.exportText.value || (ch ? serializeDialogueAsset(ch.days) : '');
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${ch?.name || ''} to clipboard`);
  } catch {
    els.exportText.select();
    document.execCommand('copy');
    toast('Copied');
  }
}

function downloadExport() {
  const ch = currentCharacter();
  if (!ch) return;
  const text = els.exportText.value || serializeDialogueAsset(ch.days);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${ch.name}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`Downloaded ${ch.name}.txt`);
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

document.getElementById('btn-import').addEventListener('click', openImport);
document.getElementById('btn-import-confirm').addEventListener('click', doImport);
document.getElementById('btn-export').addEventListener('click', openExport);
document.getElementById('btn-copy-export').addEventListener('click', copyExport);
document.getElementById('btn-download-export')?.addEventListener('click', downloadExport);
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);

els.dropZone?.addEventListener('click', () => els.importFiles?.click());
els.importFiles?.addEventListener('change', async (e) => {
  await readDroppedFiles(e.target.files);
  e.target.value = '';
});
['dragenter', 'dragover'].forEach((ev) => {
  els.dropZone?.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropZone.classList.add('drag');
  });
});
els.dropZone?.addEventListener('dragleave', () => els.dropZone.classList.remove('drag'));
els.dropZone?.addEventListener('drop', async (e) => {
  e.preventDefault();
  els.dropZone.classList.remove('drag');
  await readDroppedFiles(e.dataTransfer.files);
});

// Also allow dropping files onto the whole app when empty / anytime
window.addEventListener('dragover', (e) => {
  if ([...e.dataTransfer.types].includes('Files')) e.preventDefault();
});
window.addEventListener('drop', async (e) => {
  if (![...e.dataTransfer.types].includes('Files')) return;
  // Ignore drops that hit the dialog zone handler already
  if (e.target.closest?.('#drop-zone')) return;
  e.preventDefault();
  const files = e.dataTransfer.files;
  if (!files?.length) return;
  openImport();
  await readDroppedFiles(files);
});

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

// Boot
state.historyReady = true;
if (!loadPersisted()) {
  state.characters = [];
  state.characterIndex = 0;
}
render();
updateHistoryButtons();
state.history = [];
state.future = [];
updateHistoryButtons();
