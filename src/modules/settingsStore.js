import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

const SETTINGS_FILE = 'settings.json';
const MAX_RECENT_DOCUMENTS = 25;
const DEFAULTS = {
  startIn: 'document',
  defaultFont: 'Georgia',
  defaultFontSize: '12pt',
  defaultLineSpacing: '1.15',
  defaultPageMargins: '1',
  defaultMode: 'docx',
  pageSize: 'A4',
  pageOrientation: 'portrait',
  measurementUnit: 'mm',
  tabsEnabled: true,
  theme: 'light',
  spellcheckEnabled: true,
  grammarEnabled: true,
  autoSaveInterval: 0,
  defaultZoom: 100,
  zoom: 100,
  customStyles: [],
  customTemplates: [],
  recentDocuments: [],
  lastSeenVersion: '',
  window: {
    width: 1120,
    height: 760,
    x: null,
    y: null,
    maximized: false,
  },
};

let cachedSettings = {
  ...DEFAULTS,
  recentDocuments: [],
  window: { ...DEFAULTS.window },
};

function readLocalCustomStylesFallback() {
  try {
    const raw = localStorage.getItem('wordflow-custom-styles');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalCustomTemplatesFallback() {
  try {
    const raw = localStorage.getItem('wordflow-custom-templates');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalRecentFallback() {
  try {
    const raw = localStorage.getItem('wordflow-recent-docs');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalFallback() {
  return {
    startIn: localStorage.getItem('wordflow-start-in') || DEFAULTS.startIn,
    defaultFont: localStorage.getItem('wordflow-default-font') || DEFAULTS.defaultFont,
    defaultFontSize: localStorage.getItem('wordflow-default-size') || DEFAULTS.defaultFontSize,
    defaultLineSpacing:
      localStorage.getItem('wordflow-default-line-spacing') || DEFAULTS.defaultLineSpacing,
    defaultPageMargins:
      localStorage.getItem('wordflow-default-page-margins') || DEFAULTS.defaultPageMargins,
    defaultMode: localStorage.getItem('wordflow-default-mode') || DEFAULTS.defaultMode,
    pageSize: localStorage.getItem('wordflow-page-size') || DEFAULTS.pageSize,
    pageOrientation:
      localStorage.getItem('wordflow-page-orientation') || DEFAULTS.pageOrientation,
    measurementUnit:
      localStorage.getItem('wordflow-measurement-unit') || DEFAULTS.measurementUnit,
    tabsEnabled:
      localStorage.getItem('wordflow-tabs-enabled') !== null
        ? localStorage.getItem('wordflow-tabs-enabled') === 'true'
        : DEFAULTS.tabsEnabled,
    theme: localStorage.getItem('wordflow-ui-theme') || DEFAULTS.theme,
    spellcheckEnabled:
      localStorage.getItem('wordflow-spellcheck-enabled') !== null
        ? localStorage.getItem('wordflow-spellcheck-enabled') === 'true'
        : DEFAULTS.spellcheckEnabled,
    grammarEnabled:
      localStorage.getItem('wordflow-grammar-enabled') !== null
        ? localStorage.getItem('wordflow-grammar-enabled') === 'true'
        : DEFAULTS.grammarEnabled,
    autoSaveInterval:
      localStorage.getItem('wordflow-autosave-interval') !== null
        ? Number(localStorage.getItem('wordflow-autosave-interval')) || 0
        : DEFAULTS.autoSaveInterval,
    defaultZoom: Number(localStorage.getItem('wordflow-default-zoom')) || DEFAULTS.defaultZoom,
    zoom: Number(localStorage.getItem('wordflow-doc-zoom')) || DEFAULTS.zoom,
    customStyles: readLocalCustomStylesFallback(),
    customTemplates: readLocalCustomTemplatesFallback(),
    recentDocuments: readLocalRecentFallback(),
    lastSeenVersion: localStorage.getItem('wordflow-last-seen-version') || '',
  };
}

function writeLocalFallback(settings) {
  if (settings.startIn) {
    localStorage.setItem('wordflow-start-in', settings.startIn);
  }
  if (settings.defaultFont) {
    localStorage.setItem('wordflow-default-font', settings.defaultFont);
  }
  if (settings.defaultFontSize) {
    localStorage.setItem('wordflow-default-size', settings.defaultFontSize);
  }
  if (settings.defaultLineSpacing) {
    localStorage.setItem('wordflow-default-line-spacing', String(settings.defaultLineSpacing));
  }
  if (settings.defaultPageMargins) {
    localStorage.setItem('wordflow-default-page-margins', String(settings.defaultPageMargins));
  }
  if (settings.defaultMode) {
    localStorage.setItem('wordflow-default-mode', settings.defaultMode);
  }
  if (settings.pageSize) {
    localStorage.setItem('wordflow-page-size', settings.pageSize);
  }
  if (settings.pageOrientation) {
    localStorage.setItem('wordflow-page-orientation', settings.pageOrientation);
  }
  if (settings.measurementUnit) {
    localStorage.setItem('wordflow-measurement-unit', settings.measurementUnit);
  }
  if (typeof settings.tabsEnabled === 'boolean') {
    localStorage.setItem('wordflow-tabs-enabled', String(settings.tabsEnabled));
  }
  if (settings.theme) {
    localStorage.setItem('wordflow-ui-theme', settings.theme);
  }
  if (typeof settings.spellcheckEnabled === 'boolean') {
    localStorage.setItem('wordflow-spellcheck-enabled', String(settings.spellcheckEnabled));
  }
  if (typeof settings.grammarEnabled === 'boolean') {
    localStorage.setItem('wordflow-grammar-enabled', String(settings.grammarEnabled));
  }
  if (typeof settings.autoSaveInterval === 'number' && Number.isFinite(settings.autoSaveInterval)) {
    localStorage.setItem('wordflow-autosave-interval', String(settings.autoSaveInterval));
  }
  if (typeof settings.defaultZoom === 'number' && Number.isFinite(settings.defaultZoom)) {
    localStorage.setItem('wordflow-default-zoom', String(settings.defaultZoom));
  }
  if (Array.isArray(settings.customStyles)) {
    try {
      localStorage.setItem('wordflow-custom-styles', JSON.stringify(settings.customStyles));
    } catch {
      // Ignore storage quota errors.
    }
  }
  if (Array.isArray(settings.customTemplates)) {
    try {
      localStorage.setItem('wordflow-custom-templates', JSON.stringify(settings.customTemplates));
    } catch {
      // Ignore storage quota errors.
    }
  }
  if (Array.isArray(settings.recentDocuments)) {
    try {
      localStorage.setItem('wordflow-recent-docs', JSON.stringify(settings.recentDocuments));
    } catch {
      // Ignore storage quota errors.
    }
  }
  if (typeof settings.lastSeenVersion === 'string') {
    localStorage.setItem('wordflow-last-seen-version', settings.lastSeenVersion);
  }
}

export async function loadSettings() {
  const fallback = readLocalFallback();
  try {
    const hasFile = await exists(SETTINGS_FILE, { baseDir: BaseDirectory.AppConfig });
    if (!hasFile) {
      cachedSettings = {
        ...DEFAULTS,
        ...fallback,
        window: { ...DEFAULTS.window },
      };
      await saveSettings(cachedSettings);
      return { ...cachedSettings, window: { ...cachedSettings.window } };
    }
    const raw = await readTextFile(SETTINGS_FILE, { baseDir: BaseDirectory.AppConfig });
    const parsed = JSON.parse(raw);
    const valid = parsed && typeof parsed === 'object' ? parsed : {};
    cachedSettings = {
      ...DEFAULTS,
      ...fallback,
      ...valid,
      window: {
        ...DEFAULTS.window,
        ...(valid.window && typeof valid.window === 'object' ? valid.window : {}),
      },
    };
    writeLocalFallback(cachedSettings);
    return { ...cachedSettings, window: { ...cachedSettings.window } };
  } catch {
    cachedSettings = {
      ...DEFAULTS,
      ...fallback,
      window: { ...DEFAULTS.window },
    };
    return { ...cachedSettings, window: { ...cachedSettings.window } };
  }
}

export async function saveSettings(patch) {
  cachedSettings = {
    ...cachedSettings,
    ...patch,
    window: patch?.window
      ? { ...cachedSettings.window, ...patch.window }
      : { ...cachedSettings.window },
  };
  writeLocalFallback(cachedSettings);
  try {
    await mkdir('', { baseDir: BaseDirectory.AppConfig, recursive: true });
    await writeTextFile(SETTINGS_FILE, JSON.stringify(cachedSettings, null, 2), {
      baseDir: BaseDirectory.AppConfig,
    });
  } catch {
    // Fallback to localStorage when running outside Tauri FS scope
  }
  return { ...cachedSettings, window: { ...cachedSettings.window } };
}

export function getRecentDocuments() {
  return Array.isArray(cachedSettings.recentDocuments) ? [...cachedSettings.recentDocuments] : [];
}

export async function addRecentDocument(filePath, metadata = {}) {
  if (!filePath || typeof filePath !== 'string') return getRecentDocuments();
  const parts = filePath.split(/[/\\]/);
  const name = parts[parts.length - 1] || filePath;
  const extMatch = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? (extMatch[1] === 'htm' ? 'html' : extMatch[1]) : '';
  const entry = {
    path: filePath,
    name,
    mode: metadata.mode || ext || 'docx',
    size: typeof metadata.size === 'number' ? metadata.size : null,
    modifiedAt: metadata.modifiedAt || null,
    openedAt: new Date().toISOString(),
  };
  const next = [
    entry,
    ...getRecentDocuments().filter((item) => item?.path && item.path !== filePath),
  ].slice(0, MAX_RECENT_DOCUMENTS);
  await saveSettings({ recentDocuments: next });
  return next;
}

export async function removeRecentDocument(filePath) {
  if (!filePath || typeof filePath !== 'string') return getRecentDocuments();
  const next = getRecentDocuments().filter((item) => item?.path && item.path !== filePath);
  await saveSettings({ recentDocuments: next });
  return next;
}

export async function clearRecentDocuments() {
  await saveSettings({ recentDocuments: [] });
  return [];
}

export function getCustomTemplates() {
  return Array.isArray(cachedSettings.customTemplates) ? [...cachedSettings.customTemplates] : [];
}

export async function addCustomTemplate({ title, desc = '', mode = 'docx', content = '', html = '' }) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return getCustomTemplates();
  const entry = {
    id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: cleanTitle,
    desc: String(desc || '').trim() || 'Saved template',
    icon: 'file-text',
    mode: mode || 'docx',
    content: String(content || ''),
    html: String(html || ''),
    isCustom: true,
    createdAt: new Date().toISOString(),
  };
  const next = [entry, ...getCustomTemplates().filter((t) => t?.title !== cleanTitle)];
  await saveSettings({ customTemplates: next });
  return next;
}

export async function removeCustomTemplate(id) {
  if (!id) return getCustomTemplates();
  const next = getCustomTemplates().filter((t) => t?.id !== id);
  await saveSettings({ customTemplates: next });
  return next;
}
