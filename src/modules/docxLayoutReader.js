import JSZip from 'jszip';

const STANDARD_MARGINS = [0.5, 1, 1.5];
const STANDARD_SPACINGS = [1.0, 1.15, 1.5, 2.0];

function snapValue(value, candidates, tolerance = 0.06) {
  for (const c of candidates) {
    if (Math.abs(value - c) <= tolerance) return c;
  }
  return Math.round(value * 100) / 100;
}

function parseXmlAttr(tag, attrName) {
  const re = new RegExp(`(?:^|\\s)${attrName}=["']([^"']+)["']`, 'i');
  const match = tag.match(re);
  return match ? match[1] : null;
}

/**
 * Extracts page margins (in inches) and default line spacing multiplier from a .docx buffer.
 */
export async function extractDocxLayout(arrayBuffer) {
  const result = { pageMarginInches: null, lineSpacing: null };
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (docXml) {
      const pgMarMatch = docXml.match(/<w:pgMar\b[^>]*>/i);
      if (pgMarMatch) {
        const tag = pgMarMatch[0];
        const rawTwips =
          Number(parseXmlAttr(tag, 'w:left')) ||
          Number(parseXmlAttr(tag, 'w:top')) ||
          Number(parseXmlAttr(tag, 'w:right')) ||
          Number(parseXmlAttr(tag, 'w:bottom'));
        if (Number.isFinite(rawTwips) && rawTwips > 0) {
          result.pageMarginInches = snapValue(rawTwips / 1440, STANDARD_MARGINS);
        }
      }

      const spacingMatches = docXml.match(/<w:spacing\b[^>]*>/gi) || [];
      for (const tag of spacingMatches) {
        const lineRule = (parseXmlAttr(tag, 'w:lineRule') || 'auto').toLowerCase();
        const rawLine = Number(parseXmlAttr(tag, 'w:line'));
        if (lineRule === 'auto' && Number.isFinite(rawLine) && rawLine >= 120) {
          result.lineSpacing = snapValue(rawLine / 240, STANDARD_SPACINGS, 0.04);
          break;
        }
      }
    }

    if (result.lineSpacing === null) {
      const stylesXml = await zip.file('word/styles.xml')?.async('string');
      if (stylesXml) {
        const spacingMatch = stylesXml.match(/<w:spacing\b[^>]*>/i);
        if (spacingMatch) {
          const tag = spacingMatch[0];
          const lineRule = (parseXmlAttr(tag, 'w:lineRule') || 'auto').toLowerCase();
          const rawLine = Number(parseXmlAttr(tag, 'w:line'));
          if (lineRule === 'auto' && Number.isFinite(rawLine) && rawLine >= 120) {
            result.lineSpacing = snapValue(rawLine / 240, STANDARD_SPACINGS, 0.04);
          }
        }
      }
    }
  } catch {
    // Ignore malformed or partial docx archives; fall back to configured defaults.
  }
  return result;
}
