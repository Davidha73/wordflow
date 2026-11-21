import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';

export async function initWindowState(savedWindow, onSaveWindow, onBeforeClose) {
  let win;
  try {
    win = getCurrentWindow();
  } catch {
    return;
  }

  try {
    if (savedWindow?.maximized) {
      await win.maximize();
    } else {
      if (savedWindow?.width >= 400 && savedWindow?.height >= 300) {
        await win.setSize(new PhysicalSize(savedWindow.width, savedWindow.height));
      }
      if (
        typeof savedWindow?.x === 'number' &&
        typeof savedWindow?.y === 'number' &&
        savedWindow.x > -10000 &&
        savedWindow.y > -10000
      ) {
        await win.setPosition(new PhysicalPosition(savedWindow.x, savedWindow.y));
      }
    }
  } catch {
    // Ignore if running outside Tauri window context
  }

  let timer = null;
  const scheduleSave = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        if (await win.isMinimized()) {
          return;
        }
        const maximized = await win.isMaximized();
        if (maximized) {
          onSaveWindow?.({ maximized: true });
          return;
        }
        const size = await win.innerSize();
        const pos = await win.outerPosition();
        if (size.width < 400 || size.height < 300 || pos.x <= -10000 || pos.y <= -10000) {
          return;
        }
        onSaveWindow?.({
          width: size.width,
          height: size.height,
          x: pos.x,
          y: pos.y,
          maximized: false,
        });
      } catch {
        // Ignore outside Tauri
      }
    }, 350);
  };

  let isHandlingClose = false;
  try {
    await win.onResized(scheduleSave);
    await win.onMoved(scheduleSave);
    if (typeof onBeforeClose === 'function') {
      await win.onCloseRequested(async (event) => {
        event.preventDefault();
        if (isHandlingClose) return;
        isHandlingClose = true;
        try {
          const shouldClose = await onBeforeClose();
          if (shouldClose) {
            await win.destroy();
          }
        } finally {
          isHandlingClose = false;
        }
      });
    }
  } catch {
    // Ignore outside Tauri
  }
}
