import { invoke } from '@tauri-apps/api/core';
import { createIconPlaceholder, initIcons } from './icons.js';
import { clearGrammarHighlights, updateGrammarHighlights } from './grammarHighlights.js';
import { applyMarkdownFormat } from './markdownToolbar.js';

const STORAGE_KEY = 'wordflow.inspectorOpen';
const LAYOUT_STORAGE_KEY = 'wordflow.inspectorLayout';

const MODE_TIPS = {
  docx: {
    title: 'Word Rich Text (.docx)',
    tip: 'Select text or click an object (link, table, image, shape) to see its settings below.',
    shortcut: 'Ctrl+B/I/U format • Ctrl+K link',
  },
  md: {
    title: 'Markdown Source (.md)',
    tip: 'Use # for headings, **bold**, *italic*, and [text](url) for links.',
    shortcut: 'Ctrl+Shift+I toggles this pane',
  },
  html: {
    title: 'HTML Source (.html)',
    tip: 'Edit raw HTML tags directly. Use Format in the toolbar to tidy indentation.',
    shortcut: 'Ctrl+Shift+I toggles this pane',
  },
  txt: {
    title: 'Plain Text (.txt)',
    tip: 'Clean unformatted text. Use toolbar tools to change case, indent, or sort lines.',
    shortcut: 'Ctrl+Shift+I toggles this pane',
  },
};

const CMD_TIPS = {
  undo: { title: 'Undo', tip: 'Reverts your last document edit.', shortcut: 'Ctrl+Z' },
  redo: { title: 'Redo', tip: 'Re-applies an undone edit.', shortcut: 'Ctrl+Y' },
  bold: { title: 'Bold', tip: 'Toggles bold weight on selected text.', shortcut: 'Ctrl+B' },
  italic: { title: 'Italic', tip: 'Toggles italic emphasis on selected text.', shortcut: 'Ctrl+I' },
  underline: { title: 'Underline', tip: 'Toggles underline on selected text.', shortcut: 'Ctrl+U' },
  strikeThrough: { title: 'Strikethrough', tip: 'Draws a line through selected text.', shortcut: 'Toolbar' },
  superscript: { title: 'Superscript', tip: 'Raises selected text above the baseline (e.g. x²).', shortcut: 'Toolbar' },
  subscript: { title: 'Subscript', tip: 'Lowers selected text below the baseline (e.g. H₂O).', shortcut: 'Toolbar' },
  indent: { title: 'Increase Indent', tip: 'Indents the active paragraph or list item further right.', shortcut: 'Toolbar' },
  outdent: { title: 'Decrease Indent', tip: 'Moves the active paragraph or list item back left.', shortcut: 'Toolbar' },
  insertUnorderedList: { title: 'Bullet List', tip: 'Converts selection into a bulleted list.', shortcut: 'Toolbar' },
  insertOrderedList: { title: 'Numbered List', tip: 'Converts selection into a numbered list.', shortcut: 'Toolbar' },
  justifyLeft: { title: 'Align Left', tip: 'Aligns the active paragraph to the left margin.', shortcut: 'Toolbar' },
  justifyCenter: { title: 'Align Center', tip: 'Centers the active paragraph.', shortcut: 'Toolbar' },
  justifyRight: { title: 'Align Right', tip: 'Aligns the active paragraph to the right margin.', shortcut: 'Toolbar' },
  justifyFull: { title: 'Justify', tip: 'Spreads text evenly between left and right margins.', shortcut: 'Toolbar' },
  removeFormat: { title: 'Clear Formatting', tip: 'Strips inline font, color, and style overrides.', shortcut: 'Toolbar' },
};

const ID_TIPS = {
  'btn-copy': { title: 'Copy', tip: 'Copies the selected text or content to your clipboard.', shortcut: 'Ctrl+C' },
  'btn-paste': { title: 'Paste', tip: 'Pastes text or content from your clipboard at the cursor.', shortcut: 'Ctrl+V' },
  'btn-find-replace': { title: 'Find & Replace', tip: 'Search for text in the document and optionally replace it.', shortcut: 'Ctrl+F' },
  'btn-format-painter': { title: 'Format Painter', tip: 'Click to copy formatting at the cursor, then drag across text to apply it.', shortcut: 'Toolbar' },
  'font-family-select': { title: 'Font Family', tip: 'Changes the typeface of selected text or the current typing position.', shortcut: 'Toolbar' },
  'font-size-select': { title: 'Font Size', tip: 'Changes the text size in points (pt).', shortcut: 'Toolbar' },
  'btn-styles-menu': { title: 'Text Styles', tip: 'Apply Paragraph, Heading 1–3, or your saved custom styles.', shortcut: 'Cmd/Ctrl+Opt+0–3' },
  'btn-open-style-editor': { title: 'Style Editor', tip: 'Create, preview, edit, or delete reusable custom text styles.', shortcut: 'Styles Menu' },
  'btn-text-color': { title: 'Text Colour', tip: 'Choose a text colour from swatches or a custom colour picker.', shortcut: 'Toolbar' },
  'btn-highlight-color': { title: 'Text Highlight', tip: 'Highlights selected text with a background colour or clears highlight.', shortcut: 'Toolbar' },
  'btn-bottom-border': { title: 'Paragraph Border', tip: 'Toggles a horizontal divider line beneath the current paragraph.', shortcut: 'Toolbar' },
  'line-spacing-select': { title: 'Line Spacing', tip: 'Adjusts vertical spacing between lines in your document.', shortcut: 'Toolbar' },
  'page-margins-select': { title: 'Page Margins', tip: 'Sets narrow, normal, or wide margins around the page.', shortcut: 'Toolbar' },
  'btn-insert-table': { title: 'Insert Table', tip: 'Insert a grid table with your chosen number of rows and columns.', shortcut: 'Toolbar' },
  'btn-insert-shape': { title: 'Insert Shape', tip: 'Add rectangles, circles, arrows, callouts, and editable diagrams.', shortcut: 'Toolbar' },
  'btn-shape-marquee': { title: 'Select Shapes', tip: 'Drag a selection box over the page to select one or more shapes.', shortcut: 'Toolbar' },
  'btn-insert-image': { title: 'Insert Image', tip: 'Embed an image file from your computer into the document.', shortcut: 'Toolbar' },
  'btn-insert-link': { title: 'Insert Link', tip: 'Turn selected text into a clickable hyperlink or edit an existing link.', shortcut: 'Ctrl+K' },
  'btn-page-menu': { title: 'Page & Header/Footer', tip: 'Insert page breaks, edit headers & footers, or toggle page numbers.', shortcut: 'Toolbar' },
  'btn-columns-menu': { title: 'Columns', tip: 'Split the document or a selected section into 1, 2, or 3 columns.', shortcut: 'Toolbar' },
};

const BLOCK_TIPS = {
  P: { title: 'Paragraph', tip: 'Formats the active block as standard body text.', shortcut: 'Cmd/Ctrl+Opt+0' },
  H1: { title: 'Heading 1', tip: 'Formats the active block as a top-level document heading.', shortcut: 'Cmd/Ctrl+Opt+1' },
  H2: { title: 'Heading 2', tip: 'Formats the active block as a major section heading.', shortcut: 'Cmd/Ctrl+Opt+2' },
  H3: { title: 'Heading 3', tip: 'Formats the active block as a subsection heading.', shortcut: 'Cmd/Ctrl+Opt+3' },
  BLOCKQUOTE: { title: 'Blockquote', tip: 'Indents and styles the active paragraph as a quotation.', shortcut: 'Toolbar' },
  PRE: { title: 'Code Block', tip: 'Formats the active block in a monospace code container.', shortcut: 'Toolbar' },
};

