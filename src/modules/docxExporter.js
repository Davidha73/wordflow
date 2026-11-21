import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  AlignmentType,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const HEADING_MAP = {
  H1: HeadingLevel.HEADING_1,
  H2: HeadingLevel.HEADING_2,
  H3: HeadingLevel.HEADING_3,
};

const ALIGNMENT_MAP = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

function cleanFontName(rawFont) {
  if (!rawFont) return '';
  const first = rawFont.split(',')[0] || '';
  return first.replace(/^["'\s]+|["'\s]+$/g, '').trim();
}

function parseHalfPoints(rawSize, fallbackPt = 12) {
  if (!rawSize) return Math.round(fallbackPt * 2);
  const str = String(rawSize).trim().toLowerCase();
  const ptMatch = str.match(/^([\d.]+)\s*pt$/);
  if (ptMatch) return Math.round(parseFloat(ptMatch[1]) * 2);
  const pxMatch = str.match(/^([\d.]+)\s*px$/);
  if (pxMatch) return Math.round(parseFloat(pxMatch[1]) * 0.75 * 2);
  const num = parseFloat(str);
  if (!Number.isNaN(num) && num > 0) return Math.round(num * 2);
  return Math.round(fallbackPt * 2);
}

function normalizeHexColor(rawColor) {
  if (!rawColor) return '';
  const str = String(rawColor).trim();
  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 3) {
      return hex
        .split('')
        .map((ch) => ch + ch)
        .join('')
        .toUpperCase();
    }
    if (hex.length === 6) return hex.toUpperCase();
    return '';
  }

  const rgbMatch = str.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return [rgbMatch[1], rgbMatch[2], rgbMatch[3]]
      .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  return '';
}

function readElementFont(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
  const inlineFont = el.style?.fontFamily;
  if (inlineFont) return cleanFontName(inlineFont);
  const faceAttr = el.getAttribute?.('face');
  if (faceAttr) return cleanFontName(faceAttr);
  return '';
}

function readElementColor(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
  if (el.style?.color) return normalizeHexColor(el.style.color);
  const colorAttr = el.getAttribute?.('color');
  if (colorAttr) return normalizeHexColor(colorAttr);
  return '';
}

function readElementAlignment(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return undefined;
  const raw = (el.style?.textAlign || el.getAttribute?.('align') || '').toLowerCase().trim();
  return ALIGNMENT_MAP[raw];
}

function readElementLineSpacing(el, fallbackMultiplier = 1.15) {
  const raw = el?.style?.lineHeight;
  const parsed = raw ? parseFloat(raw) : NaN;
  const multiplier = !Number.isNaN(parsed) && parsed > 0 ? parsed : fallbackMultiplier;
  return Math.round(multiplier * 240);
}

function collectRuns(node, styles = {}) {
  const runs = [];

  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent;
      if (text) {
        runs.push(
          new TextRun({
            text,
            bold: Boolean(styles.bold),
            italics: Boolean(styles.italics),
            underline: styles.underline ? {} : undefined,
            strike: Boolean(styles.strike),
            font: styles.code ? 'Consolas' : styles.font || undefined,
            size: styles.size || undefined,
            color: styles.color || undefined,
          })
        );
      }
      return;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const tag = child.tagName.toUpperCase();
    if (tag === 'UL' || tag === 'OL') {
      return;
    }
    if (tag === 'BR') {
      runs.push(new TextRun({ break: 1 }));
      return;
    }
    if (tag === 'A') {
      const href = child.getAttribute('href');
      if (href) {
        const linkRuns = collectRuns(child, {
          ...styles,
          underline: true,
          color: styles.color || '2563EB',
        });
        if (linkRuns.length > 0) {
          runs.push(new ExternalHyperlink({ link: href, children: linkRuns }));
          return;
        }
      }
    }

    const nextStyles = { ...styles };
    if (tag === 'STRONG' || tag === 'B') nextStyles.bold = true;
    if (tag === 'EM' || tag === 'I') nextStyles.italics = true;
    if (tag === 'U') nextStyles.underline = true;
    if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') nextStyles.strike = true;
    if (tag === 'CODE') nextStyles.code = true;

    const elementFont = readElementFont(child);
    if (elementFont) nextStyles.font = elementFont;

    if (child.style?.fontSize) {
      nextStyles.size = parseHalfPoints(child.style.fontSize);
    }

    const elementColor = readElementColor(child);
    if (elementColor) nextStyles.color = elementColor;

    runs.push(...collectRuns(child, nextStyles));
  });

  return runs;
}

