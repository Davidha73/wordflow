const THEME_STORAGE_KEY = 'wordflow-ui-theme';
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;

export function createStatusBar({ onZoomChange } = {}) {
  const filenameEl = document.getElementById('status-filename');
  const modeEl = document.getElementById('status-mode');
  const wordsEl = document.getElementById('status-words');
  const charsEl = document.getElementById('status-chars');
  const zoomOutBtn = document.getElementById('btn-zoom-out');
  const zoomInBtn = document.getElementById('btn-zoom-in');
  const zoomSliderEl = document.getElementById('zoom-slider');
  const zoomResetBtn = document.getElementById('btn-zoom-reset');
  let defaultZoom = 100;
  let currentZoom = 100;

  function clampZoom(percent) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(Number(percent) || 100)));
  }

  function applyZoom(percent, { notify = false } = {}) {
    const clamped = clampZoom(percent);
    currentZoom = clamped;
    document.documentElement.style.setProperty('--doc-zoom', String(clamped / 100));
    if (zoomSliderEl) zoomSliderEl.value = String(clamped);
    if (zoomResetBtn) zoomResetBtn.textContent = `${clamped}%`;
    if (notify) onZoomChange?.(clamped);
  }

  function setDefaultZoom(percent) {
    defaultZoom = clampZoom(percent);
    if (zoomResetBtn) {
      zoomResetBtn.title = `Reset Zoom (${defaultZoom}%)`;
    }
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }

  function initTheme() {
    let saved = 'light';
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
    } catch {
      saved = 'light';
    }
    applyTheme(saved === 'dark' ? 'dark' : 'light');
  }

  function updateFile({ fileName, isDirty }) {
    filenameEl.textContent = isDirty ? `${fileName} *` : fileName;
  }

  const MODE_LABELS = {
    docx: 'Mode: Word (.docx)',
    md: 'Mode: Markdown (.md)',
    html: 'Mode: HTML (.html)',
    txt: 'Mode: Plain Text (.txt)',
  };

  function updateMode(mode) {
    modeEl.textContent = MODE_LABELS[mode] || 'Mode: Word (.docx)';
  }

  function updateStats({ words, chars }) {
    wordsEl.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
    charsEl.textContent = `${chars} ${chars === 1 ? 'char' : 'chars'}`;
  }

  initTheme();
  applyZoom(100);

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => applyZoom(currentZoom - ZOOM_STEP, { notify: true }));
  }
  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => applyZoom(currentZoom + ZOOM_STEP, { notify: true }));
  }
  if (zoomSliderEl) {
    zoomSliderEl.addEventListener('input', () => applyZoom(zoomSliderEl.value, { notify: true }));
  }
  if (zoomResetBtn) {
    zoomResetBtn.addEventListener('click', () => applyZoom(defaultZoom, { notify: true }));
  }

  return {
    updateFile,
    updateMode,
    updateStats,
    setTheme: (theme) => applyTheme(theme === 'dark' ? 'dark' : 'light'),
    setZoom: (percent) => applyZoom(percent),
    setDefaultZoom,
  };
}
