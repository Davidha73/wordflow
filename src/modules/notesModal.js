import { save } from '@tauri-apps/plugin-dialog';
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

const NOTES_FILE = 'bugs-updates.md';
const LOCAL_KEY = 'wordflow-bugs-updates';

async function loadNotesText() {
  try {
    const fileExists = await exists(NOTES_FILE, { baseDir: BaseDirectory.AppData });
    if (fileExists) {
      return await readTextFile(NOTES_FILE, { baseDir: BaseDirectory.AppData });
    }
  } catch {
    // Fall back to localStorage outside Tauri
  }
  try {
    return localStorage.getItem(LOCAL_KEY) || '';
  } catch {
    return '';
  }
}

async function saveNotesText(content) {
  try {
    localStorage.setItem(LOCAL_KEY, content);
  } catch {
    // Ignore storage quota errors
  }
  try {
    await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true });
    await writeTextFile(NOTES_FILE, content, { baseDir: BaseDirectory.AppData });
    return true;
  } catch {
    return false;
  }
}

export function initNotesModal() {
  const openBtnEl = document.getElementById('btn-open-notes');
  const modalEl = document.getElementById('notes-modal');
  const backdropEl = document.getElementById('notes-modal-backdrop');
  const closeBtnEl = document.getElementById('btn-close-notes');
  const saveBtnEl = document.getElementById('btn-save-notes');
  const exportBtnEl = document.getElementById('btn-export-notes');
  const textareaEl = document.getElementById('notes-modal-textarea');
  const statusEl = document.getElementById('notes-modal-status');

  if (!modalEl || !backdropEl || !textareaEl) return;

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  async function setOpen(isOpen) {
    if (isOpen) {
      setStatus('');
      textareaEl.value = await loadNotesText();
    }
    modalEl.classList.toggle('is-open', isOpen);
    backdropEl.classList.toggle('is-open', isOpen);
    modalEl.setAttribute('aria-hidden', String(!isOpen));
    backdropEl.setAttribute('aria-hidden', String(!isOpen));
    if (isOpen) {
      setTimeout(() => textareaEl.focus(), 20);
    }
  }

  openBtnEl?.addEventListener('click', () => {
    setOpen(true);
  });

  closeBtnEl?.addEventListener('click', () => setOpen(false));
  backdropEl.addEventListener('click', () => setOpen(false));

  saveBtnEl?.addEventListener('click', async () => {
    const ok = await saveNotesText(textareaEl.value);
    setStatus(ok ? `Saved to ${NOTES_FILE}` : 'Saved locally');
  });

  exportBtnEl?.addEventListener('click', async () => {
    try {
      const targetPath = await save({
        defaultPath: 'bugs-and-updates.md',
        filters: [{ name: 'Markdown / Text', extensions: ['md', 'txt'] }],
      });
      if (!targetPath) return;
      await writeTextFile(targetPath, textareaEl.value);
      setStatus('Exported to file');
    } catch {
      setStatus('Export cancelled or unavailable');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalEl.classList.contains('is-open')) {
      setOpen(false);
    }
  });
}
