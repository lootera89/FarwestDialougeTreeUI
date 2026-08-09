/**
 * Effect tags: <value>
 * - <= -1          → reset to default
 * - < 1 (decimals) → text speed (1 fastest; <0.2 = stoppage / no skip)
 * - 1..10          → regular shake (duration = value, intensity ~8)
 * - > 10           → strong shake (duration + intensity from value)
 *
 * Integers 1–10 are treated as shake (how scripts in the sample use them).
 * Decimals / values < 1 are text speed.
 */

export const EFFECT_PRESETS = {
  verySlow: { kind: 'speed', tag: '.1', label: 'Very slow', hint: '<.1> … <-1>  (no skip)' },
  slow: { kind: 'speed', tag: '.5', label: 'Slow', hint: '<.5> … <-1>  (skippable)' },
  shake: { kind: 'shake', tag: '3', label: 'Shake', hint: '<3> regular shake' },
  strongShake: { kind: 'strong', tag: '30', label: 'Strong shake', hint: '<30> strong shake' },
  reset: { kind: 'reset', tag: '-1', label: 'Reset', hint: '<-1> back to default' },
};

const TAG_RE = /<([^<>]+)>/g;

export function classifyEffect(raw) {
  const num = Number(raw);
  if (raw === '' || Number.isNaN(num)) return { kind: 'unknown', raw, value: null };
  if (num <= -1) return { kind: 'reset', raw, value: num };
  // Decimal or strictly < 1 → speed. Integer 1–10 → shake.
  const isInt = /^-?\d+$/.test(String(raw).trim());
  if (!isInt && num > 0 && num <= 1) {
    return { kind: num < 0.2 ? 'verySlow' : 'slow', raw, value: num };
  }
  if (num > 0 && num < 1) {
    return { kind: num < 0.2 ? 'verySlow' : 'slow', raw, value: num };
  }
  if (num >= 1 && num <= 10) return { kind: 'shake', raw, value: num };
  if (num > 10) return { kind: 'strong', raw, value: num };
  return { kind: 'unknown', raw, value: num };
}

/** Tokenize tagged dialogue into text + tag pieces. */
export function tokenize(tagged) {
  const tokens = [];
  let last = 0;
  TAG_RE.lastIndex = 0;
  let m;
  const str = tagged ?? '';
  while ((m = TAG_RE.exec(str)) !== null) {
    if (m.index > last) {
      tokens.push({ type: 'text', value: str.slice(last, m.index) });
    }
    tokens.push({ type: 'tag', raw: m[1], ...classifyEffect(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < str.length) tokens.push({ type: 'text', value: str.slice(last) });
  return tokens;
}

/**
 * Build visual segments for display (tags hidden).
 * Speed styles span until reset / next speed.
 * Shake styles span until next tag or end (visual only).
 */
export function buildVisualSegments(tagged) {
  const tokens = tokenize(tagged);
  const segments = [];
  let speedKind = null; // 'verySlow' | 'slow' | null
  let shakeKind = null; // 'shake' | 'strong' | null

  for (const tok of tokens) {
    if (tok.type === 'tag') {
      if (tok.kind === 'reset') {
        speedKind = null;
        shakeKind = null;
      } else if (tok.kind === 'verySlow' || tok.kind === 'slow') {
        speedKind = tok.kind;
        shakeKind = null;
      } else if (tok.kind === 'shake' || tok.kind === 'strong') {
        shakeKind = tok.kind;
        // shake does not clear speed in engine necessarily, but visually prefer shake color
      }
      continue;
    }
    if (!tok.value) continue;
    const kind = shakeKind || speedKind || 'plain';
    const prev = segments[segments.length - 1];
    if (prev && prev.kind === kind) prev.text += tok.value;
    else segments.push({ text: tok.value, kind });
  }
  if (!segments.length) segments.push({ text: '', kind: 'plain' });
  return segments;
}

/** Plain visible text (tags stripped). */
export function stripTags(tagged) {
  return (tagged ?? '').replace(TAG_RE, '');
}

/**
 * Map a plain-text index (visible chars only) → index in tagged string
 * at the corresponding insertion point (after any tags that precede that char).
 */
export function plainIndexToTaggedIndex(tagged, plainIndex) {
  const str = tagged ?? '';
  let plain = 0;
  let i = 0;
  while (i < str.length && plain < plainIndex) {
    if (str[i] === '<') {
      const end = str.indexOf('>', i);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    plain += 1;
    i += 1;
  }
  return i;
}

/** Selection range in plain text → tagged indices [start, end]. */
export function plainRangeToTaggedRange(tagged, plainStart, plainEnd) {
  return {
    start: plainIndexToTaggedIndex(tagged, plainStart),
    end: plainIndexToTaggedIndex(tagged, plainEnd),
  };
}

/**
 * Apply an effect preset to a plain-text selection within tagged string.
 * Speed presets wrap selection: <tag>selection<-1>
 * Shake presets insert tag at selection start.
 * Reset inserts <-1> at selection start.
 */
export function applyEffectToSelection(tagged, plainStart, plainEnd, presetKey) {
  const preset = EFFECT_PRESETS[presetKey];
  if (!preset && presetKey !== 'clear') return tagged;

  let text = tagged ?? '';
  const { start, end } = plainRangeToTaggedRange(text, plainStart, plainEnd);

  // Remove existing tags that sit inside the selection so re-applying doesn't stack.
  if (end > start && (presetKey === 'clear' || preset?.kind === 'speed')) {
    const inner = text.slice(start, end);
    const cleaned = inner.replace(TAG_RE, '');
    text = text.slice(0, start) + cleaned + text.slice(end);
  }

  // Recompute after clean
  const range = plainRangeToTaggedRange(text, plainStart, plainEnd);
  const s = range.start;
  const e = range.end;

  if (presetKey === 'clear') {
    return text;
  }

  if (preset.kind === 'speed') {
    if (plainEnd <= plainStart) {
      // caret only: insert speed tag at caret
      return text.slice(0, s) + `<${preset.tag}>` + text.slice(s);
    }
    const wrapped = `<${preset.tag}>` + text.slice(s, e) + `<-1>`;
    return text.slice(0, s) + wrapped + text.slice(e);
  }

  if (preset.kind === 'shake' || preset.kind === 'strong') {
    // Insert before selection; if empty selection, at caret
    return text.slice(0, s) + `<${preset.tag}>` + text.slice(s);
  }

  if (preset.kind === 'reset') {
    return text.slice(0, s) + `<-1>` + text.slice(s);
  }

  return text;
}

/** Insert raw tag string at plain caret index. */
export function insertTagAt(tagged, plainIndex, tagInner) {
  const i = plainIndexToTaggedIndex(tagged ?? '', plainIndex);
  return (tagged ?? '').slice(0, i) + `<${tagInner}>` + (tagged ?? '').slice(i);
}

export function effectClassName(kind) {
  switch (kind) {
    case 'verySlow':
      return 'fx-very-slow';
    case 'slow':
      return 'fx-slow';
    case 'shake':
      return 'fx-shake';
    case 'strong':
      return 'fx-strong';
    default:
      return 'fx-plain';
  }
}
