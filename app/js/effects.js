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
 * Map a plain-text index (visible chars only) → index in tagged string.
 * @param {'start'|'end'} edge
 *   - start/caret: skip tags so the index sits on the target character
 *   - end (exclusive): sit just after the last included character (before following tags)
 */
export function plainIndexToTaggedIndex(tagged, plainIndex, edge = 'start') {
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
  if (edge === 'start') {
    while (i < str.length && str[i] === '<') {
      const end = str.indexOf('>', i);
      if (end === -1) break;
      i = end + 1;
    }
  }
  return i;
}

/** Selection range in plain text → tagged indices [start, end]. */
export function plainRangeToTaggedRange(tagged, plainStart, plainEnd) {
  return {
    start: plainIndexToTaggedIndex(tagged, plainStart, 'start'),
    end: plainIndexToTaggedIndex(tagged, plainEnd, 'end'),
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
  let { start, end } = plainRangeToTaggedRange(text, plainStart, plainEnd);

  // Absorb adjacent tags so re-applying speed/clear stays idempotent
  if (end >= start && (presetKey === 'clear' || preset?.kind === 'speed')) {
    while (start > 0 && text[start - 1] === '>') {
      const open = text.lastIndexOf('<', start - 1);
      if (open === -1) break;
      start = open;
    }
    while (end < text.length && text[end] === '<') {
      const close = text.indexOf('>', end);
      if (close === -1) break;
      end = close + 1;
    }
    const cleaned = text.slice(start, end).replace(TAG_RE, '');
    text = text.slice(0, start) + cleaned + text.slice(end);
    // Re-map against cleaned string
    ({ start, end } = plainRangeToTaggedRange(text, plainStart, plainEnd));
  }

  if (presetKey === 'clear') {
    return text;
  }

  if (preset.kind === 'speed') {
    if (plainEnd <= plainStart) {
      return text.slice(0, start) + `<${preset.tag}>` + text.slice(start);
    }
    const wrapped = `<${preset.tag}>` + text.slice(start, end) + `<-1>`;
    return text.slice(0, start) + wrapped + text.slice(end);
  }

  if (preset.kind === 'shake' || preset.kind === 'strong') {
    return text.slice(0, start) + `<${preset.tag}>` + text.slice(start);
  }

  if (preset.kind === 'reset') {
    return text.slice(0, start) + `<-1>` + text.slice(start);
  }

  return text;
}

/** Insert raw tag string at plain caret index. */
export function insertTagAt(tagged, plainIndex, tagInner) {
  const i = plainIndexToTaggedIndex(tagged ?? '', plainIndex, 'start');
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