function buildParagraphFromElement(el, extraOptions = {}) {
  const baseFont = readElementFont(el) || extraOptions.defaultFont;
  const baseSize = el.style?.fontSize
    ? parseHalfPoints(el.style.fontSize)
    : extraOptions.defaultHalfPoints;
  const baseColor = readElementColor(el);

  const inlineStyles = {
    ...(extraOptions.inlineStyles || {}),
    ...(baseFont ? { font: baseFont } : {}),
    ...(baseSize ? { size: baseSize } : {}),
    ...(baseColor ? { color: baseColor } : {}),
  };

  const runs = collectRuns(el, inlineStyles);
  const alignment = readElementAlignment(el);
  const line = readElementLineSpacing(el, extraOptions.defaultLineSpacing);

  return new Paragraph({
    children:
      runs.length > 0
        ? runs
        : [new TextRun({ text: '', font: baseFont || undefined, size: baseSize || undefined })],
    heading: extraOptions.heading,
    bullet: extraOptions.bullet,
    numbering: extraOptions.numbering,
    indent: extraOptions.indent,
    border: extraOptions.border,
    alignment,
    spacing: { line },
  });
}

async function rasterizeSvgToPngBytes(svgEl) {
  const clone = svgEl.cloneNode(true);
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  const width = Number(clone.getAttribute('width')) || 600;
  const height = Number(clone.getAttribute('height')) || 260;

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (err) => reject(err);
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { bytes, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function buildDocxTable(tableEl, docStyles) {
  const { defaultFont, defaultHalfPoints, defaultLineSpacing } = docStyles;
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  if (rows.length === 0) return null;

  const cellBorder = {
    style: BorderStyle.SINGLE,
    size: 4,
    color: 'D4D4D8',
  };

  const tableRows = rows.map((tr) => {
    const cells = Array.from(tr.querySelectorAll('th, td'));
    const colWidthPct = Math.max(10, Math.floor(100 / Math.max(cells.length, 1)));

    const tableCells = cells.map((cell) => {
      const isHeader = cell.tagName.toUpperCase() === 'TH';
      const p = buildParagraphFromElement(cell, {
        defaultFont,
        defaultHalfPoints,
        defaultLineSpacing,
        inlineStyles: isHeader ? { bold: true } : {},
      });

      return new TableCell({
        width: { size: colWidthPct, type: WidthType.PERCENTAGE },
        borders: {
          top: cellBorder,
          bottom: cellBorder,
          left: cellBorder,
          right: cellBorder,
        },
        children: [p],
      });
    });

    return new TableRow({ children: tableCells });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });
}

function collectListBlocks(listEl, isOrdered, level, docStyles) {
  const { defaultFont, defaultHalfPoints, defaultLineSpacing } = docStyles;
  const listFont = readElementFont(listEl) || defaultFont;
  const clampedLevel = Math.min(level, 4);
  const items = [];

  let orderedRef = 'wordflow-ordered';
  let orderedInstance = 0;
  if (isOrdered) {
    const rawStart = parseInt(listEl.getAttribute('start') || '1', 10);
    const startNum = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : 1;
    if (startNum !== 1) {
      orderedRef = `wordflow-ordered-${startNum}`;
      docStyles.orderedStarts?.add(startNum);
    }
    orderedInstance = docStyles.nextOrderedInstance || 1;
    if (docStyles.nextOrderedInstance !== undefined) {
      docStyles.nextOrderedInstance += 1;
    }
  }

  listEl.querySelectorAll(':scope > li').forEach((li) => {
    const hasDirectText = Array.from(li.childNodes).some(
      (n) =>
        (n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0) ||
        (n.nodeType === Node.ELEMENT_NODE && !['UL', 'OL'].includes(n.tagName.toUpperCase()))
    );

    if (hasDirectText) {
      const listOpt = isOrdered
        ? { numbering: { reference: orderedRef, level: clampedLevel, instance: orderedInstance } }
        : { bullet: { level: clampedLevel } };

      items.push(
        buildParagraphFromElement(li, {
          ...listOpt,
          defaultFont: listFont,
          defaultHalfPoints,
          defaultLineSpacing,
        })
      );
    }

    li.querySelectorAll(':scope > ul, :scope > ol').forEach((subList) => {
      items.push(
        ...collectListBlocks(
          subList,
          subList.tagName.toUpperCase() === 'OL',
          hasDirectText ? level + 1 : level,
          docStyles
        )
      );
    });
  });

  return items;
}

async function walkBlockNodes(container, docStyles) {
  const blocks = [];
  const { defaultFont, defaultHalfPoints, defaultLineSpacing } = docStyles;

  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        blocks.push(
          new Paragraph({
            children: [
              new TextRun({
                text,
                font: defaultFont || undefined,
                size: defaultHalfPoints || undefined,
              }),
            ],
            spacing: { line: Math.round(defaultLineSpacing * 240) },
          })
        );
      }
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = node.tagName.toUpperCase();

    if (node.classList?.contains('svg-diagram-block')) {
      const svgEl = node.querySelector('svg');
      if (svgEl) {
        try {
          const { bytes, width, height } = await rasterizeSvgToPngBytes(svgEl);
          const displayWidth = Math.min(520, width);
          const displayHeight = Math.round((displayWidth / width) * height);
          blocks.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: bytes,
                  transformation: {
                    width: displayWidth,
                    height: displayHeight,
                  },
                  type: 'png',
                }),
              ],
            })
          );
        } catch {
          blocks.push(
            new Paragraph({
              children: [new TextRun({ text: '[Diagram: SVG Drawing]', font: defaultFont })],
            })
          );
        }
      }
      continue;
    }

    if (tag === 'TABLE') {
      const docxTable = buildDocxTable(node, docStyles);
      if (docxTable) blocks.push(docxTable);
      continue;
    }

    if (HEADING_MAP[tag]) {
      blocks.push(
        buildParagraphFromElement(node, {
          heading: HEADING_MAP[tag],
          defaultFont,
          defaultLineSpacing,
        })
      );
    } else if (tag === 'P' || tag === 'DIV') {
      blocks.push(
        buildParagraphFromElement(node, {
          defaultFont,
          defaultHalfPoints,
          defaultLineSpacing,
        })
      );
    } else if (tag === 'UL' || tag === 'OL') {
      blocks.push(
        ...collectListBlocks(node, tag === 'OL', 0, docStyles)
      );
    } else if (tag === 'BLOCKQUOTE') {
      blocks.push(
        buildParagraphFromElement(node, {
          defaultFont,
          defaultHalfPoints,
          defaultLineSpacing,
          inlineStyles: { italics: true },
          indent: { left: 720 },
          border: {
            left: {
              style: BorderStyle.SINGLE,
              size: 12,
              space: 8,
              color: '3B82F6',
            },
          },
        })
      );
    } else if (tag === 'PRE') {
      blocks.push(
        buildParagraphFromElement(node, {
          defaultFont,
          defaultHalfPoints,
          defaultLineSpacing,
          inlineStyles: { code: true },
          indent: { left: 360 },
        })
      );
    } else {
      blocks.push(
        buildParagraphFromElement(node, {
          defaultFont,
          defaultHalfPoints,
          defaultLineSpacing,
        })
      );
    }
  }

  if (blocks.length === 0) {
    blocks.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '',
            font: defaultFont || undefined,
            size: defaultHalfPoints || undefined,
          }),
        ],
        spacing: { line: Math.round(defaultLineSpacing * 240) },
      })
    );
  }

  return blocks;
}

