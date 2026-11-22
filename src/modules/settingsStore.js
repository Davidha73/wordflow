import { invoke } from '@tauri-apps/api/core';

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
  toolbarLayout: {},
  toolbarHidden: [],
  inspectorOpen: false,
  inspectorLayout: { mode: 'docked', dock: 'right', x: null, y: 112 },
  recoveryDraft: null,
  window: {
    width: 1120,
    height: 760,
    x: null,
    y: null,
    maximized: false,
  },
};

function cloneDefaults() {
  return {
    ...DEFAULTS,
    customStyles: [],
    customTemplates: [],
    recentDocuments: [],
    toolbarLayout: {},
    toolbarHidden: [],
    inspectorLayout: { ...DEFAULTS.inspectorLayout },
    window: { ...DEFAULTS.window },
  };
}

let cachedSettings = cloneDefaults();

export function getSettingsSnapshot() {
  return {
    ...cachedSettings,
    customStyles: [...(cachedSettings.customStyles || [])],
    customTemplates: [...(cachedSettings.customTemplates || [])],
    recentDocuments: [...(cachedSettings.recentDocuments || [])],
    toolbarLayout: { ...(cachedSettings.toolbarLayout || {}) },
    toolbarHidden: [...(cachedSettings.toolbarHidden || [])],
    inspectorLayout: {
      ...DEFAULTS.inspectorLayout,
      ...(cachedSettings.inspectorLayout || {}),
    },
    window: { ...DEFAULTS.window, ...(cachedSettings.window || {}) },
  };
}

export async function loadSettings() {
  try {
    const raw = await invoke('read_settings_file');
    if (!raw || !raw.trim()) {
      cachedSettings = cloneDefaults();
      await saveSettings(cachedSettings);
      return getSettingsSnapshot();
    }
    const parsed = JSON.parse(raw);
    const valid = parsed && typeof parsed === 'object' ? parsed : {};
    cachedSettings = {
      ...cloneDefaults(),
      ...valid,
      toolbarLayout:
        valid.toolbarLayout && typeof valid.toolbarLayout === 'object'
          ? { ...valid.toolbarLayout }
          : {},
      toolbarHidden: Array.isArray(valid.toolbarHidden) ? [...valid.toolbarHidden] : [],
      inspectorLayout: {
        ...DEFAULTS.inspectorLayout,
        ...(valid.inspectorLayout && typeof valid.inspectorLayout === 'object'
          ? valid.inspectorLayout
          : {}),
      },
      window: {
        ...DEFAULTS.window,
        ...(valid.window && typeof valid.window === 'object' ? valid.window : {}),
      },
    };
    return getSettingsSnapshot();
  } catch {
    cachedSettings = cloneDefaults();
    return getSettingsSnapshot();
  }
}

export async function saveSettings(patch) {
  cachedSettings = {
    ...cachedSettings,
    ...patch,
    inspectorLayout: patch?.inspectorLayout
      ? { ...cachedSettings.inspectorLayout, ...patch.inspectorLayout }
      : { ...cachedSettings.inspectorLayout },
    window: patch?.window
      ? { ...cachedSettings.window, ...patch.window }
      : { ...cachedSettings.window },
  };
  try {
    await invoke('write_settings_file', {
      contents: JSON.stringify(cachedSettings, null, 2),
    });
  } catch {
    // Ignore write errors outside Tauri runtime
  }
  return getSettingsSnapshot();
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
