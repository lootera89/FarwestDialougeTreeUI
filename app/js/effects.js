/**
 * Effect tags: <value>
 *
 * Speed tag = delay timer between letters (higher = slower).
 * Default engine speed is <.1>.
 * - 0 < value < 0.2  → Slow (still fast, fast-forwardable)
 * - 0.2 ≤ value < 1  → Super slow
 * - <= -1            → reset to default
 * - integer 1..10    → regular shake (duration)
 * - > 10             → strong shake
 *
 * Integers 1–10 are shake; decimals / values < 1 are text speed.
 */

export const EFFECT_PRESETS = {
  slow: {
    kind: 'speed',
    tag: '.15',
    label: 'Slow',
    hint: '<.15> … <-1>  (under .2, skippable)',
  },
  superSlow: {
    kind: 'speed',
    tag: '.5',
    label: 'Super slow',
    hint: '<.5> … <-1>  (.2–.99 delay)',
  },
  shake: { kind: 'shake', tag: '3', label: 'Shake', hint: '<3> regular shake' },
  strongShake: { kind: 'strong', tag: '30', label: 'Strong shake', hint: '<30> strong shake' },
  reset: { kind: 'reset', tag: '-1', label: 'Reset', hint: '<-1> back to default (.1)' },
};

const TAG_RE = /<([^<>]+)>/g;
const TRAILING_TAGS_RE = /(?:<[^<>]+>)+\s*$/;