async function rasterizePageShapes(shapes) {
  if (!Array.isArray(shapes) || shapes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = 0;
  let maxY = 0;

  shapes.forEach((s) => {
    if (s.type === 'line' || s.type === 'arrow') {
      minX = Math.min(minX, s.x1 - 12, s.x2 - 12);
      minY = Math.min(minY, s.y1 - 12, s.y2 - 12);
      maxX = Math.max(maxX, s.x1 + 12, s.x2 + 12);
      maxY = Math.max(maxY, s.y1 + 12, s.y2 + 12);
    } else {
      minX = Math.min(minX, s.x - 10);
      minY = Math.min(minY, s.y - 10);
      maxX = Math.max(maxX, s.x + s.w + 10);
      maxY = Math.max(maxY, s.y + s.h + 10);
    }
  });

  const width = Math.max(100, Math.round(maxX - minX));
  const height = Math.max(80, Math.round(maxY - minY));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  shapes.forEach((s) => {
    ctx.save();
    const strokeWidth = s.strokeWidth || (s.type === 'line' || s.type === 'arrow' ? 2.5 : 2);
    const dashPattern =
      s.strokeStyle === 'dashed'
        ? [Math.max(4, strokeWidth * 3), Math.max(3, strokeWidth * 2)]
        : s.strokeStyle === 'dotted'
          ? [Math.max(1.5, strokeWidth), Math.max(2.5, strokeWidth * 1.6)]
          : [];

    if (s.type === 'line' || s.type === 'arrow') {
      const stroke = s.strokeColor || '#1a1a1a';
      if (stroke !== 'none') {
        const x1 = s.x1 - minX;
        const y1 = s.y1 - minY;
        const x2 = s.x2 - minX;
        const y2 = s.y2 - minY;
        ctx.strokeStyle = stroke;
        ctx.fillStyle = stroke;
        ctx.lineWidth = strokeWidth;
        ctx.lineCap = 'round';
        ctx.setLineDash(dashPattern);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        const drawCanvasMarker = (px, py, angle, style) => {
          if (!style || style === 'none') return;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(angle);
          const headLen = Math.max(9, strokeWidth * 3.5);
          if (style === 'arrow') {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-headLen, -headLen * 0.55);
            ctx.lineTo(-headLen, headLen * 0.55);
            ctx.closePath();
            ctx.fill();
          } else if (style === 'open') {
            ctx.beginPath();
            ctx.moveTo(-headLen, -headLen * 0.55);
            ctx.lineTo(0, 0);
            ctx.lineTo(-headLen, headLen * 0.55);
            ctx.stroke();
          } else if (style === 'dot') {
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(4, strokeWidth * 1.6), 0, Math.PI * 2);
            ctx.fill();
          } else if (style === 'diamond') {
            const r = Math.max(5.5, strokeWidth * 2.2);
            ctx.beginPath();
            ctx.moveTo(r, 0);
            ctx.lineTo(0, -r * 0.75);
            ctx.lineTo(-r, 0);
            ctx.lineTo(0, r * 0.75);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        };

        const lineAngle = Math.atan2(y2 - y1, x2 - x1);
        const startMarker = s.startMarker || 'none';
        const endMarker = s.endMarker || (s.type === 'arrow' ? 'arrow' : 'none');
        drawCanvasMarker(x1, y1, lineAngle + Math.PI, startMarker);
        drawCanvasMarker(x2, y2, lineAngle, endMarker);
      }
    } else {
      const cx = s.x - minX + s.w / 2;
      const cy = s.y - minY + s.h / 2;
      ctx.translate(cx, cy);
      ctx.rotate(((s.rotation || 0) * Math.PI) / 180);

      const fill = s.fillColor || '#ffffff';
      const stroke = s.strokeColor || '#1a1a1a';

      if (s.type === 'rect') {
        if (fill !== 'none') {
          ctx.fillStyle = fill;
          ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
        }
        if (stroke !== 'none') {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = strokeWidth;
          ctx.setLineDash(dashPattern);
          ctx.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
          ctx.setLineDash([]);
        }
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
        if (fill !== 'none') {
          ctx.fillStyle = fill;
          ctx.fill();
        }
        if (stroke !== 'none') {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = strokeWidth;
          ctx.setLineDash(dashPattern);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      if (s.label) {
        const lightFills = new Set(['none', '#ffffff', '#FFFF00', '#FFC000', '#92D050']);
        ctx.fillStyle = lightFills.has(fill) ? '#1a1a1a' : '#ffffff';
        ctx.font = '500 13px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.label, 0, 0, s.w - 12);
      }
    }
    ctx.restore();
  });

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, width, height };
}

export async function htmlToDocxBytes(
  html,
  {
    defaultFont = 'Georgia',
    defaultFontSize = '12pt',
    defaultLineSpacing = 1.15,
    pageMarginInches = 1,
    shapes = [],
    headerFooter = null,
  } = {}
) {
  const cleanDefault = cleanFontName(defaultFont) || 'Georgia';
  const defaultHalfPoints = parseHalfPoints(defaultFontSize, 12);
  const marginTwips = Math.round((Number(pageMarginInches) || 1) * 1440);

  const parser = new DOMParser();
  const parsed = parser.parseFromString(html || '', 'text/html');
  const orderedStarts = new Set([1]);
  const children = await walkBlockNodes(parsed.body, {
    defaultFont: cleanDefault,
    defaultHalfPoints,
    defaultLineSpacing: Number(defaultLineSpacing) || 1.15,
    orderedStarts,
    nextOrderedInstance: 1,
  });

  const shapeImg = await rasterizePageShapes(shapes);
  if (shapeImg) {
    const displayWidth = Math.min(520, shapeImg.width);
    const displayHeight = Math.round((displayWidth / shapeImg.width) * shapeImg.height);
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: shapeImg.bytes,
            transformation: { width: displayWidth, height: displayHeight },
            type: 'png',
          }),
        ],
      })
    );
  }

  const numberingConfig = Array.from(orderedStarts).map((startNum) => ({
    reference: startNum === 1 ? 'wordflow-ordered' : `wordflow-ordered-${startNum}`,
    levels: [0, 1, 2, 3, 4].map((lvl) => ({
      level: lvl,
      format: LevelFormat.DECIMAL,
      text: `%${lvl + 1}.`,
      start: startNum,
      alignment: AlignmentType.START,
      style: {
        paragraph: {
          indent: { left: 720 * (lvl + 1), hanging: 260 },
        },
      },
    })),
  }));

  const hfStyle = {
    defaultFont: cleanDefault,
    defaultHalfPoints: 18,
    defaultLineSpacing: 1.15,
  };

  let sectionHeaders;
  if (headerFooter?.headerHtml) {
    const hfDoc = parser.parseFromString(headerFooter.headerHtml, 'text/html');
    const headerBlocks = await walkBlockNodes(hfDoc.body, hfStyle);
    if (headerBlocks.length > 0) {
      sectionHeaders = { default: new Header({ children: headerBlocks }) };
    }
  }

  const footerBlocks = [];
  if (headerFooter?.footerHtml) {
    const ffDoc = parser.parseFromString(headerFooter.footerHtml, 'text/html');
    footerBlocks.push(...(await walkBlockNodes(ffDoc.body, hfStyle)));
  }
  if (headerFooter?.showPageNumbers) {
    footerBlocks.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: 'Page ', font: cleanDefault, size: 18, color: '6B7280' }),
          new TextRun({ children: [PageNumber.CURRENT], font: cleanDefault, size: 18, color: '6B7280' }),
          new TextRun({ text: ' of ', font: cleanDefault, size: 18, color: '6B7280' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: cleanDefault, size: 18, color: '6B7280' }),
        ],
      })
    );
  }
  const sectionFooters =
    footerBlocks.length > 0 ? { default: new Footer({ children: footerBlocks }) } : undefined;

  const doc = new Document({
    numbering: {
      config: numberingConfig,
    },
    sections: [
      {
        headers: sectionHeaders,
        footers: sectionFooters,
        properties: {
          page: {
            margin: {
              top: marginTwips,
              bottom: marginTwips,
              left: marginTwips,
              right: marginTwips,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}
