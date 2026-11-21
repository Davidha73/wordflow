const THEME_STORAGE_KEY = 'wordflow-ui-theme';
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;

export function createStatusBar({ onZoomChange } = {}) {
  const filenameEl = document.getElementById('status-filename');
  const modeEl = document.getElementById('status-mode');
  const autoSaveEl = document.getElementById('status-autosave');
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

  let currentThemePref = 'light';
  const colorSchemeMedia =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  function resolveEffectiveTheme(theme) {
    if (theme === 'system') {
      return colorSchemeMedia?.matches ? 'dark' : 'light';
    }
    return theme === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const normalized = theme === 'dark' || theme === 'system' ? theme : 'light';
    currentThemePref = normalized;
    document.documentElement.dataset.theme = resolveEffectiveTheme(normalized);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
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
    applyTheme(saved);
    colorSchemeMedia?.addEventListener('change', () => {
      if (currentThemePref === 'system') {
        document.documentElement.dataset.theme = resolveEffectiveTheme('system');
      }
    });
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

  function formatIntervalLabel(seconds) {
    if (seconds >= 60 && seconds % 60 === 0) {
      return `${seconds / 60}m`;
    }
    return `${seconds}s`;
  }

  function setAutoSaveStatus({
    intervalSeconds = 0,
    isSaving = false,
    hasFilePath = false,
    lastSavedAt = null,
  } = {}) {
    if (!autoSaveEl) return;
    autoSaveEl.classList.remove('is-off', 'is-active', 'is-saving');

    if (!intervalSeconds || intervalSeconds <= 0) {
      autoSaveEl.textContent = 'Auto-Save: Off';
      autoSaveEl.title = 'Auto-Save is disabled (change in Settings)';
      autoSaveEl.classList.add('is-off');
      return;
    }

    const intervalLabel = formatIntervalLabel(intervalSeconds);
    if (isSaving) {
      autoSaveEl.textContent = 'Auto-Save: Saving…';
      autoSaveEl.title = `Auto-Saving every ${intervalLabel}`;
      autoSaveEl.classList.add('is-saving');
      return;
    }

    if (!hasFilePath) {
      autoSaveEl.textContent = `Auto-Save: ${intervalLabel} (save file first)`;
      autoSaveEl.title = 'Save this document once to enable automatic saving';
      autoSaveEl.classList.add('is-off');
      return;
    }

    autoSaveEl.classList.add('is-active');
    if (lastSavedAt instanceof Date && !Number.isNaN(lastSavedAt.getTime())) {
      const timeStr = lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      autoSaveEl.textContent = `Auto-Save: ${intervalLabel} • Saved ${timeStr}`;
      autoSaveEl.title = `Auto-Save enabled (every ${intervalLabel}). Last auto-saved at ${timeStr}.`;
    } else {
      autoSaveEl.textContent = `Auto-Save: ${intervalLabel}`;
      autoSaveEl.title = `Auto-Save enabled (every ${intervalLabel})`;
    }
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
    setAutoSaveStatus,
    setTheme: (theme) => applyTheme(theme),
    getTheme: () => currentThemePref,
    setZoom: (percent) => applyZoom(percent),
    setDefaultZoom,
  };
}
