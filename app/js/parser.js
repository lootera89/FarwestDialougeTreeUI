import { FIELD_DEFS, emptyDay } from './schema.js';

/** Unescape Unreal-style string literals: \' \\ */
export function unescapeUnreal(str) {
  return str.replace(/\\(['"\\])/g, '$1');
}

/** Escape for Unreal paste: backslash and single quotes */
export function escapeUnreal(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Parse pasted Unreal TArray-of-structs text into days[].
 * Accepts: ((Field="..",..),(Field="..",..)) or single (Field="..")
 */
export function parseDialogueAsset(raw) {
  const text = raw.trim();
  if (!text) return { days: [emptyDay()], warnings: ['Empty paste — started a blank day.'] };

  const warnings = [];
  const days = [];

  // Split top-level day structs: (...),(...)
  const dayChunks = splitTopLevelStructs(text);
  if (!dayChunks.length) {
    warnings.push('Could not find any ( ... ) day structs.');
    return { days: [emptyDay()], warnings };
  }

  for (const chunk of dayChunks) {
    const fields = {};
    for (const f of FIELD_DEFS) fields[f.key] = '';

    // Match Key="value" with escaped quotes inside
    const pairRe = /([A-Za-z0-9_]+)\s*=\s*"((?:\\.|[^"\\])*)"/g;
    let m;
    let found = 0;
    while ((m = pairRe.exec(chunk)) !== null) {
      const key = m[1];
      const value = unescapeUnreal(m[2]);
      fields[key] = value;
      found += 1;
      if (!FIELD_DEFS.some((f) => f.key === key)) {
        warnings.push(`Unknown field kept: ${key}`);
      }
    }
    if (!found) warnings.push('A day struct had no Key="value" pairs.');
    days.push({ fields });
  }

  return { days, warnings };
}

/** Split outermost (...) groups, ignoring parentheses inside "strings". */
function splitTopLevelStructs(text) {
  const s = text.trim();
  const results = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '(') {
      if (depth === 0) start = i + 1;
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const inner = s.slice(start, i).trim();
        // Outer wrap that only contains nested day structs → recurse
        if (/^\s*\(/.test(inner) && !/^[A-Za-z0-9_]+\s*=/.test(inner)) {
          results.push(...splitTopLevelStructs(inner));
        } else {
          results.push(inner);
        }
        start = -1;
      }
    }
  }
  return results;
}

/**
 * Serialize days back to Unreal paste format.
 * Omits empty string fields (matches typical DA copy behavior).
 */
export function serializeDialogueAsset(days, { omitEmpty = true } = {}) {
  const dayStrs = days.map((day) => {
    const parts = [];
    // Preserve known field order; append any extra keys at end
    const seen = new Set();
    for (const f of FIELD_DEFS) {
      seen.add(f.key);
      const val = day.fields[f.key] ?? '';
      if (omitEmpty && val === '') continue;
      parts.push(`${f.key}="${escapeUnreal(val)}"`);
    }
    for (const [key, val] of Object.entries(day.fields)) {
      if (seen.has(key)) continue;
      if (omitEmpty && val === '') continue;
      parts.push(`${key}="${escapeUnreal(val)}"`);
    }
    return `(${parts.join(',')})`;
  });
  return `(${dayStrs.join(',')})`;
}
