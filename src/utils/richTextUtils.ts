// Utilities for handling clinical rich text (Blue/Red word coloring + Bold Purple Differential Diagnosis)
// while keeping full backward compatibility with legacy plain-text patient records.

const HTML_TAG_REGEX = /<(?:span|font|b|strong|br|div|p)\b[^>]*>/i;

export function looksLikeRichHtml(value: string | undefined | null): boolean {
  if (!value) return false;
  return HTML_TAG_REGEX.test(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeSafeColor(rawColor: string | null | undefined): string | null {
  if (!rawColor) return null;
  const c = rawColor.trim().toLowerCase();
  if (!c) return null;

  // Map common/browser color outputs to crisp accessible Blue, Red, or Purple
  if (
    c === '#0284c7' ||
    c === '#2563eb' ||
    c === '#0369a1' ||
    c === 'blue' ||
    c === 'rgb(2, 132, 199)' ||
    c === 'rgb(37, 99, 235)' ||
    c === 'rgb(3, 105, 161)'
  ) {
    return '#0284c7';
  }

  if (
    c === '#dc2626' ||
    c === '#ef4444' ||
    c === '#b91c1c' ||
    c === 'red' ||
    c === 'rgb(220, 38, 38)' ||
    c === 'rgb(239, 68, 68)' ||
    c === 'rgb(185, 28, 28)'
  ) {
    return '#dc2626';
  }

  if (
    c === '#7e22ce' ||
    c === '#9333ea' ||
    c === 'purple' ||
    c === 'rgb(126, 34, 206)' ||
    c === 'rgb(147, 51, 234)'
  ) {
    return '#7e22ce';
  }

  if (/^#[0-9a-f]{3,8}$/i.test(c)) return c;
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(c)) return c;
  return null;
}

function colorCssToHexNoHash(rawColor: string | null | undefined): string | undefined {
  const normalized = normalizeSafeColor(rawColor);
  if (!normalized) return undefined;
  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1).toUpperCase();
    if (hex.length === 3) {
      return hex
        .split('')
        .map((ch) => ch + ch)
        .join('');
    }
    return hex.slice(0, 6);
  }
  const rgbMatch = normalized.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    const r = Math.min(255, Number(rgbMatch[1])).toString(16).padStart(2, '0');
    const g = Math.min(255, Number(rgbMatch[2])).toString(16).padStart(2, '0');
    const b = Math.min(255, Number(rgbMatch[3])).toString(16).padStart(2, '0');
    return `${r}${g}${b}`.toUpperCase();
  }
  return undefined;
}

/**
 * Converts stored plain text or rich HTML into safe sanitized HTML suitable for
 * rendering in Read Mode or loading into a contentEditable editor.
 */
export function toDisplayHtml(value: string | undefined | null): string {
  if (!value) return '';
  if (!looksLikeRichHtml(value)) {
    return escapeHtml(value).replace(/\r?\n/g, '<br>');
  }
  return sanitizeClinicalHtml(value);
}

/**
 * Strictly sanitizes contentEditable innerHTML, stripping scripts/unsafe attributes
 * while preserving line breaks, bold tags, and inline font colors.
 */
export function sanitizeClinicalHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  if (typeof document === 'undefined') {
    return rawHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
  }

  const container = document.createElement('div');
  container.innerHTML = rawHtml;

  const walk = (node: Node, isBlockRoot = false): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml(node.textContent || '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT') {
      return '';
    }

    if (tag === 'BR') {
      return '<br>';
    }

    let inner = '';
    el.childNodes.forEach((child) => {
      inner += walk(child, false);
    });

    if (tag === 'DIV' || tag === 'P') {
      if (isBlockRoot) return inner;
      // Avoid double <br> when a block only contains <br>
      if (inner === '<br>' || inner === '') return '<br>';
      return `<br>${inner}`;
    }

    if (tag === 'B' || tag === 'STRONG') {
      return inner ? `<b>${inner}</b>` : '';
    }

    if (tag === 'SPAN' || tag === 'FONT') {
      const styleColor =
        el.style?.color || (tag === 'FONT' ? el.getAttribute('color') : null);
      const safeColor = normalizeSafeColor(styleColor);
      const isBold =
        el.style?.fontWeight === 'bold' ||
        Number(el.style?.fontWeight) >= 600;

      let res = inner;
      if (!res) return '';
      if (isBold) res = `<b>${res}</b>`;
      if (safeColor) res = `<span style="color: ${safeColor};">${res}</span>`;
      return res;
    }

    return inner;
  };

  let result = '';
  container.childNodes.forEach((child, index) => {
    if (
      index === 0 &&
      child.nodeType === Node.ELEMENT_NODE &&
      ((child as HTMLElement).tagName === 'DIV' ||
        (child as HTMLElement).tagName === 'P')
    ) {
      let blockInner = '';
      child.childNodes.forEach((grandChild) => {
        blockInner += walk(grandChild, false);
      });
      result += blockInner;
    } else {
      result += walk(child, false);
    }
  });

  // Clean trailing empty <br> left by browsers in empty contentEditable boxes
  result = result.replace(/(<br>\s*)+$/i, '');
  if (!stripHtmlToPlainText(result).trim()) {
    return '';
  }
  return result;
}

