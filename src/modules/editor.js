import { invoke } from '@tauri-apps/api/core';
import TurndownService from 'turndown';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { formatHtmlPretty, htmlToPlainText, plainTextToHtml } from './formatters.js';
import {
  createUndoHistory,
  getCaretCharacterOffset,
  getSelectionOffsets,
  restoreCaretCharacterOffset,
  restoreSelectionOffsets,
} from './undoHistory.js';
import { createTableTools } from './tableTools.js';
import { createColumnTools } from './columnTools.js';
import { createPageShapes } from './pageShapes.js';
import { createPageBreaks } from './pageBreaks.js';
import { createImageTools } from './imageTools.js';
import { createFindReplace } from './findReplace.js';
import { createLinkTools } from './linkTools.js';
import { createContextMenu } from './contextMenu.js';
import { initDockableToolbars } from './dockableToolbars.js';
import { createHeaderFooter } from './headerFooter.js';
import { hydrateAllDiagrams } from './svgDiagram.js';
import { applyMarkdownFormat } from './markdownToolbar.js';
import { applyHtmlFormat } from './htmlToolbar.js';
import { applyTxtAction } from './txtToolbar.js';
import { createInspectorPane } from './inspectorPane.js';
import { createStyleEditorModal } from './styleEditorModal.js';
import { repositionGrammarHighlights } from './grammarHighlights.js';

const FALLBACK_FONTS = [
  'Segoe UI',
  'Calibri',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Consolas',
];

const TEXT_COLOR_SWATCHES = [
  { name: 'Dark Red', hex: '#C00000' },
  { name: 'Red', hex: '#FF0000' },
  { name: 'Orange', hex: '#FFC000' },
  { name: 'Yellow', hex: '#FFFF00' },
  { name: 'Light Green', hex: '#92D050' },
  { name: 'Green', hex: '#00B050' },
  { name: 'Light Blue', hex: '#00B0F0' },
  { name: 'Blue', hex: '#0070C0' },
  { name: 'Dark Blue', hex: '#002060' },
  { name: 'Purple', hex: '#7030A0' },
];

const HIGHLIGHT_SWATCHES = [
  { name: 'Yellow', hex: '#FEF08A' },
  { name: 'Green', hex: '#BBF7D0' },
  { name: 'Cyan', hex: '#A5F3FC' },
  { name: 'Pink', hex: '#FBCFE8' },
  { name: 'Orange', hex: '#FED7AA' },
  { name: 'Lavender', hex: '#DDD6FE' },
];

const MODE_ORDER = ['docx', 'md', 'html', 'txt'];
const JUSTIFY_MAP = {
  justifyLeft: 'left',
  justifyCenter: 'center',
  justifyRight: 'right',
  justifyFull: 'justify',
};

