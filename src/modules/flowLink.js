import { invoke } from '@tauri-apps/api/core';

const FLOW_MARKER_RE = /<!--FLOW_SUITE:([A-Za-z0-9+/=]+)-->/;

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64Utf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function encodeFlowClipboardHtml(payload, fallbackHtml = '') {
  const json = JSON.stringify(payload);
  const b64 = toBase64Utf8(json);
  return `<!--FLOW_SUITE:${b64}-->${fallbackHtml}`;
}

export function decodeFlowClipboardHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const match = html.match(FLOW_MARKER_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(fromBase64Utf8(match[1]));
    if (parsed && parsed.flowSuite === 1) return parsed;
  } catch {
    // Ignore malformed payload
  }
  return null;
}

export async function writeFlowClipboard(payload, fallbackText = '') {
  const safeText = fallbackText || '';
  const html = encodeFlowClipboardHtml(payload, escapeHtml(safeText).replace(/\n/g, '<br>'));
  try {
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([safeText], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch {
    // Fallback below
  }
  if (safeText && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(safeText);
    return true;
  }
  return false;
}

export async function sendFlowHandoff(targetApp, payload) {
  const body = JSON.stringify({
    flowSuite: 1,
    createdAt: new Date().toISOString(),
    ...payload,
  });
  await invoke('write_flow_handoff', { target: targetApp, payload: body });
}

export function startFlowHandoffListener(thisApp, onReceive) {
  let checking = false;

  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      const raw = await invoke('consume_flow_handoff', { target: thisApp });
      if (!raw || !raw.trim()) return;
      const payload = JSON.parse(raw);
      if (payload && payload.flowSuite === 1) {
        await onReceive?.(payload);
      }
    } catch {
      // Ignore outside Tauri or invalid handoff
    } finally {
      checking = false;
    }
  };

  window.addEventListener('focus', check);
  const timerId = window.setInterval(() => {
    if (document.hasFocus()) check();
  }, 1500);
  check();

  return () => {
    window.removeEventListener('focus', check);
    window.clearInterval(timerId);
  };
}

let toastTimerId = 0;

export function showFlowToast(message, durationMs = 2200) {
  if (!message) return;
  let toastEl = document.getElementById('flow-toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'flow-toast';
    toastEl.className = 'flow-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  if (toastTimerId) window.clearTimeout(toastTimerId);
  toastTimerId = window.setTimeout(() => {
    toastEl?.classList.remove('is-visible');
    toastTimerId = 0;
  }, durationMs);
}