export function stripHtmlToPlainText(value: string | undefined | null): string {
  if (!value) return '';
  if (!looksLikeRichHtml(value)) return value;

  if (typeof document !== 'undefined') {
    const tmp = document.createElement('div');
    tmp.innerHTML = value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p)>/gi, '\n')
      .replace(/<(div|p)[^>]*>/gi, '');
    return (tmp.textContent || tmp.innerText || '').replace(/\n+$/g, '');
  }

  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
}

export function hasRichContent(value: string | undefined | null): boolean {
  return stripHtmlToPlainText(value).trim().length > 0;
}

export interface WordRichSegment {
  text: string;
  colorHex?: string;
  bold?: boolean;
}

/**
 * Parses HTML/plain clinical text into lines of styled Word segments so
 * Word (.docx) exports keep Blue/Red word highlights cleanly with zero raw tags.
 */
export function parseRichTextLinesForWord(
  value: string | undefined | null
): WordRichSegment[][] {
  const plainTrimmed = stripHtmlToPlainText(value).trim();
  if (!plainTrimmed) return [];

  if (!looksLikeRichHtml(value)) {
    return plainTrimmed.split(/\r?\n/).map((line) => [{ text: line }]);
  }

  if (typeof document === 'undefined') {
    return plainTrimmed.split(/\r?\n/).map((line) => [{ text: line }]);
  }

  const root = document.createElement('div');
  root.innerHTML = sanitizeClinicalHtml(value || '');

  const lines: WordRichSegment[][] = [[]];

  const pushText = (text: string, colorHex?: string, bold?: boolean) => {
    const normalized = text.replace(/\u00A0/g, ' ');
    const parts = normalized.split(/\r?\n/);
    parts.forEach((part, idx) => {
      if (idx > 0) {
        lines.push([]);
      }
      if (part.length > 0) {
        lines[lines.length - 1].push({ text: part, colorHex, bold });
      }
    });
  };

  const traverse = (
    node: Node,
    inheritedColor?: string,
    inheritedBold?: boolean
  ) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent || '', inheritedColor, inheritedBold);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === 'BR') {
      lines.push([]);
      return;
    }

    const isBlock = tag === 'DIV' || tag === 'P';
    if (isBlock && lines[lines.length - 1].length > 0) {
      lines.push([]);
    }

    let nextColor = inheritedColor;
    let nextBold = inheritedBold;

    if (tag === 'B' || tag === 'STRONG') {
      nextBold = true;
    }
    if (tag === 'SPAN' || tag === 'FONT') {
      const col =
        el.style?.color || (tag === 'FONT' ? el.getAttribute('color') : null);
      const hex = colorCssToHexNoHash(col);
      if (hex) nextColor = hex;
      if (
        el.style?.fontWeight === 'bold' ||
        Number(el.style?.fontWeight) >= 600
      ) {
        nextBold = true;
      }
    }

    el.childNodes.forEach((child) => traverse(child, nextColor, nextBold));
  };

  root.childNodes.forEach((child) => traverse(child));

  // Remove empty trailing lines cleanly
  while (
    lines.length > 1 &&
    lines[lines.length - 1].every((seg) => !seg.text.trim())
  ) {
    lines.pop();
  }

  return lines;
}