const MD_TIPS = {
  h1: { title: 'Heading 1 (#)', tip: 'Prefixes the current line with # for a Markdown H1 heading.', shortcut: '# ' },
  h2: { title: 'Heading 2 (##)', tip: 'Prefixes the current line with ## for a Markdown H2 heading.', shortcut: '## ' },
  h3: { title: 'Heading 3 (###)', tip: 'Prefixes the current line with ### for a Markdown H3 heading.', shortcut: '### ' },
  bold: { title: 'Bold (**text**)', tip: 'Wraps selected text in ** to make it bold in Markdown.', shortcut: '**text**' },
  italic: { title: 'Italic (*text*)', tip: 'Wraps selected text in * for italic emphasis in Markdown.', shortcut: '*text*' },
  strike: { title: 'Strikethrough (~~text~~)', tip: 'Wraps selected text in ~~ for strikethrough in Markdown.', shortcut: '~~text~~' },
  code: { title: 'Inline Code (`code`)', tip: 'Wraps selected text in backticks for inline code.', shortcut: '`code`' },
  ul: { title: 'Bullet List (- )', tip: 'Prefixes selected lines with - to create a Markdown bullet list.', shortcut: '- ' },
  ol: { title: 'Numbered List (1. )', tip: 'Prefixes selected lines with numbers for an ordered list.', shortcut: '1. ' },
  quote: { title: 'Blockquote (> )', tip: 'Prefixes selected lines with > for a Markdown blockquote.', shortcut: '> ' },
  codeblock: { title: 'Code Block (```)', tip: 'Wraps selection in fenced ``` code block markers.', shortcut: '```' },
  link: { title: 'Insert Link', tip: 'Inserts a Markdown hyperlink template [text](url).', shortcut: '[text](url)' },
  hr: { title: 'Horizontal Rule', tip: 'Inserts a --- horizontal divider line in Markdown.', shortcut: '---' },
};

const HTML_TIPS = {
  h1: { title: 'Heading 1 (<h1>)', tip: 'Wraps selection or line in <h1>...</h1> tags.', shortcut: '<h1>' },
  h2: { title: 'Heading 2 (<h2>)', tip: 'Wraps selection or line in <h2>...</h2> tags.', shortcut: '<h2>' },
  h3: { title: 'Heading 3 (<h3>)', tip: 'Wraps selection or line in <h3>...</h3> tags.', shortcut: '<h3>' },
  p: { title: 'Paragraph (<p>)', tip: 'Wraps selection or line in <p>...</p> paragraph tags.', shortcut: '<p>' },
  bold: { title: 'Bold (<strong>)', tip: 'Wraps selected text in <strong>...</strong>.', shortcut: '<strong>' },
  italic: { title: 'Italic (<em>)', tip: 'Wraps selected text in <em>...</em>.', shortcut: '<em>' },
  underline: { title: 'Underline (<u>)', tip: 'Wraps selected text in <u>...</u>.', shortcut: '<u>' },
  strike: { title: 'Strikethrough (<s>)', tip: 'Wraps selected text in <s>...</s>.', shortcut: '<s>' },
  code: { title: 'Inline Code (<code>)', tip: 'Wraps selected text in <code>...</code>.', shortcut: '<code>' },
  ul: { title: 'Bullet List (<ul>)', tip: 'Wraps lines in an unordered <ul><li>...</li></ul> list.', shortcut: '<ul>' },
  ol: { title: 'Numbered List (<ol>)', tip: 'Wraps lines in an ordered <ol><li>...</li></ol> list.', shortcut: '<ol>' },
  quote: { title: 'Blockquote (<blockquote>)', tip: 'Wraps selection in a <blockquote>...</blockquote> block.', shortcut: '<blockquote>' },
  codeblock: { title: 'Code Block (<pre><code>)', tip: 'Wraps selection in <pre><code>...</code></pre>.', shortcut: '<pre><code>' },
  link: { title: 'Insert Link (<a>)', tip: 'Inserts an <a href="...">...</a> hyperlink tag.', shortcut: '<a>' },
  hr: { title: 'Horizontal Rule (<hr />)', tip: 'Inserts an <hr /> horizontal divider tag.', shortcut: '<hr />' },
  format: { title: 'Format HTML', tip: 'Pretty-prints and indents the HTML source code.', shortcut: 'Toolbar' },
};

const TXT_TIPS = {
  upper: { title: 'UPPERCASE', tip: 'Converts selected text (or current line) to ALL CAPS.', shortcut: 'Toolbar' },
  lower: { title: 'lowercase', tip: 'Converts selected text (or current line) to lowercase.', shortcut: 'Toolbar' },
  title: { title: 'Title Case', tip: 'Capitalizes the first letter of each word in the selection.', shortcut: 'Toolbar' },
  ul: { title: 'Bullet List (• )', tip: 'Prefixes selected lines with a bullet character (• ).', shortcut: '• ' },
  ol: { title: 'Numbered List (1. )', tip: 'Prefixes selected lines with sequential numbers.', shortcut: '1. ' },
  indent: { title: 'Indent', tip: 'Adds leading spaces to indent the selected lines.', shortcut: 'Toolbar' },
  outdent: { title: 'Outdent', tip: 'Removes leading spaces from the selected lines.', shortcut: 'Toolbar' },
  trim: { title: 'Trim Trailing Spaces', tip: 'Removes extra spaces at the end of every line.', shortcut: 'Toolbar' },
  sort: { title: 'Sort Lines A–Z', tip: 'Alphabetically sorts the selected lines (or entire document).', shortcut: 'Toolbar' },
  timestamp: { title: 'Insert Date & Time', tip: 'Inserts the current local date and time at the cursor.', shortcut: 'Toolbar' },
  hr: { title: 'Insert Divider Line', tip: 'Inserts a horizontal line of dashes at the cursor.', shortcut: '---' },
};

function readStoredOpenState() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredOpenState(isOpen) {
  try {
    localStorage.setItem(STORAGE_KEY, isOpen ? 'true' : 'false');
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

function readStoredLayout() {
  const defaults = { mode: 'docked', dock: 'right', x: null, y: 112 };
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode === 'floating' ? 'floating' : 'docked',
      dock: parsed.dock === 'left' ? 'left' : 'right',
      x: typeof parsed.x === 'number' ? parsed.x : null,
      y: typeof parsed.y === 'number' ? parsed.y : 112,
    };
  } catch {
    return defaults;
  }
}

function writeStoredLayout(layout) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

