/**
 * Applies Markdown syntax formatting to the current selection or line in a textarea.
 */

const INLINE_WRAPPERS = {
  bold: { prefix: '**', suffix: '**', placeholder: 'bold text' },
  italic: { prefix: '*', suffix: '*', placeholder: 'italic text' },
  strike: { prefix: '~~', suffix: '~~', placeholder: 'strikethrough' },
  code: { prefix: '`', suffix: '`', placeholder: 'code' },
};

const LINE_PREFIXES = {
  h1: '# ',
  h2: '## ',
  h3: '### ',
  ul: '- ',
  ol: '1. ',
  quote: '> ',
};

function wrapSelection(textarea, { prefix, suffix, placeholder }) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end);
  const inner = selected || placeholder;
  const replacement = `${prefix}${inner}${suffix}`;

  textarea.setRangeText(replacement, start, end, 'select');
  textarea.focus();
  textarea.setSelectionRange(start + prefix.length, start + prefix.length + inner.length);
}

function toggleLinePrefix(textarea, prefix, isOrdered = false) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextNewline = value.indexOf('\n', end);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;

  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const isHeading = /^#{1,3} $/.test(prefix);

  const allHavePrefix = lines.every((line, idx) => {
    const expected = isOrdered ? `${idx + 1}. ` : prefix;
    return line.startsWith(expected);
  });

  const updated = lines.map((line, idx) => {
    const expected = isOrdered ? `${idx + 1}. ` : prefix;
    if (allHavePrefix) {
      return line.slice(expected.length);
    }
    const cleaned = isHeading ? line.replace(/^#{1,6}\s+/, '') : line;
    return `${expected}${cleaned}`;
  });

  const replacement = updated.join('\n');
  textarea.setRangeText(replacement, lineStart, lineEnd, 'select');
  textarea.focus();
  textarea.setSelectionRange(lineStart, lineStart + replacement.length);
}

function insertCodeBlock(textarea) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end) || 'code';
  const before = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
  const after = end < value.length && value[end] !== '\n' ? '\n' : '';
  const replacement = `${before}\`\`\`\n${selected}\n\`\`\`${after}`;

  textarea.setRangeText(replacement, start, end, 'select');
  textarea.focus();
  const codeStart = start + before.length + 4;
  textarea.setSelectionRange(codeStart, codeStart + selected.length);
}

function insertLink(textarea) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end) || 'link text';
  const replacement = `[${selected}](https://)`;

  textarea.setRangeText(replacement, start, end, 'select');
  textarea.focus();
  const urlStart = start + selected.length + 3;
  textarea.setSelectionRange(urlStart, urlStart + 'https://'.length);
}

function insertHorizontalRule(textarea) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const before = start > 0 && value[start - 1] !== '\n' ? '\n\n' : '';
  const after = end < value.length && value[end] !== '\n' ? '\n\n' : '\n';
  const replacement = `${before}---${after}`;

  textarea.setRangeText(replacement, start, end, 'end');
  textarea.focus();
}

export function applyMarkdownFormat(textarea, action) {
  if (!textarea || !action) return false;

  if (INLINE_WRAPPERS[action]) {
    wrapSelection(textarea, INLINE_WRAPPERS[action]);
    return true;
  }

  if (LINE_PREFIXES[action]) {
    toggleLinePrefix(textarea, LINE_PREFIXES[action], action === 'ol');
    return true;
  }

  if (action === 'codeblock') {
    insertCodeBlock(textarea);
    return true;
  }

  if (action === 'link') {
    insertLink(textarea);
    return true;
  }

  if (action === 'hr') {
    insertHorizontalRule(textarea);
    return true;
  }

  return false;
}
