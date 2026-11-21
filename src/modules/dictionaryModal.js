import { invoke } from '@tauri-apps/api/core';

export function initDictionaryModal({ onDictionaryChange } = {}) {
  const openBtn = document.getElementById('btn-manage-dictionary');
  const closeBtn = document.getElementById('btn-close-dict');
  const doneBtn = document.getElementById('btn-done-dict');
  const clearBtn = document.getElementById('btn-clear-dict');
  const modalEl = document.getElementById('dict-modal');
  const backdropEl = document.getElementById('dict-modal-backdrop');
  const listEl = document.getElementById('dict-words-list');
  const emptyEl = document.getElementById('dict-modal-empty');
  const statusEl = document.getElementById('dict-modal-status');

  if (!modalEl || !listEl) return;

  function setStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text;
    if (text) {
      window.setTimeout(() => {
        if (statusEl.textContent === text) statusEl.textContent = '';
      }, 2200);
    }
  }

  function renderWords(words) {
    const items = Array.isArray(words) ? words : [];
    listEl.innerHTML = '';
    if (emptyEl) {
      emptyEl.classList.toggle('is-hidden', items.length > 0);
    }
    if (clearBtn) {
      clearBtn.disabled = items.length === 0;
    }

    for (const word of items) {
      const chip = document.createElement('span');
      chip.className = 'dict-word-chip';

      const label = document.createElement('span');
      label.className = 'dict-word-text';
      label.textContent = word;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'dict-word-remove';
      removeBtn.title = `Remove "${word}"`;
      removeBtn.setAttribute('aria-label', `Remove ${word}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', async () => {
        try {
          const next = await invoke('remove_word_from_dictionary', { word });
          renderWords(next);
          onDictionaryChange?.();
        } catch {
          setStatus('Unable to remove word');
        }
      });

      chip.append(label, removeBtn);
      listEl.appendChild(chip);
    }
  }

  async function loadWords() {
    try {
      const words = await invoke('get_custom_dictionary');
      renderWords(words);
    } catch {
      renderWords([]);
      setStatus('Dictionary unavailable');
    }
  }

  function setOpen(isOpen) {
    if (isOpen) {
      loadWords();
    }
    modalEl.classList.toggle('is-open', isOpen);
    backdropEl?.classList.toggle('is-open', isOpen);
    modalEl.setAttribute('aria-hidden', String(!isOpen));
    backdropEl?.setAttribute('aria-hidden', String(!isOpen));
  }

  openBtn?.addEventListener('click', () => setOpen(true));
  closeBtn?.addEventListener('click', () => setOpen(false));
  doneBtn?.addEventListener('click', () => setOpen(false));
  backdropEl?.addEventListener('click', () => setOpen(false));

  clearBtn?.addEventListener('click', async () => {
    try {
      await invoke('clear_custom_dictionary');
      renderWords([]);
      setStatus('Dictionary cleared');
      onDictionaryChange?.();
    } catch {
      setStatus('Unable to clear dictionary');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalEl.classList.contains('is-open')) {
      setOpen(false);
    }
  });
}