function extractPrimaryFontName(rawFont) {
  if (!rawFont) return '';
  const first = rawFont.split(',')[0] || '';
  return first.replace(/^["'\s]+|["'\s]+$/g, '').trim();
}

function hasRichFormatting(html) {
  if (!html) return false;
  return /<(h[1-6]|strong|b|em|i|u|s|del|strike|ul|ol|li|blockquote|pre|code|table|font|span|svg)\b|style\s*=|svg-diagram-block/i.test(
    html
  );
}

marked.setOptions({
  gfm: true,
  breaks: false,
});

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

turndown.addRule('strikethrough', {
  filter: ['del', 's', 'strike'],
  replacement: (content) => `~~${content}~~`,
});

turndown.addRule('svgDiagram', {
  filter: (node) =>
    node.nodeName === 'DIV' && node.classList?.contains('svg-diagram-block'),
  replacement: () => '\n\n[Diagram: SVG Drawing]\n\n',
});

turndown.addRule('table', {
  filter: 'table',
  replacement: (_content, node) => {
    const rows = Array.from(node.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    const matrix = rows.map((tr) =>
      Array.from(tr.querySelectorAll('th, td')).map((cell) =>
        (cell.textContent || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
      )
    );

    const colCount = Math.max(...matrix.map((r) => r.length), 1);
    const padRow = (row) => {
      const copy = [...row];
      while (copy.length < colCount) copy.push('');
      return `| ${copy.join(' | ')} |`;
    };

    const header = padRow(matrix[0]);
    const separator = `| ${Array(colCount).fill('---').join(' | ')} |`;
    const body = matrix.slice(1).map(padRow);
    return `\n\n${[header, separator, ...body].join('\n')}\n\n`;
  },
});

export function createEditor({ onChange, onModeChange, onFontsLoaded }) {
  let suppressRichInputHistory = false;
  const workspaceEl = document.getElementById('workspace');
  const wordEl = document.getElementById('word-editor');
  const sourceEl = document.getElementById('source-editor');
  const printSourceEl = document.getElementById('print-source-view');
  const printHeaderEl = document.getElementById('print-doc-header');
  const printFooterEl = document.getElementById('print-doc-footer');
  const toolbarEl = document.querySelector('.format-toolbar');
  const fontSelectEl = document.getElementById('font-family-select');
  const fontSizeSelectEl = document.getElementById('font-size-select');
  const stylesMenuWrapEl = document.getElementById('styles-menu-wrap');
  const stylesMenuBtnEl = document.getElementById('btn-styles-menu');
  const stylesToggleLabelEl = document.getElementById('styles-toggle-label');
  const stylesPopoverEl = document.getElementById('styles-popover');
  const stylesCustomListEl = document.getElementById('styles-custom-list');
  const openStyleEditorBtnEl = document.getElementById('btn-open-style-editor');
  const formatPainterBtnEl = document.getElementById('btn-format-painter');
  const textColorInputEl = document.getElementById('text-color-input');
  const textColorWrapEl = document.getElementById('text-color-wrap');
  const textColorBtnEl = document.getElementById('btn-text-color');
  const textColorPopoverEl = document.getElementById('text-color-popover');
  const textColorAutoBtnEl = document.getElementById('btn-color-auto');
  const highlightColorWrapEl = document.getElementById('highlight-color-wrap');
  const highlightColorBtnEl = document.getElementById('btn-highlight-color');
  const highlightColorPopoverEl = document.getElementById('highlight-color-popover');
  const highlightNoneBtnEl = document.getElementById('btn-highlight-none');
  const highlightSwatchesGridEl = document.getElementById('highlight-swatches-grid');
  const columnsMenuWrapEl = document.getElementById('columns-menu-wrap');
  const columnsMenuBtnEl = document.getElementById('btn-columns-menu');
  const columnsMenuPopoverEl = document.getElementById('columns-menu-popover');
  const colorSwatchesGridEl = document.getElementById('color-swatches-grid');
  const lineSpacingSelectEl = document.getElementById('line-spacing-select');
  const pageMarginsSelectEl = document.getElementById('page-margins-select');
  const tableInsertWrapEl = document.getElementById('table-insert-wrap');
  const tableInsertBtnEl = document.getElementById('btn-insert-table');
  const tablePopoverEl = document.getElementById('table-insert-popover');
  const tableRowsInputEl = document.getElementById('table-rows-input');
  const tableColsInputEl = document.getElementById('table-cols-input');
  const tableConfirmBtnEl = document.getElementById('btn-confirm-table');
  const shapesInsertWrapEl = document.getElementById('shapes-insert-wrap');
  const shapesInsertBtnEl = document.getElementById('btn-insert-shape');
  const shapesPopoverEl = document.getElementById('shapes-popover');
  const imageInsertBtnEl = document.getElementById('btn-insert-image');
  const imageFileInputEl = document.getElementById('image-file-input');
  const pageMenuWrapEl = document.getElementById('page-menu-wrap');
  const pageMenuBtnEl = document.getElementById('btn-page-menu');
  const pageMenuPopoverEl = document.getElementById('page-menu-popover');
  const modeButtons = Array.from(document.querySelectorAll('.mode-btn[data-mode-target]'));
  const warningBannerEl = document.getElementById('format-warning-banner');
  const undoSwitchBtn = document.getElementById('btn-undo-switch');
  const dismissWarningBtn = document.getElementById('btn-dismiss-warning');

  let mode = 'docx';
  let defaultMode = localStorage.getItem('wordflow-default-mode') || 'docx';
  let defaultFont = localStorage.getItem('wordflow-default-font') || 'Georgia';
  let defaultFontSize = localStorage.getItem('wordflow-default-size') || '12pt';
  let defaultLineSpacing = 1.15;
  let pageMarginInches = 1;
  let activeTextColor = '#1a1a1a';
  let availableFonts = [...FALLBACK_FONTS];
  let masterRichHtml = '';
  let lastRenderedSourceText = '';
  let preSwitchRichHtml = null;
  let warnedInLossyMode = false;
  const history = createUndoHistory('');

  function updateUndoRedoButtons() {
    const undoBtn = document.querySelector('.toolbar-group [data-cmd="undo"]');
    const redoBtn = document.querySelector('.toolbar-group [data-cmd="redo"]');
    if (mode === 'docx') {
      if (undoBtn) undoBtn.disabled = !history.canUndo();
      if (redoBtn) redoBtn.disabled = !history.canRedo();
    } else {
      if (undoBtn) undoBtn.disabled = false;
      if (redoBtn) redoBtn.disabled = false;
    }
  }

  function getCleanWordHtml() {
    const clone = wordEl.cloneNode(true);
    clone.querySelectorAll('.shape-wrap-spacer').forEach((el) => el.remove());
    clone.querySelectorAll('[data-pb-spaced]').forEach((el) => {
      el.style.paddingTop = el.dataset.pbOrigPad || '';
      delete el.dataset.pbOrigPad;
      delete el.dataset.pbSpaced;
    });
    return sanitizeHtml(clone.innerHTML);
  }

  function recordRichMutation(opts = {}) {
    masterRichHtml = getCleanWordHtml();
    history.record({
      html: masterRichHtml,
      shapes: pageShapes.getShapes(),
      offset: getCaretCharacterOffset(wordEl),
      inputType: opts.inputType || '',
      data: opts.data || '',
      force: !opts.coalesce,
    });
    updateUndoRedoButtons();
    autoResizeSourceEditor();
    inspectorPane?.refresh?.();
    requestAnimationFrame(() => repositionGrammarHighlights(wordEl));
    onChange?.({ markDirty: true });
  }

  const tableTools = createTableTools({
    wordEl,
    onMutate: () => recordRichMutation(),
  });

  const columnTools = createColumnTools({
    wordEl,
    onMutate: () => recordRichMutation(),
  });

  const pageShapes = createPageShapes({
    wordEl,
    onMutate: (opts) => recordRichMutation(opts),
  });

  const imageTools = createImageTools({
    wordEl,
    fileInputEl: imageFileInputEl,
    pageShapes,
  });

  const pageBreaks = createPageBreaks({
    containerEl: document.querySelector('.document-container'),
    wordEl,
    layerEl: document.getElementById('page-breaks-layer'),
  });

  const findReplace = createFindReplace({
    wordEl,
    sourceEl,
    getMode: () => mode,
    onRichMutate: () => recordRichMutation(),
    onSourceMutate: () => handleSourceInput(),
  });

  const linkTools = createLinkTools({
    wordEl,
    getMode: () => mode,
    onMutate: () => recordRichMutation(),
  });

  const contextMenu = createContextMenu({
    wordEl,
    sourceEl,
    getMode: () => mode,
    execFormatCommand,
    execBlockCommand,
    linkTools,
    onApplyFontFamily: applyFontFamily,
    onApplyFontSize: applyFontSize,
    onApplyTextColor: applyTextColor,
    onApplyHighlightColor: applyHighlightColor,
    onToggleBottomBorder: toggleBottomBorder,
    onFindReplace: () => findReplace.open(false),
    onRichMutate: () => recordRichMutation(),
    onSourceMutate: () => handleSourceInput(),
    onIgnoreGrammarIssue: (issue) => inspectorPane?.ignoreGrammarIssue?.(issue),
    onRefreshGrammar: () => inspectorPane?.refreshGrammar?.(),
  });

  document.getElementById('btn-copy')?.addEventListener('click', () => {
    contextMenu.copySelection();
  });

  document.getElementById('btn-paste')?.addEventListener('click', () => {
    contextMenu.pasteAtSelection();
  });

  const headerFooter = createHeaderFooter({
    workspaceEl,
    layerEl: document.getElementById('page-breaks-layer'),
    sanitizeHtml,
    onChange: (hfState, opts) => {
      pageBreaks.setHeaderFooter(hfState, opts);
      if (!opts?.silent) {
        onChange?.({ markDirty: true });
      }
    },
  });

  function applyHistorySnapshot(snapshot) {
    if (!snapshot) return;
    tableTools.hideMiniToolbar();
    masterRichHtml = snapshot.html;
    wordEl.innerHTML = masterRichHtml;
    hydrateAllDiagrams(wordEl, recordRichMutation);
    pageShapes.setShapes(snapshot.shapes || []);
    pageShapes.syncWrapSpacers();
    wordEl.focus();
    restoreCaretCharacterOffset(wordEl, snapshot.offset);
    updateActiveToolbarStates();
    syncFontSelectFromSelection();
    updateUndoRedoButtons();
    autoResizeSourceEditor();
    inspectorPane?.refresh?.();
    requestAnimationFrame(() => repositionGrammarHighlights(wordEl));
    onChange?.({ markDirty: true });
  }

  function sanitizeHtml(rawHtml) {
    return DOMPurify.sanitize(rawHtml, {
      USE_PROFILES: { html: true, svg: true },
      ADD_ATTR: ['contenteditable', 'tabindex'],
    });
  }

  function renderMarkdownToHtml(md) {
    return sanitizeHtml(marked.parse(md || ''));
  }

  function convertHtmlToMarkdown(html) {
    return turndown.turndown(html || '');
  }

  function showWarningBanner() {
    if (warningBannerEl) {
      warningBannerEl.classList.add('is-visible');
    }
  }

  function hideWarningBanner() {
    if (warningBannerEl) {
      warningBannerEl.classList.remove('is-visible');
    }
  }

  let copiedFormat = null;

  function setFormatPainterActive(active) {
    if (!active) copiedFormat = null;
    formatPainterBtnEl?.classList.toggle('is-active', active);
    formatPainterBtnEl?.setAttribute('aria-pressed', String(active));
    wordEl?.classList.toggle('is-format-painter', active);
    inspectorPane?.refresh?.();
  }

  function captureFormatAtSelection() {
    const { root } = getFormattingTarget();
    const sel = window.getSelection();
    const anchor = sel?.anchorNode;
    const el = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    if (!el || !root.contains(el)) return null;

    const computed = window.getComputedStyle(el);
    const fontFamily = fontSelectEl?.value || extractPrimaryFontName(computed.fontFamily) || defaultFont;
    const fontSize = fontSizeSelectEl?.value || defaultFontSize;
    const color = computed.color || '#1a1a1a';
    const cmdState = (cmd) => {
      try {
        return document.queryCommandState(cmd);
      } catch {
        return false;
      }
    };
    return {
      fontFamily,
      fontSize,
      color,
      bold: cmdState('bold'),
      italic: cmdState('italic'),
      underline: cmdState('underline'),
      strikeThrough: cmdState('strikeThrough'),
    };
  }

  function applyCopiedFormatToSelection() {
    if (!copiedFormat || mode !== 'docx') return;
    const fmt = copiedFormat;
    setFormatPainterActive(false);

    if (fmt.fontFamily) applyFontFamily(fmt.fontFamily);
    if (fmt.fontSize) applyFontSize(fmt.fontSize);
    if (fmt.color) applyTextColor(fmt.color);

    ['bold', 'italic', 'underline', 'strikeThrough'].forEach((cmd) => {
      try {
        if (document.queryCommandState(cmd) !== Boolean(fmt[cmd])) {
          document.execCommand(cmd, false, null);
        }
      } catch {
        // Ignore unsupported state queries
      }
    });

    recordRichMutation();
    updateActiveToolbarStates();
  }

  function closeColorPopover() {
    if (textColorPopoverEl) {
      textColorPopoverEl.classList.remove('is-open');
    }
    if (textColorBtnEl) {
      textColorBtnEl.setAttribute('aria-expanded', 'false');
    }
  }

  function closeHighlightPopover() {
    if (highlightColorPopoverEl) {
      highlightColorPopoverEl.classList.remove('is-open');
    }
    if (highlightColorBtnEl) {
      highlightColorBtnEl.setAttribute('aria-expanded', 'false');
    }
  }

  function closeStylesPopover() {
    if (stylesPopoverEl) {
      stylesPopoverEl.classList.remove('is-open');
    }
    if (stylesMenuBtnEl) {
      stylesMenuBtnEl.setAttribute('aria-expanded', 'false');
    }
  }

  function syncStylesPreviewFont(fontName) {
    const resolved = fontName || fontSelectEl?.value || defaultFont || 'Georgia';
    if (stylesMenuWrapEl) {
      stylesMenuWrapEl.style.setProperty('--active-style-font', `"${resolved}", sans-serif`);
    }
  }

  let styleEditorModal = null;

  function renderToolbarCustomStyles() {
    if (!stylesCustomListEl) return;
    const styles = styleEditorModal?.getCustomStyles() || [];
    stylesCustomListEl.innerHTML = '';
    styles.forEach((style) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'style-preview-item is-custom-style';
      btn.dataset.customStyleId = style.id;
      btn.setAttribute('role', 'menuitem');
      btn.textContent = style.name;

      const decorations = [];
      if (style.underline) decorations.push('underline');
      if (style.strikethrough) decorations.push('line-through');

      btn.style.setProperty('--custom-style-font', `"${style.fontFamily || defaultFont}", Georgia, serif`);
      btn.style.setProperty('--custom-style-size', style.fontSize || '12pt');
      btn.style.setProperty('--custom-style-color', style.color || 'var(--chrome-text)');
      btn.style.setProperty('--custom-style-weight', style.bold ? '700' : '400');
      btn.style.setProperty('--custom-style-italic', style.italic ? 'italic' : 'normal');
      btn.style.setProperty(
        '--custom-style-decoration',
        decorations.length ? decorations.join(' ') : 'none'
      );
      stylesCustomListEl.appendChild(btn);
    });
  }

  function applyCustomStyle(style) {
    if (!style || mode !== 'docx') return;
    const { root } = getFormattingTarget();
    root.focus();

    if (style.block) {
      execBlockCommand(style.block);
    }

    const sel = window.getSelection();
    const activeBlock = getActiveBlockElement();
    let collapsedAfter = false;
    if (sel && sel.isCollapsed && activeBlock && root.contains(activeBlock)) {
      const range = document.createRange();
      range.selectNodeContents(activeBlock);
      sel.removeAllRanges();
      sel.addRange(range);
      collapsedAfter = true;
    }

    if (style.fontFamily) applyFontFamily(style.fontFamily);
    if (style.fontSize) applyFontSize(style.fontSize);
    applyTextColor(style.color || '#1a1a1a');

    const toggleCmds = [
      ['bold', Boolean(style.bold)],
      ['italic', Boolean(style.italic)],
      ['underline', Boolean(style.underline)],
      ['strikeThrough', Boolean(style.strikethrough)],
    ];
    toggleCmds.forEach(([cmd, want]) => {
      try {
        if (document.queryCommandState(cmd) !== want) {
          document.execCommand(cmd, false, null);
        }
      } catch {
        // Ignore unsupported state queries
      }
    });

    const alignCmdMap = {
      left: 'justifyLeft',
      center: 'justifyCenter',
      right: 'justifyRight',
      justify: 'justifyFull',
    };
    const alignCmd = alignCmdMap[style.align || 'left'];
    if (alignCmd) {
      document.execCommand(alignCmd, false, null);
    }

    if (collapsedAfter && sel && sel.rangeCount > 0) {
      sel.collapseToEnd();
    }

    const finalBlock = getActiveBlockElement();
    if (finalBlock) {
      finalBlock.dataset.customStyle = style.id;
    }

    if (stylesToggleLabelEl) {
      stylesToggleLabelEl.textContent = style.name;
    }
    recordRichMutation();
    updateActiveToolbarStates();
  }

  function updateToolbarAvailability() {
    const appShellEl = document.querySelector('.app-shell');
    if (appShellEl) appShellEl.dataset.mode = mode;
    toolbarEl.dataset.mode = mode;
    const richControls = document.querySelectorAll(
      '.toolbar-group[data-rich-only="true"] .fmt-btn, .toolbar-group[data-rich-only="true"] .fmt-select, .toolbar-group[data-rich-only="true"] .color-input-hidden'
    );
    const isRichMode = mode === 'docx';
    richControls.forEach((control) => {
      control.disabled = !isRichMode;
    });
    if (!isRichMode) {
      setFormatPainterActive(false);
      closeColorPopover();
      closeHighlightPopover();
      closeStylesPopover();
      if (tablePopoverEl) tablePopoverEl.classList.remove('is-open');
      if (shapesPopoverEl) shapesPopoverEl.classList.remove('is-open');
      if (pageMenuPopoverEl) {
        pageMenuPopoverEl.classList.remove('is-open');
        pageMenuBtnEl?.setAttribute('aria-expanded', 'false');
      }
      if (columnsMenuPopoverEl) {
        columnsMenuPopoverEl.classList.remove('is-open');
        columnsMenuBtnEl?.setAttribute('aria-expanded', 'false');
      }
      linkTools.close();
      pageShapes.setMarqueeMode(false);
      tableTools.hideMiniToolbar();
      pageShapes.deselect();
    }
  }

  function getFormattingTarget() {
    const activeHf = headerFooter.getActiveEl();
    if (activeHf) {
      return { root: activeHf, isShapeLabel: false, isHeaderFooter: true };
    }
    const activeLabel = pageShapes.getActiveLabelEl();
    if (activeLabel) {
      const sel = window.getSelection();
      const isInLabel =
        document.activeElement === activeLabel ||
        activeLabel.contains(document.activeElement) ||
        (sel && sel.rangeCount > 0 && activeLabel.contains(sel.anchorNode));
      if (isInLabel || document.activeElement !== wordEl) {
        return { root: activeLabel, isShapeLabel: true, isHeaderFooter: false };
      }
    }
    return { root: wordEl, isShapeLabel: false, isHeaderFooter: false };
  }

  function getActiveBlockElement() {
    const { root } = getFormattingTarget();
    const sel = window.getSelection();
    let node = sel?.anchorNode;
    if (!node || !root.contains(node)) return null;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    while (node && node !== root) {
      const tag = node.tagName?.toUpperCase();
      if (['H1', 'H2', 'H3', 'H4', 'P', 'BLOCKQUOTE', 'PRE', 'DIV', 'LI'].includes(tag)) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function getActiveJustifyValue() {
    const { root, isShapeLabel } = getFormattingTarget();
    const sel = window.getSelection();
    const block = getActiveBlockElement();
    const target = block || (isShapeLabel ? root : null);
    if (!target) {
      const anchor = sel?.anchorNode;
      const el = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
      if (el && root.contains(el)) {
        const raw = window.getComputedStyle(el).textAlign;
        return raw === 'start' ? 'left' : raw;
      }
      return '';
    }
    const raw = target.style.textAlign || window.getComputedStyle(target).textAlign;
    return raw === 'start' ? 'left' : raw;
  }

  function updateActiveToolbarStates() {
    if (mode !== 'docx') return;
    const cmds = [
      'bold',
      'italic',
      'underline',
      'strikeThrough',
      'superscript',
      'subscript',
      'insertUnorderedList',
      'insertOrderedList',
    ];
    cmds.forEach((cmd) => {
      const btn = document.querySelector(`.toolbar-group [data-cmd="${cmd}"]`);
      if (btn) {
        try {
          btn.classList.toggle('is-active', document.queryCommandState(cmd));
        } catch {
          btn.classList.remove('is-active');
        }
      }
    });

    const activeJustify = getActiveJustifyValue();
    Object.entries(JUSTIFY_MAP).forEach(([cmd, alignVal]) => {
      const btn = document.querySelector(`.toolbar-group [data-cmd="${cmd}"]`);
      if (btn) {
        let isActive = activeJustify === alignVal;
        if (!activeJustify) {
          try {
            isActive = document.queryCommandState(cmd);
          } catch {
            isActive = false;
          }
        }
        btn.classList.toggle('is-active', isActive);
      }
    });

    const activeBlockEl = getActiveBlockElement();
    const activeTag = activeBlockEl?.tagName?.toUpperCase() || '';
    const activeCustomStyleId = activeBlockEl?.dataset?.customStyle || '';
    const activeCustomStyle = activeCustomStyleId
      ? styleEditorModal?.getCustomStyles().find((s) => s.id === activeCustomStyleId)
      : null;

    document.querySelectorAll('.toolbar-group [data-block]').forEach((btn) => {
      btn.classList.toggle('is-active', !activeCustomStyle && btn.dataset.block === activeTag);
    });

    const STYLE_LABELS = {
      P: 'Paragraph',
      H1: 'Heading 1',
      H2: 'Heading 2',
      H3: 'Heading 3',
    };
    const resolvedStyleTag = STYLE_LABELS[activeTag] ? activeTag : 'P';
    if (stylesToggleLabelEl) {
      stylesToggleLabelEl.textContent = activeCustomStyle
        ? activeCustomStyle.name
        : STYLE_LABELS[resolvedStyleTag];
    }
    if (stylesPopoverEl) {
      stylesPopoverEl.querySelectorAll('[data-block]').forEach((item) => {
        item.classList.toggle('is-active', !activeCustomStyle && item.dataset.block === resolvedStyleTag);
      });
      stylesPopoverEl.querySelectorAll('[data-custom-style-id]').forEach((item) => {
        item.classList.toggle('is-active', Boolean(activeCustomStyle) && item.dataset.customStyleId === activeCustomStyle.id);
      });
    }

    const hasBottomBorder = getActiveBlockElement()?.dataset?.bottomBorder === 'true';
    document.querySelectorAll('.toolbar-group [data-action="bottom-border"]').forEach((btn) => {
      btn.classList.toggle('is-active', hasBottomBorder);
    });
  }

  function syncFontSelectFromSelection() {
    if (mode !== 'docx') return;
    const { root } = getFormattingTarget();
    const sel = window.getSelection();
    const anchor = sel?.anchorNode;
    const el = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const inRoot = Boolean(el && root.contains(el));

    if (fontSelectEl) {
      let detected = '';
      try {
        detected = extractPrimaryFontName(document.queryCommandValue('fontName'));
      } catch {
        detected = '';
      }

      if (!detected && inRoot) {
        detected = extractPrimaryFontName(window.getComputedStyle(el).fontFamily);
      }

      const target = detected || defaultFont;
      const match = availableFonts.find((f) => f.toLowerCase() === target.toLowerCase());
      if (match) {
        fontSelectEl.value = match;
      }
      syncStylesPreviewFont(match || target);
    }

    if (fontSizeSelectEl) {
      let detectedPt = null;
      if (inRoot) {
        let cur = el;
        while (cur && cur !== root) {
          const inlineSize = cur.style?.fontSize;
          if (inlineSize) {
            if (inlineSize.endsWith('pt')) {
              detectedPt = Math.round(parseFloat(inlineSize));
              break;
            }
            if (inlineSize.endsWith('px')) {
              detectedPt = Math.round((parseFloat(inlineSize) * 72) / 96);
              break;
            }
          }
          cur = cur.parentElement;
        }
        if (detectedPt === null) {
          const heading = el.closest?.('h1, h2, h3, h4');
          if (heading && root.contains(heading)) {
            const px = parseFloat(window.getComputedStyle(heading).fontSize);
            if (!Number.isNaN(px)) {
              detectedPt = Math.round(((px / 1.07) * 72) / 96);
            }
          }
        }
      }

      const targetPt = detectedPt ?? parseFloat(defaultFontSize);
      const options = Array.from(fontSizeSelectEl.options);
      const exact = options.find((opt) => parseFloat(opt.value) === targetPt);
      if (exact) {
        fontSizeSelectEl.value = exact.value;
      } else if (options.length > 0 && !Number.isNaN(targetPt)) {
        let closest = options[0];
        let minDiff = Math.abs(parseFloat(closest.value) - targetPt);
        for (const opt of options) {
          const diff = Math.abs(parseFloat(opt.value) - targetPt);
          if (diff < minDiff) {
            minDiff = diff;
            closest = opt;
          }
        }
        fontSizeSelectEl.value = closest.value;
      }
    }
  }

  function applyFontFamily(fontName) {
    if (!fontName || mode !== 'docx') return;

    const { root, isShapeLabel, isHeaderFooter } = getFormattingTarget();
    const sel = window.getSelection();
    const hasSelection =
      sel &&
      sel.rangeCount > 0 &&
      !sel.isCollapsed &&
      root.contains(sel.anchorNode);

    if (isHeaderFooter) {
      root.focus({ preventScroll: true });
      if (!hasSelection && root.textContent.trim().length > 0) {
        const range = document.createRange();
        range.selectNodeContents(root);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      const savedOffsets = getSelectionOffsets(root);
      document.execCommand('fontName', false, fontName);
      restoreSelectionOffsets(root, savedOffsets);
      headerFooter.syncFromDom();
      return;
    }

    if (isShapeLabel) {
      if (hasSelection) {
        const savedOffsets = getSelectionOffsets(root);
        root.focus({ preventScroll: true });
        document.execCommand('fontName', false, fontName);
        restoreSelectionOffsets(root, savedOffsets);
        pageShapes.syncActiveLabel();
      } else {
        pageShapes.applyLabelStyle('fontFamily', `"${fontName}", sans-serif`);
      }
      return;
    }

    if (hasSelection) {
      const savedOffsets = getSelectionOffsets(wordEl);
      wordEl.focus({ preventScroll: true });
      document.execCommand('fontName', false, fontName);
      restoreSelectionOffsets(wordEl, savedOffsets);
      masterRichHtml = sanitizeHtml(wordEl.innerHTML);
      history.record({
        html: masterRichHtml,
        offset: getCaretCharacterOffset(wordEl),
        force: true,
      });
      updateUndoRedoButtons();
    } else {
      defaultFont = fontName;
      wordEl.style.setProperty('--doc-font', `"${fontName}", Georgia, serif`);
      wordEl.focus();
    }

    autoResizeSourceEditor();
    inspectorPane?.refresh?.();
    onChange?.({ markDirty: true });
  }

  function applyFontSize(sizePt) {
    if (!sizePt || mode !== 'docx') return;

    const { root, isShapeLabel, isHeaderFooter } = getFormattingTarget();
    const sel = window.getSelection();
    const hasSelection =
      sel &&
      sel.rangeCount > 0 &&
      !sel.isCollapsed &&
      root.contains(sel.anchorNode);

    if (isHeaderFooter) {
      root.focus({ preventScroll: true });
      if (!hasSelection && root.textContent.trim().length > 0) {
        const range = document.createRange();
        range.selectNodeContents(root);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      const savedOffsets = getSelectionOffsets(root);
      document.execCommand('fontSize', false, '7');
      root.querySelectorAll('font[size="7"]').forEach((fontEl) => {
        const span = document.createElement('span');
        span.style.fontSize = sizePt;
        span.innerHTML = fontEl.innerHTML;
        fontEl.replaceWith(span);
      });
      restoreSelectionOffsets(root, savedOffsets);
      headerFooter.syncFromDom();
      return;
    }

    if (isShapeLabel) {
      if (hasSelection) {
        const savedOffsets = getSelectionOffsets(root);
        root.focus({ preventScroll: true });
        document.execCommand('fontSize', false, '7');
        root.querySelectorAll('font[size="7"]').forEach((fontEl) => {
          const span = document.createElement('span');
          span.style.fontSize = sizePt;
          span.innerHTML = fontEl.innerHTML;
          fontEl.replaceWith(span);
        });
        restoreSelectionOffsets(root, savedOffsets);
        pageShapes.syncActiveLabel();
      } else {
        pageShapes.applyLabelStyle('fontSize', sizePt);
      }
      return;
    }

    if (hasSelection) {
      const savedOffsets = getSelectionOffsets(wordEl);
      wordEl.focus({ preventScroll: true });
      try {
        suppressRichInputHistory = true;
        document.execCommand('fontSize', false, '7');
        wordEl.querySelectorAll('font[size="7"]').forEach((fontEl) => {
          const span = document.createElement('span');
          span.style.fontSize = sizePt;
          span.innerHTML = fontEl.innerHTML;
          fontEl.replaceWith(span);
        });
      } finally {
        suppressRichInputHistory = false;
      }
      restoreSelectionOffsets(wordEl, savedOffsets);
      masterRichHtml = sanitizeHtml(wordEl.innerHTML);
      history.record({
        html: masterRichHtml,
        offset: getCaretCharacterOffset(wordEl),
        force: true,
      });
      updateUndoRedoButtons();
    } else {
      defaultFontSize = sizePt;
      wordEl.style.setProperty('--doc-font-size', sizePt);
      wordEl.focus();
    }

    autoResizeSourceEditor();
    inspectorPane?.refresh?.();
    onChange?.({ markDirty: true });
  }

  function syncUnderlineColorWithFont(root) {
    if (!root) return;
    root.querySelectorAll('u').forEach((uEl) => {
      const hasColoredDescendant = uEl.querySelector('font[color], [style*="color"]');
      if (!hasColoredDescendant) return;

      const children = Array.from(uEl.childNodes);
      const hasDirectColorEl = children.some(
        (node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          ((node.tagName === 'FONT' && node.hasAttribute('color')) ||
            (node.style && node.style.color))
      );

      if (hasDirectColorEl) {
        const frag = document.createDocumentFragment();
        children.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && node.textContent === '') return;
          const isColorEl =
            node.nodeType === Node.ELEMENT_NODE &&
            ((node.tagName === 'FONT' && node.hasAttribute('color')) ||
              (node.style && node.style.color));
          if (isColorEl) {
            const colorClone = node.cloneNode(false);
            const innerU = document.createElement('u');
            while (node.firstChild) {
              innerU.appendChild(node.firstChild);
            }
            colorClone.appendChild(innerU);
            frag.appendChild(colorClone);
          } else {
            const wrappedU = document.createElement('u');
            wrappedU.appendChild(node);
            frag.appendChild(wrappedU);
          }
        });
        uEl.replaceWith(frag);
      } else {
        const color =
          hasColoredDescendant.getAttribute('color') || hasColoredDescendant.style?.color;
        if (color) {
          uEl.style.textDecorationColor = color;
        }
      }
    });
  }

  function applyHighlightColor(hex) {
    if (mode !== 'docx') return;
    if (highlightColorWrapEl) {
      highlightColorWrapEl.style.setProperty('--active-highlight-color', hex || 'transparent');
    }
    const { root, isShapeLabel } = getFormattingTarget();
    if (!isShapeLabel && document.activeElement !== root) {
      root.focus({ preventScroll: true });
    }
    const value = hex || 'transparent';
    let applied = false;
    try {
      applied = document.execCommand('hiliteColor', false, value);
    } catch {
      applied = false;
    }
    if (!applied) {
      try {
        document.execCommand('backColor', false, value);
      } catch {
        // Ignore unsupported highlight command
      }
    }
    if (isShapeLabel) {
      pageShapes.syncActiveLabel();
      return;
    }
    recordRichMutation();
  }

  function applyTextColor(hex) {
    if (!hex || mode !== 'docx') return;
    activeTextColor = hex;
    if (textColorWrapEl) {
      textColorWrapEl.style.setProperty('--active-text-color', hex);
    }
    if (textColorInputEl) {
      textColorInputEl.value = hex;
    }

    const { root, isShapeLabel, isHeaderFooter } = getFormattingTarget();
    if (isHeaderFooter) {
      const sel = window.getSelection();
      const hasSelection =
        sel &&
        sel.rangeCount > 0 &&
        !sel.isCollapsed &&
        root.contains(sel.anchorNode);
      root.focus({ preventScroll: true });
      if (!hasSelection && root.textContent.trim().length > 0) {
        const range = document.createRange();
        range.selectNodeContents(root);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      const savedOffsets = getSelectionOffsets(root);
      document.execCommand('foreColor', false, hex);
      syncUnderlineColorWithFont(root);
      restoreSelectionOffsets(root, savedOffsets);
      headerFooter.syncFromDom();
      return;
    }

    if (isShapeLabel) {
      const sel = window.getSelection();
      const hasSelection =
        sel &&
        sel.rangeCount > 0 &&
        !sel.isCollapsed &&
        root.contains(sel.anchorNode);
      if (hasSelection) {
        const savedOffsets = getSelectionOffsets(root);
        root.focus({ preventScroll: true });
        document.execCommand('foreColor', false, hex);
        syncUnderlineColorWithFont(root);
        restoreSelectionOffsets(root, savedOffsets);
        pageShapes.syncActiveLabel();
      } else {
        pageShapes.applyLabelStyle('color', hex);
      }
      return;
    }

    const savedOffsets = getSelectionOffsets(wordEl);
    wordEl.focus({ preventScroll: true });
    document.execCommand('foreColor', false, hex);
    syncUnderlineColorWithFont(wordEl);
    restoreSelectionOffsets(wordEl, savedOffsets);
    masterRichHtml = sanitizeHtml(wordEl.innerHTML);
    history.record({
      html: masterRichHtml,
      offset: getCaretCharacterOffset(wordEl),
      force: true,
    });
    updateUndoRedoButtons();
    autoResizeSourceEditor();
    inspectorPane?.refresh?.();
    requestAnimationFrame(() => repositionGrammarHighlights(wordEl));
    onChange?.({ markDirty: true });
  }

  function applyLineSpacing(multiplierStr) {
    const multiplier = Number(multiplierStr);
    if (!multiplier || mode !== 'docx') return;

    const { isShapeLabel } = getFormattingTarget();
    if (isShapeLabel) {
      pageShapes.applyLabelStyle('lineHeight', String(multiplier));
      return;
    }

    const sel = window.getSelection();
    const hasSelection =
      sel &&
      sel.rangeCount > 0 &&
      !sel.isCollapsed &&
      wordEl.contains(sel.anchorNode);

    if (hasSelection) {
      const savedOffsets = getSelectionOffsets(wordEl);
      const blocks = wordEl.querySelectorAll('p, h1, h2, h3, h4, blockquote, li');
      let updatedAny = false;
      blocks.forEach((block) => {
        if (sel.containsNode(block, true)) {
          block.style.lineHeight = String(multiplier);
          updatedAny = true;
        }
      });
      if (updatedAny) {
        wordEl.focus({ preventScroll: true });
        restoreSelectionOffsets(wordEl, savedOffsets);
        masterRichHtml = sanitizeHtml(wordEl.innerHTML);
        history.record({
          html: masterRichHtml,
          offset: getCaretCharacterOffset(wordEl),
          force: true,
        });
        updateUndoRedoButtons();
      }
    } else {
      defaultLineSpacing = multiplier;
      wordEl.style.setProperty('--doc-line-height', String(multiplier));
    }

    autoResizeSourceEditor();
    inspectorPane?.refresh?.();
    onChange?.({ markDirty: true });
  }

  function applyPageMargins(inchesStr) {
    const inches = Number(inchesStr);
    if (!inches || mode !== 'docx') return;
    pageMarginInches = inches;
    wordEl.style.setProperty('--doc-margin', `${inches}in`);
    pageBreaks.sync();
    onChange?.({ markDirty: true });
  }

  async function loadSystemFonts() {
    if (!fontSelectEl) return;
    let fonts = FALLBACK_FONTS;
    try {
      const systemFonts = await invoke('get_system_fonts');
      if (Array.isArray(systemFonts) && systemFonts.length > 0) {
        fonts = systemFonts;
      }
    } catch {
      fonts = FALLBACK_FONTS;
    }

    availableFonts = fonts;
    fontSelectEl.innerHTML = '';

    fonts.forEach((fontName) => {
      const option = document.createElement('option');
      option.value = fontName;
      option.textContent = fontName;
      option.style.fontFamily = `"${fontName}", sans-serif`;
      fontSelectEl.appendChild(option);
    });

    const initial =
      fonts.find((f) => f.toLowerCase() === defaultFont.toLowerCase()) || fonts[0];
    if (initial) {
      defaultFont = initial;
      fontSelectEl.value = initial;
      document.documentElement.style.setProperty('--doc-font', `"${initial}", Georgia, serif`);
      wordEl.style.setProperty('--doc-font', `"${initial}", Georgia, serif`);
      syncStylesPreviewFont(initial);
    }
    onFontsLoaded?.(fonts);
  }

  let isResizingSource = false;

  function autoResizeSourceEditor() {
    if (!sourceEl || mode === 'docx' || isResizingSource) return;
    if (sourceEl.clientWidth === 0) {
      requestAnimationFrame(() => autoResizeSourceEditor());
      return;
    }
    isResizingSource = true;
    try {
      sourceEl.style.height = 'auto';
      const cs = getComputedStyle(sourceEl);
      const borderH = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
      sourceEl.style.height = `${sourceEl.scrollHeight + borderH}px`;
    } finally {
      isResizingSource = false;
    }
  }

  function renderActiveModeView() {
    if (mode === 'docx') {
      wordEl.innerHTML = masterRichHtml;
      hydrateAllDiagrams(wordEl, recordRichMutation);
      pageShapes.syncWrapSpacers();
      pageBreaks.sync();
    } else if (mode === 'md') {
      sourceEl.value = convertHtmlToMarkdown(masterRichHtml);
      sourceEl.placeholder = '# Start writing Markdown...';
      lastRenderedSourceText = sourceEl.value;
      autoResizeSourceEditor();
    } else if (mode === 'html') {
      sourceEl.value = formatHtmlPretty(masterRichHtml);
      sourceEl.placeholder = '<p>Start writing HTML...</p>';
      lastRenderedSourceText = sourceEl.value;
      autoResizeSourceEditor();
    } else if (mode === 'txt') {
      sourceEl.value = htmlToPlainText(masterRichHtml);
      sourceEl.placeholder = 'Start writing plain text...';
      lastRenderedSourceText = sourceEl.value;
      autoResizeSourceEditor();
    }
  }

  function syncMasterHtmlFromActiveMode() {
    if (mode === 'docx') {
      masterRichHtml = getCleanWordHtml();
    } else if (sourceEl.value !== lastRenderedSourceText) {
      if (mode === 'md') {
        masterRichHtml = renderMarkdownToHtml(sourceEl.value);
      } else if (mode === 'html') {
        masterRichHtml = sanitizeHtml(sourceEl.value);
      } else if (mode === 'txt') {
        masterRichHtml = plainTextToHtml(sourceEl.value);
      }
      lastRenderedSourceText = sourceEl.value;
    }
  }

  function setMode(nextMode, { syncCurrent = true } = {}) {
    if (!MODE_ORDER.includes(nextMode) || nextMode === mode) return;

    if (syncCurrent) {
      syncMasterHtmlFromActiveMode();
    }

    if (nextMode === 'md' || nextMode === 'txt') {
      if (preSwitchRichHtml === null && hasRichFormatting(masterRichHtml)) {
        preSwitchRichHtml = masterRichHtml;
      }
      warnedInLossyMode = false;
    } else {
      preSwitchRichHtml = null;
      warnedInLossyMode = false;
      hideWarningBanner();
    }

    mode = nextMode;
    workspaceEl.dataset.mode = mode;

    modeButtons.forEach((btn) => {
      const active = btn.dataset.modeTarget === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    renderActiveModeView();
    if (mode === 'docx') {
      history.record({ html: masterRichHtml, offset: 0, force: true });
    }
    updateToolbarAvailability();
    updateUndoRedoButtons();
    inspectorPane?.refreshGrammar?.();
    onModeChange?.(mode);
    onChange?.({ markDirty: false });
  }

  function toggleMode() {
    const idx = MODE_ORDER.indexOf(mode);
    const next = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
    setMode(next);
  }

  function toggleBottomBorder() {
    if (mode !== 'docx') return;
    wordEl.focus({ preventScroll: true });
    const sel = window.getSelection();
    const blocks = Array.from(wordEl.querySelectorAll('p, h1, h2, h3, h4, blockquote, pre, li, div')).filter(
      (block) => sel && sel.rangeCount > 0 && sel.containsNode(block, true)
    );
    const targets = blocks.length > 0 ? blocks : [getActiveBlockElement()].filter(Boolean);
    if (targets.length === 0) return;

    const allHaveBorder = targets.every((b) => b.dataset.bottomBorder === 'true');
    targets.forEach((b) => {
      if (allHaveBorder) {
        b.removeAttribute('data-bottom-border');
      } else {
        b.dataset.bottomBorder = 'true';
      }
    });
    recordRichMutation();
    updateActiveToolbarStates();
  }

  function execFormatCommand(cmd) {
    if (mode !== 'docx') {
      if (cmd === 'undo' || cmd === 'redo') {
        sourceEl.focus();
        document.execCommand(cmd);
        handleSourceInput();
      }
      return;
    }

    if (cmd === 'undo') {
      applyHistorySnapshot(history.undo());
      return;
    }

    if (cmd === 'redo') {
      applyHistorySnapshot(history.redo());
      return;
    }

    const { root, isShapeLabel, isHeaderFooter } = getFormattingTarget();
    const justifyAlign = JUSTIFY_MAP[cmd];

    if (isHeaderFooter) {
      if (document.activeElement !== root) {
        root.focus({ preventScroll: true });
      }
      document.execCommand(cmd, false, null);
      headerFooter.syncFromDom();
      updateActiveToolbarStates();
      return;
    }

    if (isShapeLabel) {
      if (justifyAlign) {
        pageShapes.applyLabelStyle('textAlign', justifyAlign);
        if (root.isContentEditable) {
          root.focus({ preventScroll: true });
          document.execCommand(cmd, false, null);
          pageShapes.syncActiveLabel();
        }
        updateActiveToolbarStates();
        return;
      }
      if (document.activeElement !== root) {
        root.focus({ preventScroll: true });
      }
      document.execCommand(cmd, false, null);
      pageShapes.syncActiveLabel();
      updateActiveToolbarStates();
      return;
    }

    wordEl.focus();
    document.execCommand(cmd, false, null);
    if (justifyAlign) {
      const sel = window.getSelection();
      const blocks = wordEl.querySelectorAll('p, h1, h2, h3, h4, blockquote, pre, li, div');
      let updated = false;
      blocks.forEach((block) => {
        if (sel && sel.rangeCount > 0 && sel.containsNode(block, true)) {
          block.removeAttribute('align');
          block.style.textAlign = justifyAlign;
          updated = true;
        }
      });
      if (!updated) {
        const activeBlock = getActiveBlockElement();
        if (activeBlock) {
          activeBlock.removeAttribute('align');
          activeBlock.style.textAlign = justifyAlign;
        }
      }
    } else if (cmd === 'removeFormat') {
      const sel = window.getSelection();
      const blocks = wordEl.querySelectorAll('p, h1, h2, h3, h4, blockquote, pre, li, div');
      blocks.forEach((block) => {
        if (sel && sel.rangeCount > 0 && sel.containsNode(block, true)) {
          block.removeAttribute('align');
          block.style.textAlign = '';
        }
      });
    }
    masterRichHtml = sanitizeHtml(wordEl.innerHTML);
    history.record({
      html: masterRichHtml,
      offset: getCaretCharacterOffset(wordEl),
      force: true,
    });
    updateActiveToolbarStates();
    updateUndoRedoButtons();
    autoResizeSourceEditor();
    inspectorPane?.refresh?.();
    requestAnimationFrame(() => repositionGrammarHighlights(wordEl));
    onChange?.({ markDirty: true });
  }

  function exitSpecialBlock(block) {
    const sel = window.getSelection();
    const isEmpty = block.textContent.trim() === '';
    let atEnd = false;

    if (!isEmpty && sel && sel.rangeCount > 0 && sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const afterRange = range.cloneRange();
      afterRange.selectNodeContents(block);
      afterRange.setStart(range.endContainer, range.endOffset);
      atEnd = afterRange.toString().trim().length === 0;
    }

    const p = document.createElement('p');
    if (isEmpty) {
      p.innerHTML = '<br>';
      block.replaceWith(p);
    } else if (atEnd) {
      p.innerHTML = '<br>';
      block.after(p);
    } else {
      const text = block.textContent || '';
      if (block.tagName.toUpperCase() === 'PRE') {
        const lines = text.split('\n');
        const fragment = document.createDocumentFragment();
        let firstP = null;
        lines.forEach((line) => {
          const lineP = document.createElement('p');
          if (line.trim() === '') {
            lineP.innerHTML = '<br>';
          } else {
            lineP.textContent = line;
          }
          if (!firstP) firstP = lineP;
          fragment.appendChild(lineP);
        });
        block.replaceWith(fragment);
        if (firstP && sel) {
          const newRange = document.createRange();
          newRange.selectNodeContents(firstP);
          newRange.collapse(false);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
        return;
      }
      p.innerHTML = block.innerHTML || '<br>';
      block.replaceWith(p);
    }

    if (sel) {
      const newRange = document.createRange();
      newRange.setStart(p, 0);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  }

  function execBlockCommand(tag) {
    if (mode !== 'docx') return;
    const { root, isShapeLabel, isHeaderFooter } = getFormattingTarget();
    if ((isShapeLabel || isHeaderFooter) && document.activeElement !== root) {
      root.focus({ preventScroll: true });
    } else if (!isShapeLabel && !isHeaderFooter) {
      wordEl.focus();
    }

    if (isHeaderFooter) {
      const targetTag = tag.toLowerCase();
      const activeBlock = getActiveBlockElement();
      const newBlock = document.createElement(targetTag);
      if (activeBlock && root.contains(activeBlock) && activeBlock !== root) {
        newBlock.innerHTML = activeBlock.innerHTML || '<br>';
        if (activeBlock.style.cssText) {
          newBlock.style.cssText = activeBlock.style.cssText;
          newBlock.style.fontSize = '';
        }
        activeBlock.replaceWith(newBlock);
      } else {
        newBlock.innerHTML = root.innerHTML || '<br>';
        root.innerHTML = '';
        root.appendChild(newBlock);
      }
      newBlock.querySelectorAll('[style]').forEach((el) => {
        el.style.fontSize = '';
      });
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(newBlock);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      headerFooter.syncFromDom();
      updateActiveToolbarStates();
      return;
    }

    const activeBlock = getActiveBlockElement();
    const activeTag = activeBlock?.tagName?.toUpperCase();

    if (
      activeBlock &&
      (activeTag === 'BLOCKQUOTE' || activeTag === 'PRE') &&
      (tag === 'P' || activeTag === tag)
    ) {
      exitSpecialBlock(activeBlock);
    } else {
      document.execCommand('formatBlock', false, `<${tag}>`);
    }

    const updatedBlock = getActiveBlockElement();
    if (updatedBlock?.dataset?.customStyle) {
      delete updatedBlock.dataset.customStyle;
    }

    if (isShapeLabel) {
      pageShapes.syncActiveLabel();
      updateActiveToolbarStates();
      return;
    }

    masterRichHtml = sanitizeHtml(wordEl.innerHTML);
    history.record({
      html: masterRichHtml,
      offset: getCaretCharacterOffset(wordEl),
      force: true,
    });
    updateActiveToolbarStates();
    updateUndoRedoButtons();
    autoResizeSourceEditor();
    inspectorPane?.refresh?.();
    requestAnimationFrame(() => repositionGrammarHighlights(wordEl));
    onChange?.({ markDirty: true });
  }

  function handleWordEnterExit(event) {
    if (event.key !== 'Enter' || event.shiftKey || mode !== 'docx') return;
    const block = getActiveBlockElement();
    if (!block) return;
    const tag = block.tagName.toUpperCase();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const isHeadingOrCustom =
      tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || Boolean(block.dataset?.customStyle);
    if (isHeadingOrCustom && sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const afterRange = range.cloneRange();
      afterRange.selectNodeContents(block);
      afterRange.setStart(range.endContainer, range.endOffset);
      if (afterRange.toString().length === 0) {
        event.preventDefault();
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        block.after(p);
        const newRange = document.createRange();
        newRange.setStart(p, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        recordRichMutation();
        updateActiveToolbarStates();
        syncFontSelectFromSelection();
        return;
      }
    }

    if (tag !== 'BLOCKQUOTE' && tag !== 'PRE') return;

    const isBlockEmpty = block.textContent.trim() === '';
    let shouldExit = isBlockEmpty;

    if (!shouldExit && tag === 'PRE') {
      const range = sel.getRangeAt(0);
      const afterRange = range.cloneRange();
      afterRange.selectNodeContents(block);
      afterRange.setStart(range.endContainer, range.endOffset);
      const atEnd = afterRange.toString().length === 0;

      const beforeRange = range.cloneRange();
      beforeRange.selectNodeContents(block);
      beforeRange.setEnd(range.startContainer, range.startOffset);
      const beforeText = beforeRange.toString();

      if (atEnd && beforeText.endsWith('\n')) {
        shouldExit = true;
        block.textContent = block.textContent.replace(/\n+$/, '');
      }
    }

    if (!shouldExit) return;

    event.preventDefault();
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    if (isBlockEmpty) {
      block.replaceWith(p);
    } else {
      block.after(p);
    }

    const newRange = document.createRange();
    newRange.setStart(p, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    masterRichHtml = sanitizeHtml(wordEl.innerHTML);
    history.record({
      html: masterRichHtml,
      offset: getCaretCharacterOffset(wordEl),
      force: true,
    });
    updateActiveToolbarStates();
    updateUndoRedoButtons();
    autoResizeSourceEditor();
    inspectorPane?.refresh?.();
    requestAnimationFrame(() => repositionGrammarHighlights(wordEl));
    onChange?.({ markDirty: true });
  }

  function handleSourceInput() {
    if (mode === 'md') {
      if (!warnedInLossyMode && preSwitchRichHtml !== null) {
        warnedInLossyMode = true;
        showWarningBanner();
      }
      masterRichHtml = renderMarkdownToHtml(sourceEl.value);
    } else if (mode === 'txt') {
      if (!warnedInLossyMode && preSwitchRichHtml !== null) {
        warnedInLossyMode = true;
        showWarningBanner();
      }
      masterRichHtml = plainTextToHtml(sourceEl.value);
    } else if (mode === 'html') {
      masterRichHtml = sanitizeHtml(sourceEl.value);
    }

    autoResizeSourceEditor();
    inspectorPane?.refresh?.();
    onChange?.({ markDirty: true });
  }

  function bindEvents() {
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.modeTarget));
    });

    wordEl.addEventListener('keydown', handleWordEnterExit);

    wordEl.addEventListener('dblclick', (event) => {
      if (mode !== 'docx') return;
      if (headerFooter.isEditing()) {
        headerFooter.exit();
        return;
      }
      const wordRect = wordEl.getBoundingClientRect();
      const pageHeight =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-height')) ||
        1123;
      const pageGap =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-gap')) || 24;
      const marginPx = parseFloat(getComputedStyle(wordEl).paddingTop) || 96;
      const containerEl = wordEl.parentElement;
      const zoom = parseFloat(getComputedStyle(containerEl).zoom) || 1;
      const y = (event.clientY - wordRect.top) / zoom;
      const stride = pageHeight + pageGap;
      const pageNum = Math.floor(y / stride) + 1;
      const posInPage = y % stride;
      if (posInPage <= marginPx) {
        headerFooter.enter('header', pageNum);
      } else if (posInPage >= pageHeight - marginPx && posInPage <= pageHeight) {
        headerFooter.enter('footer', pageNum);
      }
    });

    wordEl.addEventListener('paste', (event) => {
      if (imageTools.handlePaste(event)) return;
      const html = event.clipboardData?.getData('text/html');
      if (!html) return;
      event.preventDefault();
      const clean = sanitizeHtml(html);
      const container = document.createElement('div');
      container.innerHTML = clean;
      container.querySelectorAll('font[size]').forEach((el) => el.removeAttribute('size'));
      container.querySelectorAll('[align], [style]').forEach((el) => {
        el.removeAttribute('align');
        if (el.style) {
          el.style.textAlign = '';
          el.style.backgroundColor = '';
          el.style.letterSpacing = '';
          el.style.wordSpacing = '';
          el.style.fontSize = '';
        }
      });
      document.execCommand('insertHTML', false, container.innerHTML);
    });

    wordEl.addEventListener('input', (event) => {
      if (suppressRichInputHistory) return;
      masterRichHtml = sanitizeHtml(wordEl.innerHTML);
      history.record({
        html: masterRichHtml,
        offset: getCaretCharacterOffset(wordEl),
        inputType: event.inputType || '',
        data: event.data || '',
      });
      updateUndoRedoButtons();
      onChange?.({ markDirty: true });
      updateActiveToolbarStates();
    });

    sourceEl.addEventListener('input', handleSourceInput);
    window.addEventListener('resize', autoResizeSourceEditor);
    window.addEventListener('afterprint', () => {
      if (mode === 'docx') {
        pageBreaks.sync();
      }
    });
    if (typeof ResizeObserver !== 'undefined' && sourceEl) {
      new ResizeObserver(() => autoResizeSourceEditor()).observe(sourceEl);
    }

    document.addEventListener('selectionchange', () => {
      if (
        document.activeElement === wordEl ||
        document.activeElement?.closest('.word-shape-label, .page-sheet-header, .page-sheet-footer-text')
      ) {
        updateActiveToolbarStates();
        syncFontSelectFromSelection();
      }
    });

    if (formatPainterBtnEl) {
      formatPainterBtnEl.addEventListener('click', () => {
        if (mode !== 'docx') return;
        if (copiedFormat) {
          setFormatPainterActive(false);
          return;
        }
        const captured = captureFormatAtSelection();
        if (captured) {
          copiedFormat = captured;
          setFormatPainterActive(true);
        }
      });
    }

    wordEl?.addEventListener('mouseup', () => {
      if (copiedFormat && mode === 'docx') {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
          applyCopiedFormatToSelection();
        }
      }
    });

    if (fontSelectEl) {
      fontSelectEl.addEventListener('change', () => {
        applyFontFamily(fontSelectEl.value);
        syncStylesPreviewFont(fontSelectEl.value);
      });
    }

    if (stylesMenuBtnEl && stylesPopoverEl) {
      stylesMenuBtnEl.addEventListener('click', () => {
        if (stylesMenuBtnEl.disabled) return;
        syncStylesPreviewFont();
        const willOpen = !stylesPopoverEl.classList.contains('is-open');
        stylesPopoverEl.classList.toggle('is-open', willOpen);
        stylesMenuBtnEl.setAttribute('aria-expanded', String(willOpen));
      });
      stylesPopoverEl.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      stylesPopoverEl.addEventListener('click', (event) => {
        if (event.target.closest('#btn-open-style-editor')) {
          closeStylesPopover();
          styleEditorModal?.open();
          return;
        }
        const customBtn = event.target.closest('[data-custom-style-id]');
        if (customBtn) {
          const styleId = customBtn.dataset.customStyleId;
          const found = styleEditorModal?.getCustomStyles().find((s) => s.id === styleId);
          if (found) applyCustomStyle(found);
          closeStylesPopover();
          return;
        }
        const item = event.target.closest('[data-block]');
        if (!item) return;
        execBlockCommand(item.dataset.block);
        closeStylesPopover();
      });
    }

    if (fontSizeSelectEl) {
      fontSizeSelectEl.addEventListener('change', () => {
        applyFontSize(fontSizeSelectEl.value);
      });
    }

    if (textColorAutoBtnEl) {
      textColorAutoBtnEl.addEventListener('mousedown', (event) => event.preventDefault());
      textColorAutoBtnEl.addEventListener('click', () => {
        applyTextColor('#1a1a1a');
        closeColorPopover();
      });
    }

    if (colorSwatchesGridEl) {
      TEXT_COLOR_SWATCHES.forEach(({ name, hex }) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'color-swatch';
        swatch.title = name;
        swatch.setAttribute('aria-label', name);
        swatch.style.backgroundColor = hex;
        swatch.addEventListener('mousedown', (event) => event.preventDefault());
        swatch.addEventListener('click', () => {
          applyTextColor(hex);
          closeColorPopover();
        });
        colorSwatchesGridEl.appendChild(swatch);
      });
    }

    if (textColorBtnEl && textColorPopoverEl) {
      textColorBtnEl.addEventListener('click', () => {
        if (textColorBtnEl.disabled) return;
        const willOpen = !textColorPopoverEl.classList.contains('is-open');
        textColorPopoverEl.classList.toggle('is-open', willOpen);
        textColorBtnEl.setAttribute('aria-expanded', String(willOpen));
      });
    }

    if (highlightNoneBtnEl) {
      highlightNoneBtnEl.addEventListener('mousedown', (event) => event.preventDefault());
      highlightNoneBtnEl.addEventListener('click', () => {
        applyHighlightColor('');
        closeHighlightPopover();
      });
    }

    if (highlightSwatchesGridEl) {
      HIGHLIGHT_SWATCHES.forEach(({ name, hex }) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'color-swatch';
        swatch.title = name;
        swatch.setAttribute('aria-label', name);
        swatch.style.backgroundColor = hex;
        swatch.addEventListener('mousedown', (event) => event.preventDefault());
        swatch.addEventListener('click', () => {
          applyHighlightColor(hex);
          closeHighlightPopover();
        });
        highlightSwatchesGridEl.appendChild(swatch);
      });
    }

    if (highlightColorBtnEl && highlightColorPopoverEl) {
      highlightColorBtnEl.addEventListener('click', () => {
        if (highlightColorBtnEl.disabled) return;
        const willOpen = !highlightColorPopoverEl.classList.contains('is-open');
        highlightColorPopoverEl.classList.toggle('is-open', willOpen);
        highlightColorBtnEl.setAttribute('aria-expanded', String(willOpen));
      });
    }

    if (textColorInputEl) {
      textColorInputEl.addEventListener('input', () => {
        applyTextColor(textColorInputEl.value);
      });
      textColorInputEl.addEventListener('change', () => {
        closeColorPopover();
      });
    }

    document.addEventListener('mousedown', (event) => {
      if (stylesMenuWrapEl && !stylesMenuWrapEl.contains(event.target)) {
        closeStylesPopover();
      }
      if (textColorWrapEl && !textColorWrapEl.contains(event.target)) {
        closeColorPopover();
      }
      if (highlightColorWrapEl && !highlightColorWrapEl.contains(event.target)) {
        closeHighlightPopover();
      }
      if (tableInsertWrapEl && !tableInsertWrapEl.contains(event.target)) {
        if (tablePopoverEl) tablePopoverEl.classList.remove('is-open');
      }
      if (shapesInsertWrapEl && !shapesInsertWrapEl.contains(event.target)) {
        if (shapesPopoverEl) shapesPopoverEl.classList.remove('is-open');
      }
      if (pageMenuWrapEl && !pageMenuWrapEl.contains(event.target)) {
        if (pageMenuPopoverEl) {
          pageMenuPopoverEl.classList.remove('is-open');
          pageMenuBtnEl?.setAttribute('aria-expanded', 'false');
        }
      }
      if (columnsMenuWrapEl && !columnsMenuWrapEl.contains(event.target)) {
        if (columnsMenuPopoverEl) {
          columnsMenuPopoverEl.classList.remove('is-open');
          columnsMenuBtnEl?.setAttribute('aria-expanded', 'false');
        }
      }
    });

    if (tableInsertBtnEl && tablePopoverEl) {
      tableInsertBtnEl.addEventListener('click', () => {
        if (tableInsertBtnEl.disabled) return;
        tablePopoverEl.classList.toggle('is-open');
      });
    }

    if (tableConfirmBtnEl) {
      tableConfirmBtnEl.addEventListener('click', () => {
        const rows = tableRowsInputEl?.value || 3;
        const cols = tableColsInputEl?.value || 3;
        if (tablePopoverEl) tablePopoverEl.classList.remove('is-open');
        tableTools.insertTable(rows, cols);
      });
    }

    if (shapesInsertBtnEl && shapesPopoverEl) {
      shapesInsertBtnEl.addEventListener('click', () => {
        if (shapesInsertBtnEl.disabled) return;
        shapesPopoverEl.classList.toggle('is-open');
      });

      shapesPopoverEl.addEventListener('click', (event) => {
        const item = event.target.closest('[data-shape-type]');
        if (!item || mode !== 'docx') return;
        shapesPopoverEl.classList.remove('is-open');
        pageShapes.insertShape(item.dataset.shapeType);
      });
    }

    if (imageInsertBtnEl) {
      imageInsertBtnEl.addEventListener('click', () => {
        if (imageInsertBtnEl.disabled || mode !== 'docx') return;
        imageTools.openPicker();
      });
    }

    if (pageMenuBtnEl && pageMenuPopoverEl) {
      const insertPageBreak = (atEnd = false) => {
        if (mode !== 'docx') return;
        wordEl.focus();
        const marker = document.createElement('div');
        marker.className = 'doc-page-break';
        marker.contentEditable = 'false';
        marker.dataset.pageBreak = 'true';
        marker.textContent = 'Page Break';

        const nextPara = document.createElement('p');
        nextPara.innerHTML = '<br>';

        if (atEnd) {
          wordEl.appendChild(marker);
          wordEl.appendChild(nextPara);
        } else {
          const activeBlock = getActiveBlockElement();
          if (activeBlock && wordEl.contains(activeBlock)) {
            activeBlock.after(nextPara);
            activeBlock.after(marker);
          } else {
            wordEl.appendChild(marker);
            wordEl.appendChild(nextPara);
          }
        }

        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.setStart(nextPara, 0);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }

        recordRichMutation();
        pageBreaks.sync();
        if (atEnd) {
          nextPara.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };

      const removePageBreak = () => {
        if (mode !== 'docx') return;
        const breaks = Array.from(wordEl.querySelectorAll('.doc-page-break'));
        if (breaks.length === 0) return;

        const activeBlock = getActiveBlockElement();
        let target = null;
        if (activeBlock) {
          target = breaks.findLast(
            (br) => br.compareDocumentPosition(activeBlock) & Node.DOCUMENT_POSITION_FOLLOWING
          );
        }
        if (!target) {
          target = breaks[breaks.length - 1];
        }
        target?.remove();
        recordRichMutation();
        pageBreaks.sync();
      };

      pageMenuBtnEl.addEventListener('click', () => {
        if (pageMenuBtnEl.disabled) return;
        const willOpen = !pageMenuPopoverEl.classList.contains('is-open');
        pageMenuPopoverEl.classList.toggle('is-open', willOpen);
        pageMenuBtnEl.setAttribute('aria-expanded', String(willOpen));
      });

      pageMenuPopoverEl.addEventListener('click', (event) => {
        const item = event.target.closest('[data-page-action]');
        if (!item || mode !== 'docx') return;
        pageMenuPopoverEl.classList.remove('is-open');
        pageMenuBtnEl.setAttribute('aria-expanded', 'false');
        const action = item.dataset.pageAction;
        if (action === 'page-break') {
          insertPageBreak(false);
        } else if (action === 'add-page') {
          insertPageBreak(true);
        } else if (action === 'remove-page-break') {
          removePageBreak();
        } else if (action === 'header-footer') {
          headerFooter.enter('header', 1);
        }
      });
    }

    if (columnsMenuBtnEl && columnsMenuPopoverEl) {
      columnsMenuBtnEl.addEventListener('click', () => {
        if (columnsMenuBtnEl.disabled) return;
        const willOpen = !columnsMenuPopoverEl.classList.contains('is-open');
        columnsMenuPopoverEl.classList.toggle('is-open', willOpen);
        columnsMenuBtnEl.setAttribute('aria-expanded', String(willOpen));
      });

      columnsMenuPopoverEl.addEventListener('click', (event) => {
        const item = event.target.closest('[data-columns-action]');
        if (!item || mode !== 'docx') return;
        columnsMenuPopoverEl.classList.remove('is-open');
        columnsMenuBtnEl.setAttribute('aria-expanded', 'false');
        const action = item.dataset.columnsAction || '';
        if (action.startsWith('doc:')) {
          columnTools.setDocumentColumns(Number(action.slice(4)));
        } else if (action === 'section:remove') {
          columnTools.removeColumnSection({ keepContent: true });
        } else if (action.startsWith('section:')) {
          columnTools.insertColumnSection(Number(action.slice(8)));
        }
      });
    }

    if (lineSpacingSelectEl) {
      lineSpacingSelectEl.addEventListener('change', () => {
        applyLineSpacing(lineSpacingSelectEl.value);
      });
    }

    if (pageMarginsSelectEl) {
      pageMarginsSelectEl.addEventListener('change', () => {
        applyPageMargins(pageMarginsSelectEl.value);
      });
    }

    if (undoSwitchBtn) {
      undoSwitchBtn.addEventListener('click', () => {
        if (preSwitchRichHtml !== null) {
          masterRichHtml = preSwitchRichHtml;
          preSwitchRichHtml = null;
        }
        warnedInLossyMode = false;
        hideWarningBanner();
        setMode('docx');
        onChange?.({ markDirty: false });
      });
    }

    if (dismissWarningBtn) {
      dismissWarningBtn.addEventListener('click', hideWarningBanner);
    }

    const toolbarEventRoot = document.querySelector('.app-shell') || toolbarEl;

    toolbarEventRoot.addEventListener('mousedown', (event) => {
      if (event.target.closest('.toolbar-group .fmt-btn')) {
        event.preventDefault();
      }
    });

    toolbarEventRoot.addEventListener('click', (event) => {
      const btn = event.target.closest('.toolbar-group .fmt-btn');
      if (!btn || btn.disabled) return;

      const cmd = btn.dataset.cmd;
      const block = btn.dataset.block;
      const mdAction = btn.dataset.mdAction;
      const htmlAction = btn.dataset.htmlAction;
      const txtAction = btn.dataset.txtAction;
      if (mdAction && mode === 'md') {
        if (applyMarkdownFormat(sourceEl, mdAction)) {
          handleSourceInput();
        }
      } else if (htmlAction && mode === 'html') {
        if (applyHtmlFormat(sourceEl, htmlAction)) {
          handleSourceInput();
        }
      } else if (txtAction && mode === 'txt') {
        if (applyTxtAction(sourceEl, txtAction)) {
          handleSourceInput();
        }
      } else if (cmd) {
        execFormatCommand(cmd);
      } else if (block) {
        execBlockCommand(block);
      } else if (btn.dataset.action === 'bottom-border') {
        toggleBottomBorder();
      }
    });
  }

  function loadDocumentContent(type, value) {
    preSwitchRichHtml = null;
    warnedInLossyMode = false;
    hideWarningBanner();
    headerFooter.exit();
    headerFooter.setState({ headerHtml: '', footerHtml: '', showPageNumbers: true }, { silent: true });

    if (type === 'md') {
      masterRichHtml = renderMarkdownToHtml(value);
      setMode('md', { syncCurrent: false });
      sourceEl.value = value || '';
      lastRenderedSourceText = sourceEl.value;
      autoResizeSourceEditor();
    } else if (type === 'html') {
      masterRichHtml = sanitizeHtml(value);
      setMode('html', { syncCurrent: false });
      sourceEl.value = formatHtmlPretty(masterRichHtml);
      lastRenderedSourceText = sourceEl.value;
      autoResizeSourceEditor();
    } else if (type === 'txt') {
      masterRichHtml = plainTextToHtml(value);
      setMode('txt', { syncCurrent: false });
      sourceEl.value = value || '';
      lastRenderedSourceText = sourceEl.value;
      autoResizeSourceEditor();
    } else {
      masterRichHtml = sanitizeHtml(value);
      setMode('docx', { syncCurrent: false });
      wordEl.innerHTML = masterRichHtml;
      hydrateAllDiagrams(wordEl, recordRichMutation);
      pageBreaks.sync();
      lastRenderedSourceText = '';
    }

    history.reset(masterRichHtml, pageShapes.getShapes());
    updateUndoRedoButtons();
    inspectorPane?.refresh?.();
    inspectorPane?.refreshGrammar?.();
    onChange?.({ markDirty: false });
  }

  function getSnapshot() {
    if (mode === 'docx') {
      masterRichHtml = getCleanWordHtml();
    }
    return {
      mode,
      html: masterRichHtml,
      sourceText: sourceEl.value,
      shapes: pageShapes.getShapes(),
      headerFooter: headerFooter.getState(),
    };
  }

  function restoreSnapshot(snap) {
    if (!snap) return;
    preSwitchRichHtml = null;
    warnedInLossyMode = false;
    hideWarningBanner();

    const targetMode = MODE_ORDER.includes(snap.mode) ? snap.mode : defaultMode;
    masterRichHtml = snap.html || '';
    pageShapes.setShapes(Array.isArray(snap.shapes) ? snap.shapes : []);
    if (snap.headerFooter) {
      headerFooter.setState(snap.headerFooter);
    }

    mode = targetMode;
    workspaceEl.dataset.mode = mode;
    modeButtons.forEach((btn) => {
      const active = btn.dataset.modeTarget === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    if (mode === 'docx') {
      wordEl.innerHTML = masterRichHtml;
      hydrateAllDiagrams(wordEl, recordRichMutation);
      pageShapes.syncWrapSpacers();
      pageBreaks.sync();
      lastRenderedSourceText = '';
    } else {
      sourceEl.value = snap.sourceText ?? '';
      lastRenderedSourceText = sourceEl.value;
      autoResizeSourceEditor();
    }

    history.reset(masterRichHtml, pageShapes.getShapes());
    updateToolbarAvailability();
    updateUndoRedoButtons();
    inspectorPane?.refresh?.();
    inspectorPane?.refreshGrammar?.();
    onModeChange?.(mode);
    onChange?.({ markDirty: false });
  }

  function getHtml() {
    if (mode === 'docx') {
      masterRichHtml = getCleanWordHtml();
    } else if (mode === 'html') {
      masterRichHtml = sanitizeHtml(sourceEl.value);
    }
    return masterRichHtml;
  }

  function getMarkdown() {
    if (mode === 'md') {
      return sourceEl.value;
    }
    return convertHtmlToMarkdown(getHtml());
  }

  function getPlainText() {
    if (mode === 'txt') {
      return sourceEl.value;
    }
    return htmlToPlainText(getHtml());
  }

  function updatePrintPageNumbersStyle({ showPageNumbers = false, footerText = '' } = {}) {
    const id = 'wordflow-print-page-numbers';
    let styleEl = document.getElementById(id);
    if (!showPageNumbers && !footerText) {
      if (styleEl) styleEl.textContent = '';
      return;
    }
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = id;
      document.head.appendChild(styleEl);
    }
    const rules = [];
    if (footerText) {
      const escaped = footerText.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
      rules.push(
        `@bottom-left { content: "${escaped}"; font-size: 11px; color: #4b5563; font-family: inherit; vertical-align: middle; }`
      );
    }
    if (showPageNumbers) {
      rules.push(
        '@bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 9pt; color: #6b7280; font-family: inherit; vertical-align: middle; }'
      );
    }
    styleEl.textContent = `@page { ${rules.join(' ')} }`;
  }

  function syncForPrint() {
    if (mode !== 'docx') {
      if (printSourceEl) printSourceEl.textContent = sourceEl.value || '';
      if (printHeaderEl) printHeaderEl.innerHTML = '';
      if (printFooterEl) printFooterEl.innerHTML = '';
      workspaceEl?.removeAttribute('data-print-hf');
      updatePrintPageNumbersStyle({});
      return;
    }

    const hf = headerFooter.getState();
    const shouldPrintHeader = Boolean(hf.printEnabled && hf.headerHtml);
    workspaceEl?.setAttribute('data-print-hf', String(shouldPrintHeader));
    if (printHeaderEl) {
      printHeaderEl.innerHTML = shouldPrintHeader ? hf.headerHtml || '' : '';
    }
    if (printFooterEl) {
      printFooterEl.innerHTML = '';
    }

    let footerPlain = '';
    if (hf.printEnabled && hf.footerHtml) {
      const tmp = document.createElement('div');
      tmp.innerHTML = hf.footerHtml;
      footerPlain = (tmp.textContent || '').trim();
    }
    updatePrintPageNumbersStyle({
      showPageNumbers: Boolean(hf.printEnabled && hf.showPageNumbers),
      footerText: footerPlain,
    });
  }

  let configuredLineSpacing = 1.15;
  let configuredPageMargins = 1;

  function clear() {
    masterRichHtml = '';
    lastRenderedSourceText = '';
    preSwitchRichHtml = null;
    warnedInLossyMode = false;
    hideWarningBanner();
    headerFooter.exit();
    headerFooter.setState({ headerHtml: '', footerHtml: '', showPageNumbers: true }, { silent: true });
    wordEl.innerHTML = '';
    delete wordEl.dataset.columns;
    defaultLineSpacing = configuredLineSpacing;
    pageMarginInches = configuredPageMargins;
    wordEl.style.setProperty('--doc-line-height', String(defaultLineSpacing));
    wordEl.style.setProperty('--doc-margin', `${pageMarginInches}in`);
    if (lineSpacingSelectEl) lineSpacingSelectEl.value = String(defaultLineSpacing);
    if (pageMarginsSelectEl) pageMarginsSelectEl.value = String(pageMarginInches);
    sourceEl.value = '';
    pageShapes.clear();
    history.reset('', []);
    setMode(defaultMode);
    updateUndoRedoButtons();
    inspectorPane?.refresh?.();
    inspectorPane?.refreshGrammar?.();
    onChange?.({ markDirty: false });
  }

  function getStats() {
    const text = mode === 'docx' ? (wordEl.innerText || '') : sourceEl.value;
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = text.replace(/\r?\n/g, '').length;
    return { words, chars };
  }

  function setDefaultFont(fontName) {
    if (!fontName) return;
    defaultFont = fontName;
    document.documentElement.style.setProperty('--doc-font', `"${fontName}", Georgia, serif`);
    wordEl.style.setProperty('--doc-font', `"${fontName}", Georgia, serif`);
    if (fontSelectEl) fontSelectEl.value = fontName;
    syncStylesPreviewFont(fontName);
  }

  function setDefaultFontSize(sizePt) {
    if (!sizePt) return;
    defaultFontSize = sizePt;
    document.documentElement.style.setProperty('--doc-font-size', sizePt);
    wordEl.style.setProperty('--doc-font-size', sizePt);
    if (fontSizeSelectEl) fontSizeSelectEl.value = sizePt;
  }

  function setDefaultMode(nextMode) {
    if (!MODE_ORDER.includes(nextMode)) return;
    defaultMode = nextMode;
  }

  function setDefaultLineSpacing(val) {
    const num = Number(val);
    if (!num) return;
    configuredLineSpacing = num;
    defaultLineSpacing = num;
    wordEl.style.setProperty('--doc-line-height', String(num));
    if (lineSpacingSelectEl) lineSpacingSelectEl.value = String(num);
  }

  function setDefaultPageMargins(val) {
    const num = Number(val);
    if (!num) return;
    configuredPageMargins = num;
    pageMarginInches = num;
    wordEl.style.setProperty('--doc-margin', `${num}in`);
    if (pageMarginsSelectEl) pageMarginsSelectEl.value = String(num);
    pageBreaks.sync();
  }

  function setMeasurementUnit(unit) {
    const unitSelectEl = document.getElementById('shape-size-unit');
    if (!unitSelectEl || !['mm', 'cm', 'in'].includes(unit)) return;
    if (unitSelectEl.value !== unit) {
      unitSelectEl.value = unit;
      unitSelectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  bindEvents();
  const dockableToolbars = initDockableToolbars({ appShellEl: document.querySelector('.app-shell') });
  const inspectorPane = createInspectorPane({
    paneEl: document.getElementById('inspector-pane'),
    toggleBtnEl: document.getElementById('btn-inspector-toggle'),
    edgeToggleBtnEl: document.getElementById('btn-inspector-edge-toggle'),
    closeBtnEl: document.getElementById('btn-inspector-close'),
    wordEl,
    sourceEl,
    getMode: () => mode,
    getStats,
    execFormatCommand,
    execBlockCommand,
    execBlockCommand,
    toggleBottomBorder,
    columnTools,
    openLinkDialog: () => linkTools.open(),
    onRichMutate: () => recordRichMutation(),
    getCustomStyles: () => styleEditorModal?.getCustomStyles() || [],
    applyCustomStyle,
    openStyleEditor: () => styleEditorModal?.open(),
    applyTextColor,
    applyHighlightColor,
  });
  styleEditorModal = createStyleEditorModal({
    getAvailableFonts: () => availableFonts,
    getDefaultFont: () => defaultFont,
    getDefaultFontSize: () => defaultFontSize,
    onStylesChange: () => {
      renderToolbarCustomStyles();
      inspectorPane?.refresh?.();
    },
    onApplyStyle: (style) => {
      applyCustomStyle(style);
      inspectorPane?.refresh?.();
    },
  });
  renderToolbarCustomStyles();
  updateToolbarAvailability();
  updateUndoRedoButtons();
  document.documentElement.style.setProperty('--doc-font-size', defaultFontSize);
  wordEl.style.setProperty('--doc-font-size', defaultFontSize);
  if (fontSizeSelectEl) fontSizeSelectEl.value = defaultFontSize;
  loadSystemFonts();

  return {
    getMode: () => mode,
    setMode,
    toggleMode,
    execFormatCommand,
    execBlockCommand,
    getDefaultFont: () => defaultFont,
    getDefaultFontSize: () => defaultFontSize,
    getDefaultLineSpacing: () => String(configuredLineSpacing),
    getDefaultPageMargins: () => String(configuredPageMargins),
    getDefaultMode: () => defaultMode,
    setDefaultFont,
    setDefaultFontSize,
    setDefaultLineSpacing,
    setDefaultPageMargins,
    setMeasurementUnit,
    setDefaultMode,
    setProofingOptions: ({ spellcheck, grammar } = {}) => {
      if (typeof spellcheck === 'boolean') {
        wordEl.setAttribute('spellcheck', String(spellcheck));
      }
      inspectorPane?.setProofingOptions?.({ spellcheck, grammar });
    },
    refreshGrammar: () => inspectorPane?.refreshGrammar?.(),
    resetWorkspaceLayout: () => {
      dockableToolbars?.resetLayout?.();
      dockableToolbars?.syncDividers?.();
      inspectorPane?.resetLayout?.();
    },
    setCustomStyles: (styles) => {
      styleEditorModal?.setCustomStyles(styles);
      renderToolbarCustomStyles();
      inspectorPane?.refresh?.();
    },
    getDocumentStyles: () => ({
      defaultFont,
      defaultFontSize,
      defaultLineSpacing,
      pageMarginInches,
      shapes: pageShapes.getShapes(),
      headerFooter: headerFooter.getState(),
    }),
    openFindReplace: (focusReplace = false) => findReplace.open(focusReplace),
    openLinkDialog: () => linkTools.open(),
    loadDocumentContent,
    getSnapshot,
    restoreSnapshot,
    getHtml,
    getMarkdown,
    getPlainText,
    syncForPrint,
    clear,
    getStats,
  };
}