export function classifyEffect(raw) {
  const num = Number(raw);
  if (raw === '' || Number.isNaN(num)) return { kind: 'unknown', raw, value: null };
  if (num <= -1) return { kind: 'reset', raw, value: num };
  const isInt = /^-?\d+$/.test(String(raw).trim());
  // Speed: non-integers, or any value strictly between 0 and 1
  if ((!isInt && num > 0 && num < 1) || (num > 0 && num < 1)) {
    // < .2 = slow (ffwdable); .2–.99 = super slow
    return { kind: num < 0.2 ? 'slow' : 'superSlow', raw, value: num };
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

/** True if the string ends with one or more tags and no following letters. */
export function hasTrailingTags(tagged) {
  return TRAILING_TAGS_RE.test(tagged ?? '');
}

/** Remove tags that sit after the last visible character. */
export function stripTrailingTags(tagged) {
  return (tagged ?? '').replace(TRAILING_TAGS_RE, '');
}

/**
 * Build visual segments for display (tags hidden from the letter stream).
 * Consecutive tags (only whitespace between) form one cluster — the following
 * text run carries EVERY tag in that cluster for the overhead comic comment
 * (including <-1> resets). Highlight uses the last non-reset effect in the
 * cluster so tags that are immediately reset still leave a visible mark.
 * Trailing orphan tags become a zero-width orphan marker.
 */
export function buildVisualSegments(tagged) {
  const tokens = tokenize(tagged);
  const segments = [];

  let speedKind = null;
  let shakeKind = null;
  let tagCluster = []; // raw values awaiting following text
  let heldWs = '';

  function applyTagEffects(tags) {
    for (const raw of tags) {
      const info = classifyEffect(raw);
      if (info.kind === 'reset') {
        speedKind = null;
        shakeKind = null;
      } else if (info.kind === 'slow' || info.kind === 'superSlow') {
        speedKind = info.kind;
        shakeKind = null;
      } else if (info.kind === 'shake' || info.kind === 'strong') {
        shakeKind = info.kind;
      }
    }
  }

  /** Last speed/shake in a cluster (ignores resets) — for highlight visibility. */
  function peakVisualKind(tags) {
    let peak = null;
    for (const raw of tags) {
      const info = classifyEffect(raw);
      if (info.kind === 'reset') continue;
      if (
        info.kind === 'slow' ||
        info.kind === 'superSlow' ||
        info.kind === 'shake' ||
        info.kind === 'strong'
      ) {
        peak = info.kind;
      }
    }
    return peak;
  }

  /** Non-reset tags keep source order; resets always sit on the right. */
  function pinResetsRight(tags) {
    const main = [];
    const resets = [];
    for (const raw of tags) {
      if (classifyEffect(raw).kind === 'reset') resets.push(raw);
      else main.push(raw);
    }
    return main.concat(resets);
  }

  function pushText(text, commentTags) {
    if (!text && !(commentTags && commentTags.length)) return;
    const tags = commentTags && commentTags.length ? commentTags.slice() : [];
    const kind = shakeKind || speedKind || 'plain';
    const prev = segments[segments.length - 1];
    // Never merge a tagged run into a neighbor — every tag cluster stays its own spot
    const same =
      prev &&
      !tags.length &&
      !(prev.tags && prev.tags.length) &&
      prev.kind === kind &&
      prev.kind !== 'orphan';
    if (same && text) {
      prev.text += text;
      return;
    }
    segments.push({
      text: text || '',
      kind: text ? kind : 'plain',
      tags,
      raw: tags.length ? tags.join(' ') : null,
      value: tags.length ? Number(tags[tags.length - 1]) : null,
    });
  }

  /** Append immediate trailing <-1> tags onto the last tagged segment (right side). */
  function absorbTrailingResets(fromIndex) {
    let i = fromIndex;
    while (i < tokens.length && tokens[i].type === 'tag') {
      const raw = tokens[i].raw;
      if (classifyEffect(raw).kind !== 'reset') break;
      const host = [...segments].reverse().find((s) => s.tags && s.tags.length);
      if (host) {
        host.tags = pinResetsRight([...host.tags, raw]);
        host.raw = host.tags.join(' ');
        host.value = Number(raw);
      } else {
        tagCluster.push(raw);
        break;
      }
      applyTagEffects([raw]);
      i += 1;
    }
    return i;
  }

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.type === 'tag') {
      tagCluster.push(tok.raw);
      i += 1;
      continue;
    }
    if (!tok.value) {
      i += 1;
      continue;
    }

    const onlyWs = /^\s*$/.test(tok.value);
    if (onlyWs && tagCluster.length) {
      heldWs += tok.value;
      i += 1;
      continue;
    }

    if (tagCluster.length) {
      const comments = tagCluster.slice();
      const peak = peakVisualKind(comments);
      const endsReset =
        comments.length > 0 &&
        classifyEffect(comments[comments.length - 1]).kind === 'reset';

      applyTagEffects(comments);
      tagCluster = [];
      const text = heldWs + tok.value;
      heldWs = '';
      i += 1;

      if (endsReset && peak && text.length) {
        const first = text.search(/\S/);
        const markAt = first === -1 ? 0 : first;
        if (markAt > 0) {
          // Leading whitespace must stay plain — applyTagEffects already ran
          const savedSpeed = speedKind;
          const savedShake = shakeKind;
          speedKind = null;
          shakeKind = null;
          pushText(text.slice(0, markAt), []);
          speedKind = savedSpeed;
          shakeKind = savedShake;
        }
        segments.push({
          text: text[markAt],
          kind: peak,
          tags: pinResetsRight(comments.slice()),
          raw: pinResetsRight(comments).join(' '),
          value: Number(comments[comments.length - 1]),
        });
        if (markAt + 1 < text.length) pushText(text.slice(markAt + 1), []);
      } else {
        // Keep inter-tag whitespace outside the balloon host so chips sit on the letter
        const first = text.search(/\S/);
        if (first > 0) {
          const savedSpeed = speedKind;
          const savedShake = shakeKind;
          speedKind = null;
          shakeKind = null;
          pushText(text.slice(0, first), []);
          speedKind = savedSpeed;
          shakeKind = savedShake;
          pushText(text.slice(first), pinResetsRight(comments));
        } else {
          pushText(text, pinResetsRight(comments));
        }
      }

      // Pull following <-1> onto this balloon's right side (avoid overlapping balloons)
      i = absorbTrailingResets(i);
      continue;
    }

    if (heldWs) {
      pushText(heldWs, []);
      heldWs = '';
    }
    pushText(tok.value, []);
    i += 1;
  }

  if (tagCluster.length && heldWs) {
    const comments = tagCluster.slice();
    tagCluster = [];
    applyTagEffects(comments);
    pushText(heldWs, comments);
    heldWs = '';
  } else if (heldWs) {
    pushText(heldWs, []);
  }

  if (tagCluster.length) {
    applyTagEffects(tagCluster);
    segments.push({
      text: '',
      kind: 'orphan',
      tags: tagCluster.slice(),
      raw: tagCluster.join(' '),
      label: tagCluster.map((r) => `<${r}>`).join(''),
      value: null,
    });
  }

  if (!segments.length) segments.push({ text: '', kind: 'plain', tags: [], raw: null, value: null });
  return segments;
}

/** Plain visible text (tags stripped). */
export function stripTags(tagged) {
  return (tagged ?? '').replace(TAG_RE, '');
}

/**
 * Map a plain-text index (visible chars only) → index in tagged string.
 * @param {'start'|'end'} edge
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

export function plainRangeToTaggedRange(tagged, plainStart, plainEnd) {
  return {
    start: plainIndexToTaggedIndex(tagged, plainStart, 'start'),
    end: plainIndexToTaggedIndex(tagged, plainEnd, 'end'),
  };
}

/**
 * @returns {{ text: string, error?: string, cleanedTrailing?: boolean }}
 */