function countWords(text) {
  const trimmed = (text || '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function normalizeTagLabel(tagName) {
  const map = {
    P: 'Paragraph',
    DIV: 'Paragraph',
    H1: 'Heading 1',
    H2: 'Heading 2',
    H3: 'Heading 3',
    H4: 'Heading 4',
    BLOCKQUOTE: 'Blockquote',
    PRE: 'Code Block',
    LI: 'List Item',
    TD: 'Table Cell',
    TH: 'Table Header',
    A: 'Link',
    IMG: 'Image',
  };
  return map[tagName] || tagName || 'Text';
}

function getLineColFromOffset(text, offset) {
  const slice = (text || '').slice(0, Math.max(0, offset));
  const lines = slice.split('\n');
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

function getMarkdownLineStyle(text, offset) {
  const safeOffset = Math.max(0, Math.min(offset, (text || '').length));
  const lineStart = (text || '').lastIndexOf('\n', safeOffset - 1) + 1;
  const nextNewline = (text || '').indexOf('\n', safeOffset);
  const lineEnd = nextNewline === -1 ? (text || '').length : nextNewline;
  const line = (text || '').slice(lineStart, lineEnd);
  if (/^###\s+/.test(line)) return 'H3';
  if (/^##\s+/.test(line)) return 'H2';
  if (/^#\s+/.test(line)) return 'H1';
  return 'P';
}

function setMarkdownParagraph(textarea) {
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const value = textarea.value;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextNewline = value.indexOf('\n', end);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;
  const block = value.slice(lineStart, lineEnd);
  const cleaned = block
    .split('\n')
    .map((line) => line.replace(/^#{1,6}\s+/, ''))
    .join('\n');
  textarea.setRangeText(cleaned, lineStart, lineEnd, 'select');
  textarea.focus();
  textarea.setSelectionRange(lineStart, lineStart + cleaned.length);
}

/**
 * Creates the collapsible right-hand Inspector / Tools pane.
 */
export function createInspectorPane({
  paneEl,
  toggleBtnEl,
  edgeToggleBtnEl,
  closeBtnEl,
  wordEl,
  sourceEl,
  getMode,
  getStats,
  execFormatCommand,
  execBlockCommand,
  toggleBottomBorder,
  columnTools,
  openLinkDialog,
  onRichMutate,
  getCustomStyles,
  applyCustomStyle,
  openStyleEditor,
  applyTextColor,
  applyHighlightColor,
}) {
  if (!paneEl) {
    return {
      isOpen: () => false,
      setOpen: () => {},
      toggle: () => {},
      refresh: () => {},
    };
  }

  let isOpen = readStoredOpenState();
  let layout = readStoredLayout();
  let rafId = 0;
  let lastToolTip = null;
  let collapsedSections = new Set();

  const headerEl = paneEl.querySelector('#inspector-header');
  const dockToggleBtnEl = paneEl.querySelector('#btn-inspector-dock-toggle');

  const toolTitleEl = paneEl.querySelector('#inspector-tool-title');
  const toolTipEl = paneEl.querySelector('#inspector-tool-tip');
  const toolShortcutEl = paneEl.querySelector('#inspector-tool-shortcut');

  const selElementEl = paneEl.querySelector('#inspector-sel-element');
  const selCountsEl = paneEl.querySelector('#inspector-sel-counts');
  const selFontEl = paneEl.querySelector('#inspector-sel-font');

  const settingsBodyEl = paneEl.querySelector('#inspector-settings-body');

  const docWordsEl = paneEl.querySelector('#inspector-doc-words');
  const docCharsEl = paneEl.querySelector('#inspector-doc-chars');
  const docReadEl = paneEl.querySelector('#inspector-doc-read');
  const outlineListEl = paneEl.querySelector('#inspector-outline-list');

  const ignoredGrammarKeys = new Set();
  let grammarTimer = 0;
  let lastGrammarText = null;

  function clampFloatingPos(x, y) {
    const paneW = paneEl.offsetWidth || 272;
    const paneH = Math.min(paneEl.offsetHeight || 420, window.innerHeight - 60);
    const maxX = Math.max(12, window.innerWidth - paneW - 12);
    const maxY = Math.max(56, window.innerHeight - paneH - 32);
    const fallbackX = Math.max(16, window.innerWidth - paneW - 28);
    const safeX = typeof x === 'number' ? Math.min(Math.max(12, x), maxX) : fallbackX;
    const safeY = typeof y === 'number' ? Math.min(Math.max(56, y), maxY) : 112;
    return { x: safeX, y: safeY };
  }

  const appShellEl = document.querySelector('.app-shell');
  const workspaceRow = appShellEl?.querySelector('.workspace-row');
  const docks = {
    left: document.getElementById('dock-left'),
    right: document.getElementById('dock-right'),
  };
  const DOCK_HIT_PAD = 44;

  function applyLayoutState() {
    const isFloating = layout.mode === 'floating';
    const isLeft = !isFloating && layout.dock === 'left';
    paneEl.classList.toggle('is-floating', isFloating);
    paneEl.classList.toggle('is-dock-left', isLeft);

    if (isFloating) {
      if (appShellEl && paneEl.parentElement !== appShellEl) {
        appShellEl.appendChild(paneEl);
      }
      const pos = clampFloatingPos(layout.x, layout.y);
      layout.x = pos.x;
      layout.y = pos.y;
      paneEl.style.setProperty('--inspector-x', `${pos.x}px`);
      paneEl.style.setProperty('--inspector-y', `${pos.y}px`);
    } else {
      paneEl.style.removeProperty('--inspector-x');
      paneEl.style.removeProperty('--inspector-y');
      const targetDock = docks[layout.dock] || docks.right;
      if (targetDock && paneEl.parentElement !== targetDock) {
        targetDock.appendChild(paneEl);
      }
    }

    if (dockToggleBtnEl) {
      dockToggleBtnEl.classList.toggle('is-active', isFloating);
      dockToggleBtnEl.title = isFloating ? 'Dock Inspector to Side' : 'Float Inspector Window';
    }
    if (edgeToggleBtnEl) {
      edgeToggleBtnEl.classList.toggle('is-hidden', isFloating);
    }
  }

  function toggleFloating() {
    if (layout.mode === 'floating') {
      layout.mode = 'docked';
    } else {
      const rect = paneEl.getBoundingClientRect();
      layout.mode = 'floating';
      layout.x = rect.width > 40 ? rect.left : window.innerWidth - 300;
      layout.y = rect.top > 56 ? rect.top : 112;
    }
    writeStoredLayout(layout);
    applyLayoutState();
  }

  function applyOpenState() {
    paneEl.classList.toggle('is-collapsed', !isOpen);
    paneEl.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (toggleBtnEl) {
      toggleBtnEl.classList.toggle('is-active', isOpen);
      toggleBtnEl.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
    }
    if (edgeToggleBtnEl) {
      edgeToggleBtnEl.classList.toggle('is-open', isOpen);
      edgeToggleBtnEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      edgeToggleBtnEl.title = isOpen ? 'Hide Tools & Inspector' : 'Show Tools & Inspector';
    }
    applyLayoutState();
  }

  function setOpen(nextOpen) {
    isOpen = Boolean(nextOpen);
    writeStoredOpenState(isOpen);
    applyOpenState();
    if (isOpen) {
      scheduleRefresh();
      scheduleGrammarCheck(true);
    }
  }

  function hasOpenDocument() {
    return document.querySelector('.app-shell')?.getAttribute('data-has-document') !== 'false';
  }

  function toggle() {
    if (!hasOpenDocument()) return;
    setOpen(!isOpen);
  }

  function getRichSelectionContext() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!wordEl.contains(range.commonAncestorContainer)) return null;

    const anchorNode = sel.anchorNode;
    const baseEl = anchorNode?.nodeType === 1 ? anchorNode : anchorNode?.parentElement;
    if (!baseEl) return null;

    const linkEl = baseEl.closest('a');
    const cellEl = baseEl.closest('td, th');
    const tableEl = cellEl ? cellEl.closest('table') : null;
    let blockEl = baseEl !== wordEl ? baseEl.closest('h1, h2, h3, h4, p, blockquote, pre, li, div') : null;
    if (!blockEl && baseEl === wordEl && wordEl.childNodes.length > 0) {
      const idx = Math.min(range.startOffset, wordEl.childNodes.length - 1);
      const child = wordEl.childNodes[idx];
      const childEl = child?.nodeType === 1 ? child : child?.parentElement;
      if (childEl && childEl !== wordEl) {
        blockEl = childEl.closest('h1, h2, h3, h4, p, blockquote, pre, li, div') || childEl;
      }
    }
    blockEl = blockEl || wordEl;
    let imgEl = baseEl.closest('img');
    if (!imgEl && !range.collapsed) {
      const fragmentEl = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : null;
      if (fragmentEl?.tagName === 'IMG') imgEl = fragmentEl;
    }

    const selectedText = sel.toString();
    const computed = window.getComputedStyle(baseEl);
    const toolbarFontEl = document.getElementById('font-family-select');
    const toolbarSizeEl = document.getElementById('font-size-select');
    const computedFont = (computed.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
    const fontName = toolbarFontEl?.value || computedFont;
    let fontSize = toolbarSizeEl?.value || '';
    if (!fontSize && computed.fontSize) {
      const px = parseFloat(computed.fontSize);
      fontSize = Number.isNaN(px) ? computed.fontSize : `${Math.round((px * 72) / 96)}pt`;
    }

    return {
      sel,
      range,
      selectedText,
      baseEl,
      blockEl: blockEl === wordEl ? null : blockEl,
      linkEl,
      tableEl,
      cellEl,
      imgEl,
      fontName,
      fontSize,
      textAlign: computed.textAlign || 'left',
    };
  }

  function renderToolTip(mode) {
    if (wordEl?.classList.contains('is-format-painter')) {
      const info = ID_TIPS['btn-format-painter'];
      if (toolTitleEl) toolTitleEl.textContent = `${info.title} (Active)`;
      if (toolTipEl) toolTipEl.textContent = info.tip;
      if (toolShortcutEl) toolShortcutEl.textContent = 'Drag across text to apply • Click button to cancel';
      return;
    }
    const fallback = MODE_TIPS[mode] || MODE_TIPS.docx;
    const info = lastToolTip || fallback;
    if (toolTitleEl) toolTitleEl.textContent = info.title;
    if (toolTipEl) toolTipEl.textContent = info.tip;
    if (toolShortcutEl) toolShortcutEl.textContent = info.shortcut || '';
  }

  function renderSelectionInfo(mode, ctx) {
    if (mode !== 'docx') {
      const start = sourceEl.selectionStart || 0;
      const end = sourceEl.selectionEnd || 0;
      const selected = sourceEl.value.slice(start, end);
      const pos = getLineColFromOffset(sourceEl.value, start);
      if (selElementEl) selElementEl.textContent = `Line ${pos.line}, Col ${pos.col}`;
      if (selCountsEl) {
        selCountsEl.textContent = selected
          ? `${countWords(selected)} words • ${selected.length} chars selected`
          : 'No text selected';
      }
      if (selFontEl) {
        if (mode === 'md') {
          const mdTag = getMarkdownLineStyle(sourceEl.value, start);
          const MD_STYLE_NAMES = {
            P: 'Paragraph',
            H1: 'Heading 1',
            H2: 'Heading 2',
            H3: 'Heading 3',
          };
          selFontEl.textContent = MD_STYLE_NAMES[mdTag] || 'Paragraph';
        } else {
          selFontEl.textContent = `${mode.toUpperCase()} source`;
        }
      }
      return;
    }

    const selectedShape = document.querySelector('.word-shape.is-selected');
    if (selectedShape) {
      const kind = selectedShape.dataset.shapeType || 'Shape';
      if (selElementEl) selElementEl.textContent = `Shape (${kind})`;
      if (selCountsEl) {
        const unit = document.getElementById('shape-size-unit')?.value || 'mm';
        const dimWVal = document.getElementById('shape-dim-w')?.value;
        const dimHVal = document.getElementById('shape-dim-h')?.value;
        if (dimWVal && dimHVal) {
          selCountsEl.textContent = `${dimWVal} × ${dimHVal} ${unit}`;
        } else {
          const wPx = selectedShape.offsetWidth;
          const hPx = selectedShape.offsetHeight;
          if (unit === 'mm') {
            const w = Math.round((wPx * 25.4 / 96) * 10) / 10;
            const h = Math.round((hPx * 25.4 / 96) * 10) / 10;
            selCountsEl.textContent = `${w} × ${h} mm`;
          } else if (unit === 'in') {
            const w = Math.round((wPx / 96) * 100) / 100;
            const h = Math.round((hPx / 96) * 100) / 100;
            selCountsEl.textContent = `${w} × ${h} in`;
          } else {
            selCountsEl.textContent = `${Math.round(wPx)} × ${Math.round(hPx)} px`;
          }
        }
      }
      if (selFontEl) selFontEl.textContent = 'Use shape bar or drag handles';
      return;
    }

    if (!ctx) {
      if (selElementEl) selElementEl.textContent = 'Canvas Ready';
      if (selCountsEl) selCountsEl.textContent = 'Click in document to inspect';
      if (selFontEl) selFontEl.textContent = '—';
      return;
    }

    let label = normalizeTagLabel(ctx.blockEl?.tagName);
    if (ctx.imgEl) label = 'Image';
    else if (ctx.linkEl) label = 'Link';
    else if (ctx.cellEl) label = normalizeTagLabel(ctx.cellEl.tagName);

    if (selElementEl) selElementEl.textContent = label;
    if (selCountsEl) {
      selCountsEl.textContent = ctx.selectedText
        ? `${countWords(ctx.selectedText)} words • ${ctx.selectedText.length} chars`
        : 'Cursor active (no selection)';
    }
    if (selFontEl) {
      selFontEl.textContent = ctx.fontName ? `${ctx.fontName} • ${ctx.fontSize}` : ctx.fontSize || '—';
    }
  }

  function createButton(
    label,
    actionName,
    { icon = '', iconOnly = false, active = false, danger = false, title = '' } = {}
  ) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inspector-chip-btn';
    if (iconOnly) btn.classList.add('is-icon-only');
    if (active) btn.classList.add('is-active');
    if (danger) btn.classList.add('is-danger');
    btn.dataset.inspectorAction = actionName;
    if (icon) {
      btn.appendChild(createIconPlaceholder(icon, 'lucide-sm'));
    }
    if (!iconOnly && label) {
      const span = document.createElement('span');
      span.textContent = label;
      btn.appendChild(span);
    }
    if (title || (iconOnly && label)) {
      btn.title = title || label;
    }
    if (iconOnly && label) {
      btn.setAttribute('aria-label', label);
    }
    return btn;
  }

  function renderSettings(mode, ctx) {
    if (!settingsBodyEl) return;
    settingsBodyEl.innerHTML = '';

    if (mode !== 'docx') {
      if (mode === 'md' && sourceEl) {
        const mdTag = getMarkdownLineStyle(sourceEl.value, sourceEl.selectionStart || 0);
        const MD_STYLE_OPTIONS = [
          ['Paragraph', 'P', 'style-preview-p'],
          ['Heading 1 (H1)', 'H1', 'style-preview-h1'],
          ['Heading 2 (H2)', 'H2', 'style-preview-h2'],
          ['Heading 3 (H3)', 'H3', 'style-preview-h3'],
        ];
        const activeMdOption = MD_STYLE_OPTIONS.find(([, tag]) => tag === mdTag) || MD_STYLE_OPTIONS[0];

        const blockLabel = document.createElement('div');
        blockLabel.className = 'inspector-sublabel';
        blockLabel.textContent = 'Style';
        settingsBodyEl.appendChild(blockLabel);

        const stylesWrap = document.createElement('div');
        stylesWrap.className = 'inspector-styles-wrap';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'inspector-styles-toggle';
        toggleBtn.setAttribute('aria-haspopup', 'true');
        toggleBtn.setAttribute('aria-expanded', 'false');

        const toggleLabel = document.createElement('span');
        toggleLabel.className = 'inspector-styles-toggle-label';
        toggleLabel.textContent = activeMdOption[0];
        toggleBtn.appendChild(toggleLabel);

        toggleBtn.appendChild(createIconPlaceholder('chevron-down', 'lucide-xs'));

        const popover = document.createElement('div');
        popover.className = 'inspector-styles-popover';
        popover.setAttribute('role', 'menu');
        popover.setAttribute('aria-label', 'Markdown styles');

        MD_STYLE_OPTIONS.forEach(([label, tag, previewClass]) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = `style-preview-item ${previewClass}`;
          if (mdTag === tag) item.classList.add('is-active');
          item.setAttribute('role', 'menuitem');
          item.textContent = label;
          item.addEventListener('mousedown', (event) => event.preventDefault());
          item.addEventListener('click', () => {
            if (tag === 'P') {
              setMarkdownParagraph(sourceEl);
              sourceEl.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              applyMarkdownFormat(sourceEl, tag.toLowerCase());
              sourceEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
            popover.classList.remove('is-open');
            toggleBtn.setAttribute('aria-expanded', 'false');
            scheduleRefresh();
          });
          popover.appendChild(item);
        });

        toggleBtn.addEventListener('mousedown', (event) => event.preventDefault());
        toggleBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          const willOpen = !popover.classList.contains('is-open');
          popover.classList.toggle('is-open', willOpen);
          toggleBtn.setAttribute('aria-expanded', String(willOpen));
        });

        stylesWrap.appendChild(toggleBtn);
        stylesWrap.appendChild(popover);
        settingsBodyEl.appendChild(stylesWrap);
      }

      const hint = document.createElement('p');
      hint.className = 'inspector-muted-note';
      hint.textContent =
        mode === 'md'
          ? 'Switch to .docx mode for rich typography, tables, and shape controls.'
          : 'Use the top toolbar for source formatting actions.';
      settingsBodyEl.appendChild(hint);
      return;
    }

    const selectedShape = document.querySelector('.word-shape.is-selected');
    if (selectedShape) {
      const note = document.createElement('p');
      note.className = 'inspector-muted-note';
      note.textContent = 'Shape selected. Adjust fill, border, wrapping, and exact dimensions in the floating shape bar.';
      settingsBodyEl.appendChild(note);
      return;
    }

    if (ctx?.imgEl) {
      const imgTitle = document.createElement('div');
      imgTitle.className = 'inspector-sublabel';
      imgTitle.textContent = 'Image Width';
      settingsBodyEl.appendChild(imgTitle);

      const row = document.createElement('div');
      row.className = 'inspector-btn-row';
      ['25%', '50%', '75%', '100%'].forEach((pct) => {
        const btn = createButton(pct, `img-width:${pct}`, { title: `Set image width to ${pct}` });
        row.appendChild(btn);
      });
      settingsBodyEl.appendChild(row);
    }

    if (ctx?.linkEl) {
      const linkTitle = document.createElement('div');
      linkTitle.className = 'inspector-sublabel';
      linkTitle.textContent = 'Selected Link';
      settingsBodyEl.appendChild(linkTitle);

      const urlBox = document.createElement('div');
      urlBox.className = 'inspector-url-preview';
      urlBox.textContent = ctx.linkEl.getAttribute('href') || '(no URL)';
      settingsBodyEl.appendChild(urlBox);

      const row = document.createElement('div');
      row.className = 'inspector-btn-row';
      row.appendChild(createButton('Edit Link', 'link-edit', { icon: 'pencil' }));
      row.appendChild(createButton('Unlink', 'link-remove', { icon: 'x', danger: true }));
      settingsBodyEl.appendChild(row);
    }

    if (ctx?.tableEl) {
      const tblTitle = document.createElement('div');
      tblTitle.className = 'inspector-sublabel';
      const rows = ctx.tableEl.rows?.length || 0;
      const cols = ctx.tableEl.rows?.[0]?.cells?.length || 0;
      tblTitle.textContent = `Table (${rows} × ${cols})`;
      settingsBodyEl.appendChild(tblTitle);

      const row = document.createElement('div');
      row.className = 'inspector-btn-row';
      row.appendChild(createButton('Row', 'table-add-row', { icon: 'plus', title: 'Add Row Below' }));
      row.appendChild(createButton('Col', 'table-add-col', { icon: 'plus', title: 'Add Column Right' }));
      row.appendChild(createButton('Row', 'table-del-row', { icon: 'minus', danger: true, title: 'Delete Row' }));
      row.appendChild(createButton('Col', 'table-del-col', { icon: 'minus', danger: true, title: 'Delete Column' }));
      settingsBodyEl.appendChild(row);
    }

    // Block / Paragraph settings
    const rawBlockTag = ctx?.blockEl?.tagName?.toUpperCase() || 'P';
    const blockTag = rawBlockTag === 'DIV' ? 'P' : rawBlockTag;
    const blockLabel = document.createElement('div');
    blockLabel.className = 'inspector-sublabel';
    blockLabel.textContent = 'Block Style';
    settingsBodyEl.appendChild(blockLabel);

    const STYLE_OPTIONS = [
      ['Paragraph', 'P', 'style-preview-p'],
      ['Heading 1', 'H1', 'style-preview-h1'],
      ['Heading 2', 'H2', 'style-preview-h2'],
      ['Heading 3', 'H3', 'style-preview-h3'],
    ];
    const customStyles = getCustomStyles?.() || [];
    const activeCustomStyleId = ctx?.blockEl?.dataset?.customStyle || '';
    const activeCustomStyle = activeCustomStyleId
      ? customStyles.find((s) => s.id === activeCustomStyleId)
      : null;
    const activeStyleOption = STYLE_OPTIONS.find(([, tag]) => tag === blockTag) || STYLE_OPTIONS[0];
    const activeFont = ctx?.fontName || document.getElementById('font-family-select')?.value || 'Georgia';

    const stylesWrap = document.createElement('div');
    stylesWrap.className = 'inspector-styles-wrap';
    stylesWrap.style.setProperty('--active-style-font', `"${activeFont}", sans-serif`);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'inspector-styles-toggle';
    toggleBtn.setAttribute('aria-haspopup', 'true');
    toggleBtn.setAttribute('aria-expanded', 'false');

    const toggleLabel = document.createElement('span');
    toggleLabel.className = 'inspector-styles-toggle-label';
    toggleLabel.textContent = activeCustomStyle ? activeCustomStyle.name : activeStyleOption[0];
    toggleBtn.appendChild(toggleLabel);

    const chevronIcon = document.createElement('i');
    chevronIcon.dataset.lucide = 'chevron-down';
    chevronIcon.className = 'lucide-xs';
    toggleBtn.appendChild(chevronIcon);

    const popover = document.createElement('div');
    popover.className = 'inspector-styles-popover';
    popover.setAttribute('role', 'menu');
    popover.setAttribute('aria-label', 'Block styles');

    STYLE_OPTIONS.forEach(([label, tag, previewClass]) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `style-preview-item ${previewClass}`;
      if (!activeCustomStyle && activeStyleOption[1] === tag) {
        item.classList.add('is-active');
      }
      item.dataset.block = tag;
      item.setAttribute('role', 'menuitem');
      item.textContent = label;
      item.addEventListener('mousedown', (event) => event.preventDefault());
      item.addEventListener('click', () => {
        execBlockCommand?.(tag);
        popover.classList.remove('is-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
        scheduleRefresh();
      });
      popover.appendChild(item);
    });

    customStyles.forEach((style) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'style-preview-item is-custom-style';
      if (activeCustomStyle && activeCustomStyle.id === style.id) {
        item.classList.add('is-active');
      }
      item.setAttribute('role', 'menuitem');
      item.textContent = style.name;

      const decorations = [];
      if (style.underline) decorations.push('underline');
      if (style.strikethrough) decorations.push('line-through');

      item.style.setProperty('--custom-style-font', `"${style.fontFamily || activeFont}", Georgia, serif`);
      item.style.setProperty('--custom-style-size', style.fontSize || '12pt');
      item.style.setProperty('--custom-style-color', style.color || 'var(--chrome-text)');
      item.style.setProperty('--custom-style-weight', style.bold ? '700' : '400');
      item.style.setProperty('--custom-style-italic', style.italic ? 'italic' : 'normal');
      item.style.setProperty(
        '--custom-style-decoration',
        decorations.length ? decorations.join(' ') : 'none'
      );

      item.addEventListener('mousedown', (event) => event.preventDefault());
      item.addEventListener('click', () => {
        applyCustomStyle?.(style);
        popover.classList.remove('is-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
        scheduleRefresh();
      });
      popover.appendChild(item);
    });

    const divider = document.createElement('div');
    divider.className = 'styles-popover-divider';
    divider.setAttribute('aria-hidden', 'true');
    popover.appendChild(divider);

    const editorTrigger = document.createElement('button');
    editorTrigger.type = 'button';
    editorTrigger.className = 'styles-editor-trigger';
    editorTrigger.setAttribute('role', 'menuitem');
    editorTrigger.appendChild(createIconPlaceholder('sliders-horizontal', 'lucide-xs'));
    const triggerText = document.createElement('span');
    triggerText.textContent = 'Style Editor…';
    editorTrigger.appendChild(triggerText);
    editorTrigger.addEventListener('mousedown', (event) => event.preventDefault());
    editorTrigger.addEventListener('click', () => {
      popover.classList.remove('is-open');
      toggleBtn.setAttribute('aria-expanded', 'false');
      openStyleEditor?.();
    });
    popover.appendChild(editorTrigger);

    toggleBtn.addEventListener('mousedown', (event) => event.preventDefault());
    toggleBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = !popover.classList.contains('is-open');
      popover.classList.toggle('is-open', willOpen);
      toggleBtn.setAttribute('aria-expanded', String(willOpen));
    });

    stylesWrap.appendChild(toggleBtn);
    stylesWrap.appendChild(popover);
    settingsBodyEl.appendChild(stylesWrap);

    const alignLabel = document.createElement('div');
    alignLabel.className = 'inspector-sublabel';
    alignLabel.textContent = 'Alignment';
    settingsBodyEl.appendChild(alignLabel);

    const alignRow = document.createElement('div');
    alignRow.className = 'inspector-btn-row';
    const curAlign = ctx?.textAlign || 'left';
    [
      ['Align Left', 'justifyLeft', 'text-align-start', curAlign === 'left' || curAlign === 'start'],
      ['Align Center', 'justifyCenter', 'text-align-center', curAlign === 'center'],
      ['Align Right', 'justifyRight', 'text-align-end', curAlign === 'right' || curAlign === 'end'],
      ['Justify', 'justifyFull', 'text-align-justify', curAlign === 'justify'],
    ].forEach(([label, cmd, icon, active]) => {
      alignRow.appendChild(createButton(label, `cmd:${cmd}`, { icon, iconOnly: true, active }));
    });
    settingsBodyEl.appendChild(alignRow);

    const styleLabel = document.createElement('div');
    styleLabel.className = 'inspector-sublabel';
    styleLabel.textContent = 'Text Format';
    settingsBodyEl.appendChild(styleLabel);

    const styleRow = document.createElement('div');
    styleRow.className = 'inspector-btn-row';
    styleRow.appendChild(
      createButton('Bold (Ctrl+B)', 'cmd:bold', {
        icon: 'bold',
        iconOnly: true,
        active: document.queryCommandState?.('bold'),
      })
    );
    styleRow.appendChild(
      createButton('Italic (Ctrl+I)', 'cmd:italic', {
        icon: 'italic',
        iconOnly: true,
        active: document.queryCommandState?.('italic'),
      })
    );
    styleRow.appendChild(
      createButton('Underline (Ctrl+U)', 'cmd:underline', {
        icon: 'underline',
        iconOnly: true,
        active: document.queryCommandState?.('underline'),
      })
    );
    styleRow.appendChild(
      createButton('Superscript', 'cmd:superscript', {
        icon: 'superscript',
        iconOnly: true,
        active: document.queryCommandState?.('superscript'),
      })
    );
    styleRow.appendChild(
      createButton('Subscript', 'cmd:subscript', {
        icon: 'subscript',
        iconOnly: true,
        active: document.queryCommandState?.('subscript'),
      })
    );
    styleRow.appendChild(
      createButton('Clear Formatting', 'cmd:removeFormat', {
        icon: 'remove-formatting',
        iconOnly: true,
      })
    );
    styleRow.appendChild(
      createButton('Bottom Border Separator', 'bottom-border', {
        icon: 'minus',
        iconOnly: true,
        active: ctx?.blockEl?.dataset?.bottomBorder === 'true',
      })
    );
    settingsBodyEl.appendChild(styleRow);

    const colorLabel = document.createElement('div');
    colorLabel.className = 'inspector-sublabel';
    colorLabel.textContent = 'Text Colour';
    settingsBodyEl.appendChild(colorLabel);

    const colorRow = document.createElement('div');
    colorRow.className = 'inspector-btn-row';
    [
      ['Auto', '#1a1a1a'],
      ['Red', '#C00000'],
      ['Blue', '#0070C0'],
      ['Green', '#00B050'],
      ['Orange', '#FFC000'],
      ['Purple', '#7030A0'],
    ].forEach(([name, hex]) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'context-menu-swatch';
      sw.title = `Text Colour: ${name}`;
      sw.setAttribute('aria-label', `Text Colour: ${name}`);
      sw.style.backgroundColor = hex;
      sw.addEventListener('mousedown', (e) => e.preventDefault());
      sw.addEventListener('click', () => {
        applyTextColor?.(hex);
        scheduleRefresh();
      });
      colorRow.appendChild(sw);
    });
    settingsBodyEl.appendChild(colorRow);

    const hiliteLabel = document.createElement('div');
    hiliteLabel.className = 'inspector-sublabel';
    hiliteLabel.textContent = 'Text Highlight';
    settingsBodyEl.appendChild(hiliteLabel);

    const hiliteRow = document.createElement('div');
    hiliteRow.className = 'inspector-btn-row';
    [
      ['None', ''],
      ['Yellow', '#FEF08A'],
      ['Green', '#BBF7D0'],
      ['Cyan', '#A5F3FC'],
      ['Pink', '#FBCFE8'],
      ['Lavender', '#DDD6FE'],
    ].forEach(([name, hex]) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = hex ? 'context-menu-swatch' : 'context-menu-swatch is-none';
      sw.title = `Highlight: ${name}`;
      sw.setAttribute('aria-label', `Highlight: ${name}`);
      if (hex) sw.style.backgroundColor = hex;
      sw.addEventListener('mousedown', (e) => e.preventDefault());
      sw.addEventListener('click', () => {
        applyHighlightColor?.(hex);
        scheduleRefresh();
      });
      hiliteRow.appendChild(sw);
    });
    settingsBodyEl.appendChild(hiliteRow);

    if (columnTools && columnTools.getDocumentColumns() > 1) {
      const colLabel = document.createElement('div');
      colLabel.className = 'inspector-sublabel';
      colLabel.textContent = 'Columns';
      settingsBodyEl.appendChild(colLabel);

      const curCols = columnTools.getDocumentColumns();
      const colRow = document.createElement('div');
      colRow.className = 'inspector-btn-row';
      [1, 2, 3].forEach((n) => {
        colRow.appendChild(
          createButton(`${n} Col`, `cols:${n}`, {
            active: curCols === n,
            title: `Set document to ${n} column${n > 1 ? 's' : ''}`,
          })
        );
      });
      settingsBodyEl.appendChild(colRow);
    }

    if (columnTools?.getActiveColumnSection()) {
      const secLabel = document.createElement('div');
      secLabel.className = 'inspector-sublabel';
      secLabel.textContent = 'Column Section';
      settingsBodyEl.appendChild(secLabel);

      const secRow = document.createElement('div');
      secRow.className = 'inspector-btn-row';
      secRow.appendChild(
        createButton('Unwrap to Text', 'col-section:unwrap', {
          title: 'Convert column section back into normal paragraphs',
        })
      );
      secRow.appendChild(
        createButton('Delete Section', 'col-section:delete', {
          icon: 'x',
          danger: true,
          title: 'Remove the entire column section',
        })
      );
      settingsBodyEl.appendChild(secRow);
    }

    initIcons(settingsBodyEl);
  }

  function renderStatsAndOutline(mode) {
    const stats = getStats ? getStats() : { words: 0, chars: 0 };
    const readMins = Math.max(1, Math.ceil((stats.words || 0) / 200));
    if (docWordsEl) docWordsEl.textContent = `${stats.words}`;
    if (docCharsEl) docCharsEl.textContent = `${stats.chars}`;
    if (docReadEl) docReadEl.textContent = stats.words > 0 ? `${readMins} min` : '0 min';

    if (!outlineListEl) return;
    outlineListEl.innerHTML = '';

    if (mode === 'docx') {
      const headings = Array.from(wordEl.querySelectorAll('h1, h2, h3'));
      if (headings.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'inspector-muted-note';
        empty.textContent = 'No headings yet.';
        outlineListEl.appendChild(empty);
        return;
      }
      headings.forEach((h, idx) => {
        const text = (h.textContent || '').trim() || `Untitled Heading ${idx + 1}`;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `inspector-outline-item level-${h.tagName.toLowerCase()}`;
        item.textContent = text;
        item.addEventListener('click', () => {
          h.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        outlineListEl.appendChild(item);
      });
    } else if (mode === 'md') {
      const lines = (sourceEl.value || '').split('\n');
      const mdHeadings = [];
      lines.forEach((line, lineIdx) => {
        const match = line.match(/^(#{1,3})\s+(.+)$/);
        if (match) mdHeadings.push({ level: match[1].length, text: match[2].trim(), lineIdx });
      });
      if (mdHeadings.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'inspector-muted-note';
        empty.textContent = 'No Markdown headings yet.';
        outlineListEl.appendChild(empty);
        return;
      }
      mdHeadings.forEach((h) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `inspector-outline-item level-h${h.level}`;
        item.textContent = h.text;
        item.addEventListener('click', () => {
          const lineHeight = 22;
          sourceEl.focus();
          sourceEl.scrollTop = Math.max(0, h.lineIdx * lineHeight - 60);
        });
        outlineListEl.appendChild(item);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'inspector-muted-note';
      empty.textContent = 'Outline available in .docx and .md modes.';
      outlineListEl.appendChild(empty);
    }
  }

  function refresh() {
    rafId = 0;
    if (!isOpen) return;
    const mode = getMode ? getMode() : 'docx';
    const ctx = mode === 'docx' ? getRichSelectionContext() : null;
    renderToolTip(mode);
    renderSelectionInfo(mode, ctx);
    renderSettings(mode, ctx);
    renderStatsAndOutline(mode);
  }

  function scheduleRefresh() {
    if (!isOpen || rafId) return;
    rafId = window.requestAnimationFrame(refresh);
  }

  function handleSettingsAction(action) {
    if (!action) return;
    if (action.startsWith('cmd:')) {
      const cmd = action.slice(4);
      execFormatCommand?.(cmd);
      scheduleRefresh();
      return;
    }
    if (action === 'bottom-border') {
      toggleBottomBorder?.();
      scheduleRefresh();
      return;
    }
    if (action.startsWith('block:')) {
      const tag = action.slice(6);
      execBlockCommand?.(tag);
      scheduleRefresh();
      return;
    }
    if (action.startsWith('cols:')) {
      const count = Number(action.slice(5));
      columnTools?.setDocumentColumns(count);
      scheduleRefresh();
      return;
    }
    if (action === 'col-section:unwrap') {
      columnTools?.removeColumnSection({ keepContent: true });
      scheduleRefresh();
      return;
    }
    if (action === 'col-section:delete') {
      columnTools?.removeColumnSection({ keepContent: false });
      scheduleRefresh();
      return;
    }
    if (action.startsWith('img-width:')) {
      const width = action.slice(10);
      const ctx = getRichSelectionContext();
      if (ctx?.imgEl) {
        ctx.imgEl.style.width = width;
        ctx.imgEl.style.height = 'auto';
        onRichMutate?.();
        scheduleRefresh();
      }
      return;
    }
    if (action === 'link-edit') {
      openLinkDialog?.();
      return;
    }
    if (action === 'link-remove') {
      execFormatCommand?.('unlink');
      scheduleRefresh();
      return;
    }
    if (action.startsWith('table-')) {
      const tableActionMap = {
        'table-add-row': 'add-row',
        'table-add-col': 'add-col',
        'table-del-row': 'del-row',
        'table-del-col': 'del-col',
      };
      const targetBtn = document.querySelector(`[data-table-action="${tableActionMap[action]}"]`);
      targetBtn?.click();
      scheduleRefresh();
    }
  }

  function detectDockZone(clientX, clientY) {
    const wsRect = workspaceRow?.getBoundingClientRect();
    if (!wsRect || clientY < wsRect.top || clientY > wsRect.bottom) return null;
    if (clientX <= wsRect.left + DOCK_HIT_PAD) return 'left';
    if (clientX >= wsRect.right - DOCK_HIT_PAD) return 'right';
    return null;
  }

  function clearDropHighlights() {
    docks.left?.classList.remove('is-drop-target');
    docks.right?.classList.remove('is-drop-target');
  }

  function setupDragBehavior() {
    if (!headerEl) return;
    let dragState = null;

    headerEl.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      layout.mode = 'docked';
      layout.dock = 'right';
      writeStoredLayout(layout);
      applyLayoutState();
    });

    headerEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const rect = paneEl.getBoundingClientRect();
      dragState = {
        startX: e.clientX,
        startY: e.clientY,
        origLeft: rect.left,
        origTop: rect.top,
        moved: false,
        hoveredDock: null,
      };
      paneEl.classList.add('is-dragging');
      headerEl.setPointerCapture?.(e.pointerId);
    });

    window.addEventListener('pointermove', (e) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (!dragState.moved && Math.hypot(dx, dy) < 6) return;

      if (!dragState.moved) {
        dragState.moved = true;
        if (layout.mode !== 'floating') {
          layout.mode = 'floating';
          applyLayoutState();
        }
      }

      const pos = clampFloatingPos(dragState.origLeft + dx, dragState.origTop + dy);
      layout.x = pos.x;
      layout.y = pos.y;
      paneEl.style.setProperty('--inspector-x', `${pos.x}px`);
      paneEl.style.setProperty('--inspector-y', `${pos.y}px`);

      dragState.hoveredDock = detectDockZone(e.clientX, e.clientY);
      clearDropHighlights();
      if (dragState.hoveredDock && docks[dragState.hoveredDock]) {
        docks[dragState.hoveredDock].classList.add('is-drop-target');
      }
    });

    window.addEventListener('pointerup', () => {
      if (!dragState) return;
      const { moved, hoveredDock } = dragState;
      dragState = null;
      paneEl.classList.remove('is-dragging');
      clearDropHighlights();
      if (!moved) return;

      if (hoveredDock) {
        layout.mode = 'docked';
        layout.dock = hoveredDock;
      }
      writeStoredLayout(layout);
      applyLayoutState();
    });
  }

  async function runGrammarCheck(force = false) {
    const mode = getMode ? getMode() : 'docx';
    if (mode !== 'docx') {
      clearGrammarHighlights();
      return;
    }

    const text = wordEl.innerText || '';
    if (!force && text === lastGrammarText) return;
    lastGrammarText = text;

    if (!text.trim()) {
      clearGrammarHighlights();
      return;
    }

    try {
      const rawIssues = await invoke('check_grammar', { text });
      const issues = (Array.isArray(rawIssues) ? rawIssues : []).filter(
        (item) => !ignoredGrammarKeys.has(`${item.kind}:${item.problem_text}:${item.start}`)
      );
      updateGrammarHighlights(wordEl, issues);
    } catch {
      clearGrammarHighlights();
    }
  }

  function scheduleGrammarCheck(immediate = false) {
    const mode = getMode ? getMode() : 'docx';
    if (mode !== 'docx') {
      clearGrammarHighlights();
      return;
    }
    if (grammarTimer) {
      window.clearTimeout(grammarTimer);
      grammarTimer = 0;
    }
    if (immediate) {
      runGrammarCheck(false);
      return;
    }
    grammarTimer = window.setTimeout(() => {
      grammarTimer = 0;
      runGrammarCheck(false);
    }, 450);
  }

  function bindEvents() {
    toggleBtnEl?.addEventListener('click', toggle);
    edgeToggleBtnEl?.addEventListener('click', toggle);
    closeBtnEl?.addEventListener('click', () => setOpen(false));
    dockToggleBtnEl?.addEventListener('click', toggleFloating);
    setupDragBehavior();

    window.addEventListener('resize', () => {
      if (layout.mode === 'floating' && isOpen) applyLayoutState();
    });

    paneEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.inspector-chip-btn')) {
        e.preventDefault();
      }
    });

    paneEl.addEventListener('click', (e) => {
      const headerBtn = e.target.closest('.inspector-section-toggle');
      if (headerBtn) {
        const section = headerBtn.closest('.inspector-section');
        const id = section?.dataset.sectionId;
        if (section && id) {
          const nextCollapsed = !collapsedSections.has(id);
          if (nextCollapsed) collapsedSections.add(id);
          else collapsedSections.delete(id);
          section.classList.toggle('is-section-collapsed', nextCollapsed);
          headerBtn.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
          if (id === 'grammar-check' && !nextCollapsed) {
            scheduleGrammarCheck(true);
          }
        }
        return;
      }

      const actionBtn = e.target.closest('[data-inspector-action]');
      if (actionBtn) {
        handleSettingsAction(actionBtn.dataset.inspectorAction);
      }
    });

    // Track toolbar hover/clicks for live tool tips (including floating & side-docked toolbars)
    const tipEventRoot = appShellEl || document.querySelector('.format-toolbar');
    tipEventRoot?.addEventListener('mouseover', (e) => {
      if (!e.target.closest('.toolbar-group')) return;
      const btn = e.target.closest(
        '[data-cmd], [data-md-action], [data-html-action], [data-txt-action], [data-block], [id], [title]'
      );
      if (!btn || btn.classList.contains('toolbar-group') || btn.classList.contains('toolbar-grip')) return;

      const resolved =
        (btn.dataset.cmd && CMD_TIPS[btn.dataset.cmd]) ||
        (btn.dataset.mdAction && MD_TIPS[btn.dataset.mdAction]) ||
        (btn.dataset.htmlAction && HTML_TIPS[btn.dataset.htmlAction]) ||
        (btn.dataset.txtAction && TXT_TIPS[btn.dataset.txtAction]) ||
        (btn.dataset.block && BLOCK_TIPS[btn.dataset.block]) ||
        (btn.id && ID_TIPS[btn.id]) ||
        null;

      if (resolved) {
        lastToolTip = resolved;
        scheduleRefresh();
      } else if (btn.title) {
        lastToolTip = {
          title: btn.title.replace(/\s*\([^)]*\)\s*$/, ''),
          tip: btn.getAttribute('aria-label') || 'Click to apply this tool to your document.',
          shortcut: (btn.title.match(/\(([^)]+)\)/) || [])[1] || '',
        };
        scheduleRefresh();
      }
    });

    document.addEventListener('selectionchange', scheduleRefresh);
    document.addEventListener('mousedown', (event) => {
      const openPopover = settingsBodyEl?.querySelector('.inspector-styles-popover.is-open');
      if (!openPopover) return;
      const wrap = openPopover.closest('.inspector-styles-wrap');
      if (wrap && !wrap.contains(event.target)) {
        openPopover.classList.remove('is-open');
        wrap.querySelector('.inspector-styles-toggle')?.setAttribute('aria-expanded', 'false');
      }
    });
    document.getElementById('font-family-select')?.addEventListener('change', scheduleRefresh);
    document.getElementById('font-size-select')?.addEventListener('change', scheduleRefresh);
    document.getElementById('shape-size-unit')?.addEventListener('change', () => setTimeout(scheduleRefresh, 0));
    document.getElementById('shape-dim-w')?.addEventListener('input', scheduleRefresh);
    document.getElementById('shape-dim-w')?.addEventListener('change', scheduleRefresh);
    document.getElementById('shape-dim-h')?.addEventListener('input', scheduleRefresh);
    document.getElementById('shape-dim-h')?.addEventListener('change', scheduleRefresh);
    document.getElementById('page-shapes-layer')?.addEventListener('pointerup', scheduleRefresh);
    document.getElementById('page-shapes-behind-layer')?.addEventListener('pointerup', scheduleRefresh);
    wordEl?.addEventListener('input', () => {
      scheduleRefresh();
      scheduleGrammarCheck(false);
    });
    wordEl?.addEventListener('click', scheduleRefresh);
    sourceEl?.addEventListener('input', () => {
      scheduleRefresh();
      scheduleGrammarCheck(false);
    });
    sourceEl?.addEventListener('click', scheduleRefresh);
    sourceEl?.addEventListener('keyup', scheduleRefresh);

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        toggle();
      }
    });
  }

  applyOpenState();
  bindEvents();
  if (isOpen) {
    scheduleRefresh();
    scheduleGrammarCheck(true);
  }

  return {
    isOpen: () => isOpen,
    setOpen,
    toggle,
    refresh: scheduleRefresh,
    refreshGrammar: () => runGrammarCheck(true),
    ignoreGrammarIssue: (issue) => {
      if (!issue) return;
      ignoredGrammarKeys.add(`${issue.kind}:${issue.problem_text}:${issue.start}`);
      runGrammarCheck(true);
    },
  };
}
