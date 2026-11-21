import { saveSettings } from './settingsStore.js';

export function createStyleEditorModal({
  getAvailableFonts,
  getDefaultFont,
  getDefaultFontSize,
  initialStyles = [],
  onStylesChange,
  onApplyStyle,
} = {}) {
  const backdropEl = document.getElementById('style-editor-backdrop');
  const modalEl = document.getElementById('style-editor-modal');
  const closeBtnEl = document.getElementById('btn-close-style-editor');
  const cancelBtnEl = document.getElementById('btn-cancel-style-editor');
  const saveBtnEl = document.getElementById('btn-save-style-editor');
  const savedWrapEl = document.getElementById('style-editor-saved-wrap');
  const savedListEl = document.getElementById('style-editor-saved-list');
  const nameInputEl = document.getElementById('style-editor-name');
  const blockSelectEl = document.getElementById('style-editor-block');
  const fontSelectEl = document.getElementById('style-editor-font');
  const sizeSelectEl = document.getElementById('style-editor-size');
  const colorInputEl = document.getElementById('style-editor-color');
  const colorAutoBtnEl = document.getElementById('btn-style-color-auto');
  const previewEl = document.getElementById('style-editor-preview');
  const errorEl = document.getElementById('style-editor-error');
  const toggleBtns = modalEl ? Array.from(modalEl.querySelectorAll('[data-style-toggle]')) : [];
  const alignBtns = modalEl ? Array.from(modalEl.querySelectorAll('[data-style-align]')) : [];

  let customStyles = Array.isArray(initialStyles) ? [...initialStyles] : [];
  let editingId = null;
  let isAutoColor = true;
  let activeAlign = 'left';
  const formatState = {
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
  };

  function populateFonts() {
    if (!fontSelectEl) return;
    const fonts = getAvailableFonts?.() || ['Georgia', 'Arial', 'Times New Roman'];
    const prev = fontSelectEl.value;
    fontSelectEl.innerHTML = '';
    fonts.forEach((fontName) => {
      const opt = document.createElement('option');
      opt.value = fontName;
      opt.textContent = fontName;
      fontSelectEl.appendChild(opt);
    });
    if (prev && fonts.includes(prev)) {
      fontSelectEl.value = prev;
    }
  }

  function updateToggleButtons() {
    toggleBtns.forEach((btn) => {
      const key = btn.dataset.styleToggle;
      const active = Boolean(formatState[key]);
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    alignBtns.forEach((btn) => {
      const active = btn.dataset.styleAlign === activeAlign;
      btn.classList.toggle('is-active', active);
    });
    colorAutoBtnEl?.classList.toggle('is-active', isAutoColor);
  }

  function updatePreview() {
    if (!previewEl) return;
    const font = fontSelectEl?.value || getDefaultFont?.() || 'Georgia';
    const size = sizeSelectEl?.value || getDefaultFontSize?.() || '12pt';
    const color = isAutoColor ? 'var(--paper-text)' : (colorInputEl?.value || '#1a1a1a');
    const decorations = [];
    if (formatState.underline) decorations.push('underline');
    if (formatState.strikethrough) decorations.push('line-through');

    previewEl.textContent = (nameInputEl?.value || '').trim() || 'Sample text in this style';
    previewEl.style.setProperty('--preview-font', `"${font}", Georgia, serif`);
    previewEl.style.setProperty('--preview-size', size);
    previewEl.style.setProperty('--preview-color', color);
    previewEl.style.setProperty('--preview-weight', formatState.bold ? '700' : '400');
    previewEl.style.setProperty('--preview-italic', formatState.italic ? 'italic' : 'normal');
    previewEl.style.setProperty(
      '--preview-decoration',
      decorations.length ? decorations.join(' ') : 'none'
    );
    previewEl.style.setProperty('--preview-align', activeAlign);
  }

  function renderSavedList() {
    if (!savedWrapEl || !savedListEl) return;
    savedListEl.innerHTML = '';
    savedWrapEl.classList.toggle('is-hidden', customStyles.length === 0);

    customStyles.forEach((style) => {
      const chip = document.createElement('div');
      chip.className = 'style-editor-saved-chip';
      if (editingId === style.id) {
        chip.classList.add('is-active');
      }

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'style-editor-saved-load';
      loadBtn.textContent = style.name;
      loadBtn.title = `Edit "${style.name}"`;
      loadBtn.addEventListener('click', () => loadStyleIntoForm(style));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'style-editor-saved-del';
      delBtn.textContent = '×';
      delBtn.title = `Delete "${style.name}"`;
      delBtn.setAttribute('aria-label', `Delete ${style.name}`);
      delBtn.addEventListener('click', async () => {
        customStyles = customStyles.filter((s) => s.id !== style.id);
        if (editingId === style.id) {
          resetForm();
        }
        await saveSettings({ customStyles });
        onStylesChange?.(customStyles);
        renderSavedList();
      });

      chip.appendChild(loadBtn);
      chip.appendChild(delBtn);
      savedListEl.appendChild(chip);
    });
  }

  function loadStyleIntoForm(style) {
    editingId = style.id;
    if (nameInputEl) nameInputEl.value = style.name || '';
    if (blockSelectEl) blockSelectEl.value = style.block || 'P';
    if (fontSelectEl && style.fontFamily) fontSelectEl.value = style.fontFamily;
    if (sizeSelectEl && style.fontSize) sizeSelectEl.value = style.fontSize;
    isAutoColor = !style.color;
    if (colorInputEl) colorInputEl.value = style.color || '#1a1a1a';
    formatState.bold = Boolean(style.bold);
    formatState.italic = Boolean(style.italic);
    formatState.underline = Boolean(style.underline);
    formatState.strikethrough = Boolean(style.strikethrough);
    activeAlign = style.align || 'left';
    if (errorEl) errorEl.textContent = '';
    updateToggleButtons();
    updatePreview();
    renderSavedList();
  }

  function resetForm() {
    editingId = null;
    if (nameInputEl) nameInputEl.value = '';
    if (blockSelectEl) blockSelectEl.value = 'P';
    if (fontSelectEl) fontSelectEl.value = getDefaultFont?.() || fontSelectEl.options[0]?.value || 'Georgia';
    if (sizeSelectEl) sizeSelectEl.value = getDefaultFontSize?.() || '12pt';
    isAutoColor = true;
    if (colorInputEl) colorInputEl.value = '#1a1a1a';
    formatState.bold = false;
    formatState.italic = false;
    formatState.underline = false;
    formatState.strikethrough = false;
    activeAlign = 'left';
    if (errorEl) errorEl.textContent = '';
    updateToggleButtons();
    updatePreview();
    renderSavedList();
  }

  function setOpen(isOpen) {
    if (!modalEl || !backdropEl) return;
    if (isOpen) {
      populateFonts();
      resetForm();
    }
    modalEl.classList.toggle('is-open', isOpen);
    backdropEl.classList.toggle('is-open', isOpen);
    modalEl.setAttribute('aria-hidden', String(!isOpen));
    backdropEl.setAttribute('aria-hidden', String(!isOpen));
    if (isOpen) {
      nameInputEl?.focus();
    }
  }

  async function handleSave() {
    const name = (nameInputEl?.value || '').trim();
    if (!name) {
      if (errorEl) errorEl.textContent = 'Please enter a style name.';
      nameInputEl?.focus();
      return;
    }

    const existingIdx = editingId
      ? customStyles.findIndex((s) => s.id === editingId)
      : customStyles.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());

    const entry = {
      id: existingIdx >= 0 ? customStyles[existingIdx].id : `style-${Date.now()}`,
      name,
      block: blockSelectEl?.value || 'P',
      fontFamily: fontSelectEl?.value || getDefaultFont?.() || 'Georgia',
      fontSize: sizeSelectEl?.value || getDefaultFontSize?.() || '12pt',
      color: isAutoColor ? '' : (colorInputEl?.value || '#1a1a1a'),
      bold: formatState.bold,
      italic: formatState.italic,
      underline: formatState.underline,
      strikethrough: formatState.strikethrough,
      align: activeAlign,
    };

    if (existingIdx >= 0) {
      customStyles = customStyles.map((s, idx) => (idx === existingIdx ? entry : s));
    } else {
      customStyles = [...customStyles, entry];
    }

    await saveSettings({ customStyles });
    onStylesChange?.(customStyles);
    onApplyStyle?.(entry);
    setOpen(false);
  }

  toggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.styleToggle;
      formatState[key] = !formatState[key];
      updateToggleButtons();
      updatePreview();
    });
  });

  alignBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeAlign = btn.dataset.styleAlign || 'left';
      updateToggleButtons();
      updatePreview();
    });
  });

  colorInputEl?.addEventListener('input', () => {
    isAutoColor = false;
    updateToggleButtons();
    updatePreview();
  });

  colorAutoBtnEl?.addEventListener('click', () => {
    isAutoColor = true;
    updateToggleButtons();
    updatePreview();
  });

  [nameInputEl, blockSelectEl, fontSelectEl, sizeSelectEl].forEach((el) => {
    el?.addEventListener('input', () => {
      if (errorEl) errorEl.textContent = '';
      updatePreview();
    });
    el?.addEventListener('change', updatePreview);
  });

  saveBtnEl?.addEventListener('click', handleSave);
  cancelBtnEl?.addEventListener('click', () => setOpen(false));
  closeBtnEl?.addEventListener('click', () => setOpen(false));
  backdropEl?.addEventListener('click', () => setOpen(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalEl?.classList.contains('is-open')) {
      setOpen(false);
    }
  });

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    getCustomStyles: () => [...customStyles],
    setCustomStyles: (next) => {
      customStyles = Array.isArray(next) ? [...next] : [];
      renderSavedList();
    },
  };
}
