// Tag di baris pertama non-kosong: // @file: x  |  # @file: x  |  /* @file: x */  |  <!-- @file: x -->  |  -- @file: x
const TAG = /^\s*(?:\/\/|#|--|;|%|\/\*+|<!--)\s*@file:\s*(\S.*?)\s*(?:\*+\/|-->)?\s*$/;

// Bila seluruh clipboard dibungkus satu code fence ```lang ... ```, buka bungkusnya.
export function unwrapFence(text) {
  const m = text.match(/^\s*```[^\n]*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1] : text;
}

/**
 * @returns {{ empty: true } | { empty: false, target: string|null, content: string, lines: number }}
 */
export function parseClipboard(raw, { keepTag = false } = {}) {
  const text = unwrapFence(raw.replace(/\r\n/g, '\n'));
  const lines = text.split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first === -1) return { empty: true };

  const m = lines[first].match(TAG);
  const target = m ? m[1].replace(/^["'`]|["'`]$/g, '').trim() : null;

  let content = target && !keepTag ? lines.slice(first + 1).join('\n').replace(/^\n+/, '') : text;
  content = content.replace(/\s+$/, '') + '\n';

  return { empty: false, target, content, lines: content.split('\n').length - 1 };
}
