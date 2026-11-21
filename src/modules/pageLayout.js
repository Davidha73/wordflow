/**
 * Manages document sheet size (A4, Letter, Legal, A5) and orientation (portrait, landscape)
 * for both screen display and @page print output.
 */

const PAGE_DIMENSIONS = {
  A4: { widthPx: 794, heightPx: 1123, cssWidth: '210mm', cssHeight: '297mm' },
  Letter: { widthPx: 816, heightPx: 1056, cssWidth: '8.5in', cssHeight: '11in' },
  Legal: { widthPx: 816, heightPx: 1344, cssWidth: '8.5in', cssHeight: '14in' },
  A5: { widthPx: 559, heightPx: 794, cssWidth: '148mm', cssHeight: '210mm' },
};

const PRINT_STYLE_ID = 'wordflow-dynamic-page-style';

export function applyPageLayout(pageSize = 'A4', orientation = 'portrait') {
  const spec = PAGE_DIMENSIONS[pageSize] || PAGE_DIMENSIONS.A4;
  const isLandscape = orientation === 'landscape';

  const widthPx = isLandscape ? spec.heightPx : spec.widthPx;
  const heightPx = isLandscape ? spec.widthPx : spec.heightPx;
  const cssHeight = isLandscape ? spec.cssWidth : spec.cssHeight;

  const root = document.documentElement;
  root.style.setProperty('--page-width', `${widthPx}px`);
  root.style.setProperty('--page-height', `${heightPx}px`);

  let styleEl = document.getElementById(PRINT_STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = PRINT_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `@page { size: ${spec.cssWidth} ${spec.cssHeight} ${isLandscape ? 'landscape' : 'portrait'}; margin: 2.54cm; }\n@media print { .paper-canvas { min-height: ${cssHeight}; } }`;
}