export function applyEffectToSelection(tagged, plainStart, plainEnd, presetKey) {
  const preset = EFFECT_PRESETS[presetKey];
  if (!preset && presetKey !== 'clear') return { text: tagged ?? '' };

  let text = tagged ?? '';
  const plainLen = stripTags(text).length;

  // Speed / shake need real text after the tag — block caret-at-end stamps
  if (presetKey !== 'clear' && presetKey !== 'reset') {
    if (plainEnd <= plainStart) {
      if (plainStart >= plainLen) {
        return { text, error: 'Select some text first — tags at the end do nothing' };
      }
      // caret in middle: shake/reset ok; speed still wants a range
      if (preset?.kind === 'speed') {
        return { text, error: 'Select the letters that should run slow' };
      }
    }
  }

  let { start, end } = plainRangeToTaggedRange(text, plainStart, plainEnd);

  // When re-stamping speed, only strip speed/reset tags so shake tags can stack.
  // Clear strips everything in range.
  if (end >= start && (presetKey === 'clear' || preset?.kind === 'speed')) {
    const shouldStrip = (raw) => {
      if (presetKey === 'clear') return true;
      const k = classifyEffect(raw).kind;
      return k === 'slow' || k === 'superSlow' || k === 'reset';
    };

    // Expand over adjacent tags of the kinds we strip
    while (start > 0 && text[start - 1] === '>') {
      const open = text.lastIndexOf('<', start - 1);
      if (open === -1) break;
      const raw = text.slice(open + 1, start - 1);
      if (!shouldStrip(raw)) break;
      start = open;
    }
    while (end < text.length && text[end] === '<') {
      const close = text.indexOf('>', end);
      if (close === -1) break;
      const raw = text.slice(end + 1, close);
      if (!shouldStrip(raw)) break;
      end = close + 1;
    }

    const cleaned = text.slice(start, end).replace(TAG_RE, (full, raw) => (shouldStrip(raw) ? '' : full));
    text = text.slice(0, start) + cleaned + text.slice(end);
    ({ start, end } = plainRangeToTaggedRange(text, plainStart, plainEnd));
  }

  if (presetKey === 'clear') {
    const next = stripTrailingTags(text);
    return { text: next, cleanedTrailing: next !== text };
  }

  if (preset.kind === 'speed') {
    const needsReset = stripTags(text.slice(end)).length > 0;
    const wrapped =
      `<${preset.tag}>` + text.slice(start, end) + (needsReset ? `<-1>` : '');
    text = text.slice(0, start) + wrapped + text.slice(end);
  } else if (preset.kind === 'shake' || preset.kind === 'strong') {
    // Insert in front of selection; keep any existing tags so stacks show in the balloon
    text = text.slice(0, start) + `<${preset.tag}>` + text.slice(start);
  } else if (preset.kind === 'reset') {
    if (stripTags(text.slice(start)).length === 0) {
      return { text, error: 'Reset at the end does nothing' };
    }
    text = text.slice(0, start) + `<-1>` + text.slice(start);
  }

  const stripped = stripTrailingTags(text);
  return {
    text: stripped,
    cleanedTrailing: stripped !== text,
  };
}

/** Insert raw tag at plain caret — refused at end of line (orphan). */
export function insertTagAt(tagged, plainIndex, tagInner) {
  const plain = stripTags(tagged ?? '');
  if (plainIndex >= plain.length) {
    return { text: tagged ?? '', error: 'Won’t add a tag at the end — nothing after it would play' };
  }
  const i = plainIndexToTaggedIndex(tagged ?? '', plainIndex, 'start');
  const text = (tagged ?? '').slice(0, i) + `<${tagInner}>` + (tagged ?? '').slice(i);
  const stripped = stripTrailingTags(text);
  return { text: stripped, cleanedTrailing: stripped !== text };
}

export function effectClassName(kind) {
  switch (kind) {
    case 'superSlow':
      return 'fx-super-slow';
    case 'slow':
      return 'fx-slow';
    case 'shake':
      return 'fx-shake';
    case 'strong':
      return 'fx-strong';
    case 'orphan':
      return 'fx-orphan';
    default:
      return 'fx-plain';
  }
}

/** Format tag raw for a tiny badge, e.g. ".5" or "30". */
export function formatBadge(raw) {
  if (raw == null || raw === '') return '';
  return String(raw);
}
