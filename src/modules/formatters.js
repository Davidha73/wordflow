export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function plainTextToHtml(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  if (!normalized.trim()) return '';
  return normalized
    .split('\n')
    .map((line) => (line.trim() === '' ? '<p><br></p>' : `<p>${escapeHtml(line)}</p>`))
    .join('\n');
}

export function htmlToPlainText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || '', 'text/html');
  const lines = [];

  doc.body.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) lines.push(text);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toUpperCase();

    if (node.classList?.contains('svg-diagram-block')) {
      lines.push('[Diagram: SVG Drawing]');
    } else if (tag === 'TABLE') {
      node.querySelectorAll('tr').forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll('th, td')).map((cell) =>
          (cell.textContent || '').replace(/\s+/g, ' ').trim()
        );
        if (cells.length > 0) {
          lines.push(cells.join('\t'));
        }
      });
    } else if (tag === 'UL' || tag === 'OL') {
      node.querySelectorAll(':scope > li').forEach((li) => {
        const text = (li.textContent || '').trim();
        if (text) lines.push(text);
      });
    } else {
      const text = (node.textContent || '').replace(/\u00a0/g, ' ').trim();
      lines.push(text);
    }
  });

  return lines.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

const VOID_TAGS = new Set(['BR', 'HR', 'IMG', 'INPUT', 'META', 'LINK']);
const BLOCK_TAGS = new Set([
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'P', 'DIV', 'BLOCKQUOTE', 'PRE',
  'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
]);

function serializePrettyNode(node, depth = 0) {
  const indent = '  '.repeat(depth);

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    if (!text.trim()) return '';
    return escapeHtml(text);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName.toLowerCase();
  const upperTag = node.tagName.toUpperCase();
  const attrs = Array.from(node.attributes)
    .map((attr) => ` ${attr.name}="${escapeHtml(attr.value)}"`)
    .join('');

  if (VOID_TAGS.has(upperTag)) {
    return `${indent}<${tag}${attrs} />`;
  }

  if (upperTag === 'PRE') {
    return `${indent}<pre${attrs}>${node.innerHTML}</pre>`;
  }

  const children = Array.from(node.childNodes);
  const hasBlockChild = children.some(
    (child) => child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(child.tagName.toUpperCase())
  );

  if (!hasBlockChild) {
    const inner = children
      .map((child) => serializePrettyNode(child, 0))
      .join('');
    return `${BLOCK_TAGS.has(upperTag) ? indent : ''}<${tag}${attrs}>${inner}</${tag}>`;
  }

  const innerLines = children
    .map((child) => serializePrettyNode(child, depth + 1))
    .filter((part) => part.trim() !== '');

  return `${indent}<${tag}${attrs}>\n${innerLines.join('\n')}\n${indent}</${tag}>`;
}

export function formatHtmlPretty(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || '', 'text/html');
  const blocks = Array.from(doc.body.childNodes)
    .map((node) => serializePrettyNode(node, 0))
    .filter((part) => part.trim() !== '');
  return blocks.join('\n');
}
