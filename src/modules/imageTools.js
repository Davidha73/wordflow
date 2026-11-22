/**
 * Handles inserting and pasting images via the pageShapes system so images
 * share all shape formatting, resizing, wrapping, alignment, and ordering options.
 */
const MAX_INITIAL_WIDTH = 480;

export function createImageTools({ wordEl, fileInputEl, pageShapes }) {
  function insertDataUrl(dataUrl, altText = 'Inserted image') {
    if (!dataUrl || !pageShapes?.insertImage) return;
    const probe = new Image();
    probe.onload = () => {
      const style = wordEl ? getComputedStyle(wordEl) : null;
      const contentWidth =
        wordEl && style
          ? wordEl.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
          : MAX_INITIAL_WIDTH;
      const maxW = Math.min(MAX_INITIAL_WIDTH, Math.max(120, contentWidth));
      const natW = probe.naturalWidth || 240;
      const natH = probe.naturalHeight || 180;
      const scale = natW > maxW ? maxW / natW : 1;
      pageShapes.insertImage({
        src: dataUrl,
        alt: altText,
        width: Math.round(natW * scale),
        height: Math.round(natH * scale),
      });
    };
    probe.src = dataUrl;
  }

  function insertImageFile(file) {
    if (!file || !file.type?.startsWith('image/')) return false;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        insertDataUrl(reader.result, file.name || 'Pasted image');
      }
    };
    reader.readAsDataURL(file);
    return true;
  }

  function handlePaste(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    let file = imageItem ? imageItem.getAsFile() : null;
    if (!file) {
      const files = Array.from(event.clipboardData?.files || []);
      file = files.find((f) => f.type?.startsWith('image/')) || null;
    }
    if (!file) return false;
    event.preventDefault();
    return insertImageFile(file);
  }

  function handleDrop(event) {
    const files = Array.from(event.dataTransfer?.files || []).filter((f) =>
      f.type?.startsWith('image/')
    );
    if (files.length === 0) return false;
    event.preventDefault();
    files.forEach((file) => insertImageFile(file));
    return true;
  }

  function openPicker() {
    if (!fileInputEl) return;
    fileInputEl.value = '';
    fileInputEl.click();
  }

  if (fileInputEl) {
    fileInputEl.addEventListener('change', () => {
      const files = Array.from(fileInputEl.files || []);
      files.forEach((file) => insertImageFile(file));
    });
  }

  return {
    openPicker,
    insertImageFile,
    insertDataUrl,
    handlePaste,
    handleDrop,
  };
}
