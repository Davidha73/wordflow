import { getVersion } from '@tauri-apps/api/app';
import { initNotesModal } from './notesModal.js';
import { saveSettings } from './settingsStore.js';

export function createSettingsDrawer({
  getStartIn,
  getDefaultFont,
  getDefaultFontSize,
  getDefaultZoom,
  getDefaultMode,
  getPageSize,
  getPageOrientation,
  getTabsEnabled,
  getTheme,
  onStartInChange,
  onDefaultFontChange,
  onDefaultSizeChange,
  onDefaultZoomChange,
  onDefaultModeChange,
  onPageSizeChange,
  onPageOrientationChange,
  onTabsEnabledChange,
  onThemeChange,
} = {}) {
  const triggerEl = document.getElementById('btn-settings');
  const closeEl = document.getElementById('btn-close-settings');
  const cancelEl = document.getElementById('btn-cancel-settings');
  const saveEl = document.getElementById('btn-save-settings');
  const drawerEl = document.getElementById('settings-drawer');
  const backdropEl = document.getElementById('settings-backdrop');
  const startInSelectEl = document.getElementById('settings-start-in');
  const fontSelectEl = document.getElementById('settings-default-font');
  const sizeSelectEl = document.getElementById('settings-default-size');
  const defaultZoomSelectEl = document.getElementById('settings-default-zoom');
  const modeSelectEl = document.getElementById('settings-default-mode');
  const pageSizeSelectEl = document.getElementById('settings-page-size');
  const pageOrientationSelectEl = document.getElementById('settings-page-orientation');
  const tabsEnabledEl = document.getElementById('settings-tabs-enabled');
  const themeSelectEl = document.getElementById('settings-theme');
  const versionEl = document.getElementById('settings-version');

  initNotesModal();

  if (versionEl) {
    getVersion()
      .then((ver) => {
        if (ver) versionEl.textContent = `v${ver}`;
      })
      .catch(() => {});
  }

  function syncValues() {
    if (startInSelectEl && getStartIn) {
      const val = getStartIn();
      if (val) startInSelectEl.value = val;
    }
    if (fontSelectEl && getDefaultFont) {
      const val = getDefaultFont();
      if (val) fontSelectEl.value = val;
    }
    if (sizeSelectEl && getDefaultFontSize) {
      const val = getDefaultFontSize();
      if (val) sizeSelectEl.value = val;
    }
    if (defaultZoomSelectEl && getDefaultZoom) {
      const val = getDefaultZoom();
      if (val) defaultZoomSelectEl.value = String(val);
    }
    if (modeSelectEl && getDefaultMode) {
      const val = getDefaultMode();
      if (val) modeSelectEl.value = val;
    }
    if (pageSizeSelectEl && getPageSize) {
      const val = getPageSize();
      if (val) pageSizeSelectEl.value = val;
    }
    if (pageOrientationSelectEl && getPageOrientation) {
      const val = getPageOrientation();
      if (val) pageOrientationSelectEl.value = val;
    }
    if (tabsEnabledEl && getTabsEnabled) {
      tabsEnabledEl.checked = Boolean(getTabsEnabled());
    }
    if (themeSelectEl && getTheme) {
      const val = getTheme();
      if (val) themeSelectEl.value = val;
    }
  }

  function setAvailableFonts(fonts) {
    if (!fontSelectEl || !Array.isArray(fonts)) return;
    fontSelectEl.innerHTML = '';
    fonts.forEach((fontName) => {
      const option = document.createElement('option');
      option.value = fontName;
      option.textContent = fontName;
      option.style.fontFamily = `"${fontName}", sans-serif`;
      fontSelectEl.appendChild(option);
    });
    syncValues();
  }

  function setOpen(isOpen) {
    if (!drawerEl || !backdropEl) return;
    if (isOpen) syncValues();
    drawerEl.classList.toggle('is-open', isOpen);
    backdropEl.classList.toggle('is-open', isOpen);
    drawerEl.setAttribute('aria-hidden', String(!isOpen));
    backdropEl.setAttribute('aria-hidden', String(!isOpen));
    if (triggerEl) {
      triggerEl.setAttribute('aria-expanded', String(isOpen));
    }
  }

  async function commitSettings() {
    const patch = {};
    if (startInSelectEl) patch.startIn = startInSelectEl.value;
    if (fontSelectEl) patch.defaultFont = fontSelectEl.value;
    if (sizeSelectEl) patch.defaultFontSize = sizeSelectEl.value;
    if (defaultZoomSelectEl) patch.defaultZoom = Number(defaultZoomSelectEl.value) || 100;
    if (modeSelectEl) patch.defaultMode = modeSelectEl.value;
    if (pageSizeSelectEl) patch.pageSize = pageSizeSelectEl.value;
    if (pageOrientationSelectEl) patch.pageOrientation = pageOrientationSelectEl.value;
    if (tabsEnabledEl) patch.tabsEnabled = tabsEnabledEl.checked;
    if (themeSelectEl) patch.theme = themeSelectEl.value;

    await saveSettings(patch);

    if (patch.startIn) onStartInChange?.(patch.startIn);
    if (patch.defaultFont) onDefaultFontChange?.(patch.defaultFont);
    if (patch.defaultFontSize) onDefaultSizeChange?.(patch.defaultFontSize);
    if (patch.defaultZoom) onDefaultZoomChange?.(patch.defaultZoom);
    if (patch.defaultMode) onDefaultModeChange?.(patch.defaultMode);
    if (patch.pageSize) onPageSizeChange?.(patch.pageSize);
    if (patch.pageOrientation) onPageOrientationChange?.(patch.pageOrientation);
    if (typeof patch.tabsEnabled === 'boolean') onTabsEnabledChange?.(patch.tabsEnabled);
    if (patch.theme) onThemeChange?.(patch.theme);

    setOpen(false);
  }

  if (saveEl) {
    saveEl.addEventListener('click', () => {
      commitSettings();
    });
  }

  if (cancelEl) {
    cancelEl.addEventListener('click', () => setOpen(false));
  }

  if (triggerEl) {
    triggerEl.addEventListener('click', () => {
      const next = !drawerEl?.classList.contains('is-open');
      setOpen(next);
    });
  }

  if (closeEl) {
    closeEl.addEventListener('click', () => setOpen(false));
  }

  if (backdropEl) {
    backdropEl.addEventListener('click', () => setOpen(false));
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawerEl?.classList.contains('is-open')) {
      setOpen(false);
    }
  });

  syncValues();

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    setAvailableFonts,
  };
}
