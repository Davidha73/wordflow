/**
 * Applies HTML tag-wrapping and formatting actions to a source textarea in .html mode.
 */
import { formatHtmlPretty } from './formatters.js';

const TAG_WRAPPERS = {
  h1: { tag: 'h1', placeholder: 'Heading 1' },
  h2: { tag: 'h2', placeholder: 'Heading 2' },
  h3: { tag: 'h3', placeholder: 'Heading 3' },
  p: { tag: 'p', placeholder: 'Paragraph' },
  bold: { tag: 'strong', placeholder: 'bold text' },
  italic: { tag: 'em', placeholder: 'italic text' },
  underline: { tag: 'u', placeholder: 'underlined text' },
  strike: { tag: 's', placeholder: 'strikethrough' },
  code: { tag: 'code', placeholder: 'code' },
  quote: { tag: 'blockquote', placeholder: 'Quote' },
};

function wrapWithTag(textarea, { tag, placeholder }) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end);
  const inner = selected || placeholder;
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const replacement = `${open}${inner}${close}`;

  textarea.setRangeText(replacement, start, end, 'select');
  textarea.focus();
  textarea.setSelectionRange(start + open.length, start + open.length + inner.length);
}

function insertList(textarea, tag) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end).trim();
  const lines = selected ? selected.split(/\r?\n/).filter(Boolean) : ['List item'];
  const items = lines.map((line) => `  <li>${line}</li>`).join('\n');
  const replacement = `<${tag}>\n${items}\n</${tag}>`;

  textarea.setRangeText(replacement, start, end, 'end');
  textarea.focus();
}

function insertCodeBlock(textarea) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const inner = value.slice(start, end) || 'code';
  const open = '<pre><code>';
  const close = '</code></pre>';
  const replacement = `${open}${inner}${close}`;

  textarea.setRangeText(replacement, start, end, 'select');
  textarea.focus();
  textarea.setSelectionRange(start + open.length, start + open.length + inner.length);
}

function insertLink(textarea) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const inner = value.slice(start, end) || 'link text';
  const open = '<a href="https://">';
  const replacement = `${open}${inner}</a>`;

  textarea.setRangeText(replacement, start, end, 'select');
  textarea.focus();
  const urlStart = start + '<a href="'.length;
  textarea.setSelectionRange(urlStart, urlStart + 'https://'.length);
}

function insertHr(textarea) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const before = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
  const after = end < value.length && value[end] !== '\n' ? '\n' : '';
  textarea.setRangeText(`${before}<hr />${after}`, start, end, 'end');
  textarea.focus();
}

function formatDocumentHtml(textarea) {
  const formatted = formatHtmlPretty(textarea.value);
  textarea.value = formatted;
  textarea.focus();
}

export function applyHtmlFormat(textarea, action) {
  if (!textarea || !action) return false;

  if (TAG_WRAPPERS[action]) {
    wrapWithTag(textarea, TAG_WRAPPERS[action]);
    return true;
  }

  if (action === 'ul' || action === 'ol') {
    insertList(textarea, action);
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
    insertHr(textarea);
    return true;
  }

  if (action === 'format') {
    formatDocumentHtml(textarea);
    return true;
  }

  return false;
}
