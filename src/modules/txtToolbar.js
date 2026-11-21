/**
 * Applies plain-text utilities and formatting actions to a source textarea in .txt mode.
 */

function transformSelection(textarea, fn) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  if (start === end) {
    const updated = fn(value);
    textarea.value = updated;
    textarea.focus();
    return;
  }
  const selected = value.slice(start, end);
  const updated = fn(selected);
  textarea.setRangeText(updated, start, end, 'select');
  textarea.focus();
  textarea.setSelectionRange(start, start + updated.length);
}

function toTitleCase(text) {
  return text.replace(/\b([a-zA-Z])(\w*)/g, (_, first, rest) =>
    `${first.toUpperCase()}${rest.toLowerCase()}`
  );
}

function getSelectedLineRange(textarea) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextNewline = value.indexOf('\n', end);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;
  return { lineStart, lineEnd, block: value.slice(lineStart, lineEnd) };
}

function transformLines(textarea, lineMapper) {
  const { lineStart, lineEnd, block } = getSelectedLineRange(textarea);
  const lines = block.split('\n');
  const replacement = lineMapper(lines).join('\n');
  textarea.setRangeText(replacement, lineStart, lineEnd, 'select');
  textarea.focus();
  textarea.setSelectionRange(lineStart, lineStart + replacement.length);
}

function insertAtCursor(textarea, text) {
  const { selectionStart: start, selectionEnd: end } = textarea;
  textarea.setRangeText(text, start, end, 'end');
  textarea.focus();
}

export function applyTxtAction(textarea, action) {
  if (!textarea || !action) return false;

  if (action === 'upper') {
    transformSelection(textarea, (s) => s.toUpperCase());
    return true;
  }
  if (action === 'lower') {
    transformSelection(textarea, (s) => s.toLowerCase());
    return true;
  }
  if (action === 'title') {
    transformSelection(textarea, toTitleCase);
    return true;
  }
  if (action === 'ul') {
    transformLines(textarea, (lines) => {
      const all = lines.every((l) => l.startsWith('• '));
      return lines.map((l) => (all ? l.slice(2) : `• ${l}`));
    });
    return true;
  }
  if (action === 'ol') {
    transformLines(textarea, (lines) => {
      const all = lines.every((l, i) => l.startsWith(`${i + 1}. `));
      return lines.map((l, i) => (all ? l.slice(`${i + 1}. `.length) : `${i + 1}. ${l}`));
    });
    return true;
  }
  if (action === 'indent') {
    transformLines(textarea, (lines) => lines.map((l) => `  ${l}`));
    return true;
  }
  if (action === 'outdent') {
    transformLines(textarea, (lines) =>
      lines.map((l) => (l.startsWith('  ') ? l.slice(2) : l.startsWith('\t') ? l.slice(1) : l))
    );
    return true;
  }
  if (action === 'trim') {
    transformSelection(textarea, (s) =>
      s
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n')
    );
    return true;
  }
  if (action === 'sort') {
    transformLines(textarea, (lines) =>
      [...lines].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    );
    return true;
  }
  if (action === 'timestamp') {
    insertAtCursor(textarea, new Date().toLocaleString());
    return true;
  }
  if (action === 'hr') {
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    const before = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
    const after = end < value.length && value[end] !== '\n' ? '\n' : '';
    insertAtCursor(textarea, `${before}--------------------${after}`);
    return true;
  }

  return false;
}
