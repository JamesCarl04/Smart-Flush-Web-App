// lib/uv-lab-pdf.ts
// ISO/IEC 17025 (Clause 7.8) aligned scientific Laboratory Report PDF 1.4 generator
// with native vector Line Graph, multi-font typography, repeating table headers,
// exact PHT (UTC+8) HH:mm:ss audit logs, running headers/footers (Page X of Y),
// and formal authorization sign-off block.
import type {
  UvCycleReportExportData,
  UvCycleSeriesPoint,
} from '@/lib/uv-cycle-analytics';

type PdfFontKey = 'F1' | 'F2' | 'F3' | 'F4' | 'F5';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 42;
const RIGHT = 553;
const CONTENT_WIDTH = RIGHT - LEFT; // 511 pt
const RUNNING_HEADER_Y = 814;
const RUNNING_HEADER_RULE_Y = 805;
const CONTINUATION_START_Y = 786;
const FOOTER_RULE_Y = 46;
const FOOTER_TEXT_Y = 33;
const BODY_BOTTOM_LIMIT = 60;

// Authoritative Laboratory Color Palette (RGB 0..1)
const COLOR = {
  navy: '0.06 0.16 0.26', // #0F2942 — Lab headers & table banners
  navyLight: '0.94 0.96 0.98', // #EFF5FA — Callout & section strip fill
  crimson: '0.71 0.07 0.11', // #B5121B — Accent stripe / institutional mark
  dangerText: '0.72 0.11 0.11', // #B91C1C — Interrupted/deviation text
  dangerBg: '1.00 0.95 0.95', // #FEF2F2 — Interrupted row tint
  emerald: '0.02 0.59 0.41', // #059669 — Completed status / markers
  hydroBlue: '0.01 0.52 0.78', // #0284C7 — Primary line graph stroke
  indigo: '0.31 0.27 0.90', // #4F46E5 — Reference KPI accent
  charcoal: '0.12 0.16 0.23', // #1E293B — Primary body text
  slate: '0.35 0.42 0.52', // #596B85 — Secondary / metadata text
  muted: '0.47 0.53 0.62', // #78879E — Axis ticks & captions
  border: '0.80 0.84 0.88', // #CBD5E1 — Subtle horizontal rules & borders
  grid: '0.90 0.92 0.95', // #E5EBF2 — Chart gridlines
  zebra: '0.97 0.98 0.99', // #F8FAFC — Alternating table row tint
  white: '1.00 1.00 1.00',
};

function sanitizePdfAscii(value: string): string {
  return value
    .replaceAll('—', '-')
    .replaceAll('–', '-')
    .replaceAll('…', '...')
    .replaceAll('·', '|')
    .replaceAll('→', '->')
    .replaceAll('±', '+/-')
    .replaceAll(/[^\x20-\x7E]/g, '');
}

function escapePdfString(value: string): string {
  return sanitizePdfAscii(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function approxTextWidth(text: string, fontSize: number, font: PdfFontKey): number {
  const clean = sanitizePdfAscii(text);
  if (font === 'F4' || font === 'F5') {
    return clean.length * fontSize * 0.6;
  }
  let width = 0;
  for (const ch of clean) {
    if ("ilI1.,:;|!'` ".includes(ch)) {
      width += 0.28;
    } else if ('WMm@%#&'.includes(ch)) {
      width += 0.82;
    } else if (ch >= 'A' && ch <= 'Z') {
      width += 0.64;
    } else if (ch >= '0' && ch <= '9') {
      width += 0.56;
    } else {
      width += 0.5;
    }
  }
  const boldFactor = font === 'F2' ? 1.05 : 1.0;
  return width * fontSize * boldFactor;
}

function wrapLines(
  text: string,
  maxWidthPt: number,
  fontSize: number,
  font: PdfFontKey,
): string[] {
  const sanitized = sanitizePdfAscii(text).trim();
  if (!sanitized) return [''];

  const words = sanitized.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (approxTextWidth(candidate, fontSize, font) <= maxWidthPt) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    if (approxTextWidth(word, fontSize, font) <= maxWidthPt) {
      current = word;
      continue;
    }
    // Hard split overly long tokens (e.g. long IDs)
    const maxChars = Math.max(8, Math.floor(maxWidthPt / (fontSize * 0.6)));
    let rem = word;
    while (rem.length > maxChars) {
      lines.push(rem.slice(0, maxChars));
      rem = rem.slice(maxChars);
    }
    current = rem;
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
}

function truncateText(
  text: string,
  maxWidthPt: number,
  fontSize: number,
  font: PdfFontKey,
): string {
  const clean = sanitizePdfAscii(text);
  if (approxTextWidth(clean, fontSize, font) <= maxWidthPt) {
    return clean;
  }
  let out = clean;
  while (out.length > 3 && approxTextWidth(`${out}...`, fontSize, font) > maxWidthPt) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

function buildReportCode(report: UvCycleReportExportData): string {
  const compactDate = report.to.replaceAll('-', '');
  const seed = `${report.from}:${report.to}:${report.summary.totalCycles}:${report.logs[0]?.id ?? '0'}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(16).toUpperCase().padStart(6, '0').slice(0, 6);
  return `KLIR-UV-${compactDate}-${suffix}`;
}

function formatModeLabel(mode: string): string {
  switch (mode) {
    case 'hour':
      return 'Hourly (24-Hour PHT)';
    case 'minute':
      return 'Per-Minute (HH:mm PHT)';
    case 'second':
      return 'Exact Event Timeline (HH:mm:ss PHT)';
    case 'month':
      return 'Monthly (Calendar Year PHT)';
    case 'day':
    default:
      return 'Daily (Calendar Date PHT)';
  }
}

class LabPdfDocument {
  private pages: string[][] = [[]];
  private pageIndex = 0;
  public y = PAGE_HEIGHT;

  private push(cmd: string): void {
    this.pages[this.pageIndex].push(cmd);
  }

  public addPage(): void {
    this.pages.push([]);
    this.pageIndex += 1;
    this.y = CONTINUATION_START_Y;
  }

  public ensureSpace(requiredHeight: number, onNewPage?: () => void): void {
    if (this.y - requiredHeight < BODY_BOTTOM_LIMIT) {
      this.addPage();
      if (onNewPage) {
        onNewPage();
      }
    }
  }

  public rectFill(x: number, y: number, w: number, h: number, rgb: string): void {
    this.push(
      `q ${rgb} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f Q`,
    );
  }

  public rectStroke(
    x: number,
    y: number,
    w: number,
    h: number,
    rgb: string,
    lineWidth = 0.7,
  ): void {
    this.push(
      `q ${rgb} RG ${lineWidth.toFixed(2)} w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S Q`,
    );
  }

  public line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    rgb: string,
    lineWidth = 0.6,
    dash?: string,
  ): void {
    const dashCmd = dash ? ` ${dash} d` : '';
    this.push(
      `q ${rgb} RG ${lineWidth.toFixed(2)} w${dashCmd} ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`,
    );
  }

  public raw(cmd: string): void {
    this.push(cmd);
  }

  public text(
    str: string,
    x: number,
    y: number,
    options: {
      size?: number;
      font?: PdfFontKey;
      color?: string;
      align?: 'left' | 'right' | 'center';
    } = {},
  ): void {
    const size = options.size ?? 9;
    const font = options.font ?? 'F1';
    const color = options.color ?? COLOR.charcoal;
    const align = options.align ?? 'left';

    let drawX = x;
    if (align === 'right') {
      drawX = x - approxTextWidth(str, size, font);
    } else if (align === 'center') {
      drawX = x - approxTextWidth(str, size, font) / 2;
    }

    this.push(
      `q ${color} rg BT /${font} ${size.toFixed(1)} Tf 1 0 0 1 ${drawX.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfString(str)}) Tj ET Q`,
    );
  }

  public drawSectionHeader(num: string, title: string): void {
    this.ensureSpace(34);
    const barY = this.y - 16;
    this.rectFill(LEFT, barY, CONTENT_WIDTH, 17, COLOR.navyLight);
    this.rectFill(LEFT, barY, 3.5, 17, COLOR.navy);
    this.text(`${num}  ${title.toUpperCase()}`, LEFT + 10, barY + 5, {
      size: 8.5,
      font: 'F2',
      color: COLOR.navy,
    });
    this.line(LEFT, barY, RIGHT, barY, COLOR.border, 0.5);
    this.y = barY - 10;
  }

  public finalize(reportCode: string, generatedAtPht: string): Uint8Array {
    const totalPages = this.pages.length;

    for (let i = 0; i < totalPages; i += 1) {
      const overlay: string[] = [];

      // Running header on Pages 2+
      if (i > 0) {
        overlay.push(
          `q ${COLOR.navy} rg BT /F2 7.5 Tf 1 0 0 1 ${LEFT} ${RUNNING_HEADER_Y} Tm (${escapePdfString('KLIR IOT TELEMETRY LABORATORY  |  UV-C SANITIZATION VERIFICATION REPORT')}) Tj ET Q`,
        );
        const rightHeader = `Report No: ${reportCode}`;
        const rightHeaderX = RIGHT - approxTextWidth(rightHeader, 7.5, 'F4');
        overlay.push(
          `q ${COLOR.slate} rg BT /F4 7.5 Tf 1 0 0 1 ${rightHeaderX.toFixed(2)} ${RUNNING_HEADER_Y} Tm (${escapePdfString(rightHeader)}) Tj ET Q`,
        );
        overlay.push(
          `q ${COLOR.border} RG 0.6 w ${LEFT} ${RUNNING_HEADER_RULE_Y} m ${RIGHT} ${RUNNING_HEADER_RULE_Y} l S Q`,
        );
      }

      // Running footer on EVERY page (ISO/IEC 17025 Clause 7.8.2)
      overlay.push(
        `q ${COLOR.border} RG 0.6 w ${LEFT} ${FOOTER_RULE_Y} m ${RIGHT} ${FOOTER_RULE_Y} l S Q`,
      );
      const leftFooter = `This laboratory telemetry report shall not be reproduced except in full without facility authorization.  |  Generated: ${generatedAtPht.slice(0, 19).replace('T', ' ')} PHT`;
      overlay.push(
        `q ${COLOR.muted} rg BT /F1 6.8 Tf 1 0 0 1 ${LEFT} ${FOOTER_TEXT_Y} Tm (${escapePdfString(leftFooter)}) Tj ET Q`,
      );
      const pageLabel = `Page ${i + 1} of ${totalPages}`;
      const pageLabelX = RIGHT - approxTextWidth(pageLabel, 7.5, 'F2');
      overlay.push(
        `q ${COLOR.navy} rg BT /F2 7.5 Tf 1 0 0 1 ${pageLabelX.toFixed(2)} ${FOOTER_TEXT_Y} Tm (${escapePdfString(pageLabel)}) Tj ET Q`,
      );

      this.pages[i].push(...overlay);
    }

    return compilePdf14(this.pages);
  }
}

function compilePdf14(pageStreams: string[][]): Uint8Array {
  // Objects:
  // 1: Catalog, 2: Pages
  // 3..7: Standard Base-14 Fonts (F1=Helvetica, F2=Helvetica-Bold, F3=Helvetica-Oblique, F4=Courier, F5=Courier-Bold)
  // 8+: pairs of (Page obj, Content stream obj)
  const objects = new Map<number, string>();
  const pageObjNums: number[] = [];

  objects.set(1, '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.set(
    3,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  );
  objects.set(
    4,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
  );
  objects.set(
    5,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>\nendobj\n',
  );
  objects.set(
    6,
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
  );
  objects.set(
    7,
    '7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n',
  );

  let nextObj = 8;
  for (const cmds of pageStreams) {
    const pageObj = nextObj;
    const contentObj = nextObj + 1;
    nextObj += 2;

    pageObjNums.push(pageObj);
    const stream = cmds.join('\n');
    const byteLen = Buffer.byteLength(stream, 'utf8');

    objects.set(
      pageObj,
      `${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R /F5 7 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`,
    );
    objects.set(
      contentObj,
      `${contentObj} 0 obj\n<< /Length ${byteLen} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
  }

  objects.set(
    2,
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>\nendobj\n`,
  );

  const maxObj = nextObj - 1;
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = new Array(maxObj + 1).fill(0);

  for (let i = 1; i <= maxObj; i += 1) {
    const obj = objects.get(i);
    if (!obj) continue;
    offsets[i] = Buffer.byteLength(pdf, 'utf8');
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${maxObj + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= maxObj; i += 1) {
    pdf += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Uint8Array.from(Buffer.from(pdf, 'utf8'));
}

function drawVectorLineChart(
  doc: LabPdfDocument,
  series: UvCycleSeriesPoint[],
  bucketMode: string,
  topY: number,
): number {
  const boxHeight = 156;
  const boxBottom = topY - boxHeight;

  // Chart container card
  doc.rectFill(LEFT, boxBottom, CONTENT_WIDTH, boxHeight, COLOR.white);
  doc.rectStroke(LEFT, boxBottom, CONTENT_WIDTH, boxHeight, COLOR.border, 0.7);

  // Subtle top bar inside chart card
  doc.rectFill(LEFT, topY - 22, CONTENT_WIDTH, 22, COLOR.zebra);
  doc.line(LEFT, topY - 22, RIGHT, topY - 22, COLOR.border, 0.5);

  const chartHeader =
    bucketMode === 'second'
      ? 'UV Cycles Cumulative Line Graph (Exact HH:mm:ss PHT)'
      : `UV Cycles Logged Line Graph (${bucketMode} resolution, PHT UTC+8)`;
  doc.text(chartHeader, LEFT + 10, topY - 14.5, {
    size: 8.5,
    font: 'F2',
    color: COLOR.navy,
  });

  // Top-right legend
  const hasInterrupted =
    bucketMode !== 'second' && series.some((p) => p.interrupted > 0);
  const legendX = hasInterrupted ? RIGHT - 178 : RIGHT - 96;
  doc.line(legendX, topY - 11.5, legendX + 12, topY - 11.5, COLOR.hydroBlue, 1.8);
  doc.text('Logged Cycles', legendX + 16, topY - 14, {
    size: 7,
    font: 'F1',
    color: COLOR.slate,
  });
  if (hasInterrupted) {
    const intX = RIGHT - 78;
    doc.line(intX, topY - 11.5, intX + 12, topY - 11.5, COLOR.dangerText, 1.3, '[2 2] 0');
    doc.text('Interrupted', intX + 16, topY - 14, {
      size: 7,
      font: 'F1',
      color: COLOR.dangerText,
    });
  }

  const plotLeft = LEFT + 44;
  const plotRight = RIGHT - 16;
  const plotBottom = boxBottom + 29;
  const plotTop = topY - 41;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotTop - plotBottom;

  // Y-axis unit label
  doc.text('Cycles (n)', LEFT + 8, plotTop + 8, {
    size: 6.8,
    font: 'F2',
    color: COLOR.muted,
  });

  if (series.length === 0) {
    doc.text(
      'No UV-C sanitization cycle events were logged in the selected date window.',
      LEFT + CONTENT_WIDTH / 2,
      plotBottom + plotHeight / 2,
      { size: 8.5, font: 'F3', color: COLOR.muted, align: 'center' },
    );
    return boxBottom;
  }

  const maxCount = Math.max(1, ...series.map((p) => p.count));
  const yMax =
    maxCount <= 4 ? maxCount : Math.ceil((maxCount * 1.12) / 2) * 2;
  const yStepCount = 3;

  // Gridlines & right-aligned monospace Y ticks
  for (let s = 0; s <= yStepCount; s += 1) {
    const ratio = s / yStepCount;
    const yTick = plotBottom + ratio * plotHeight;
    const val = Math.round(yMax * ratio);
    if (s > 0) {
      doc.line(plotLeft, yTick, plotRight, yTick, COLOR.grid, 0.6);
    }
    doc.text(String(val), plotLeft - 6, yTick - 2.5, {
      size: 7.5,
      font: 'F4',
      color: COLOR.muted,
      align: 'right',
    });
  }

  // Crisp axes
  doc.line(plotLeft, plotBottom, plotRight, plotBottom, COLOR.slate, 0.8);
  doc.line(plotLeft, plotBottom, plotLeft, plotTop, COLOR.slate, 0.8);

  const coords = series.map((pt, idx) => {
    const x =
      series.length === 1
        ? plotLeft + plotWidth / 2
        : plotLeft + (idx / (series.length - 1)) * plotWidth;
    const y = plotBottom + (pt.count / yMax) * plotHeight;
    const yInt = plotBottom + (pt.interrupted / yMax) * plotHeight;
    return { x, y, yInt, pt };
  });

  // Subtle shaded baseline fill under line graph (non-obtrusive laboratory tint)
  if (coords.length > 1) {
    const fillCmds: string[] = [
      'q 0.91 0.96 0.99 rg',
      `${coords[0].x.toFixed(2)} ${plotBottom.toFixed(2)} m`,
      `${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)} l`,
    ];
    for (let i = 1; i < coords.length; i += 1) {
      if (bucketMode === 'second') {
        fillCmds.push(`${coords[i].x.toFixed(2)} ${coords[i - 1].y.toFixed(2)} l`);
      }
      fillCmds.push(`${coords[i].x.toFixed(2)} ${coords[i].y.toFixed(2)} l`);
    }
    fillCmds.push(`${coords[coords.length - 1].x.toFixed(2)} ${plotBottom.toFixed(2)} l f Q`);
    doc.raw(fillCmds.join('\n'));
  }

  // Primary Hydro-Blue polyline
  if (coords.length > 1) {
    const lineCmds: string[] = [
      `q ${COLOR.hydroBlue} RG 1.8 w 1 j 1 J`,
      `${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)} m`,
    ];
    for (let i = 1; i < coords.length; i += 1) {
      if (bucketMode === 'second') {
        lineCmds.push(`${coords[i].x.toFixed(2)} ${coords[i - 1].y.toFixed(2)} l`);
      }
      lineCmds.push(`${coords[i].x.toFixed(2)} ${coords[i].y.toFixed(2)} l`);
    }
    lineCmds.push('S Q');
    doc.raw(lineCmds.join('\n'));
  }

  // Crisp point markers (outer blue border + emerald fill)
  for (const c of coords) {
    if (coords.length <= 36 || c.pt.count > 0) {
      doc.raw(
        `q ${COLOR.emerald} rg ${COLOR.hydroBlue} RG 0.8 w ${(c.x - 2.2).toFixed(2)} ${(c.y - 2.2).toFixed(2)} 4.4 4.4 re B Q`,
      );
    }
  }

  // Secondary interrupted dashed polyline (if any)
  if (hasInterrupted && coords.length > 1) {
    const intCmds: string[] = [
      `q ${COLOR.dangerText} RG 1.3 w [3 3] 0 d`,
      `${coords[0].x.toFixed(2)} ${coords[0].yInt.toFixed(2)} m`,
    ];
    for (let i = 1; i < coords.length; i += 1) {
      intCmds.push(`${coords[i].x.toFixed(2)} ${coords[i].yInt.toFixed(2)} l`);
    }
    intCmds.push('S [] 0 d Q');
    doc.raw(intCmds.join('\n'));
  }

  // Evenly spaced X-axis labels (up to 8 ticks)
  const labelIndices = new Set<number>();
  const targetLabels = Math.min(8, coords.length);
  if (targetLabels === 1) {
    labelIndices.add(0);
  } else {
    for (let s = 0; s < targetLabels; s += 1) {
      labelIndices.add(Math.round((s * (coords.length - 1)) / (targetLabels - 1)));
    }
  }

  for (const idx of labelIndices) {
    const c = coords[idx];
    // Tick mark
    doc.line(c.x, plotBottom, c.x, plotBottom - 3.5, COLOR.slate, 0.7);
    const lbl = c.pt.label.slice(0, 10);
    const clampedX = Math.max(plotLeft + 14, Math.min(plotRight - 14, c.x));
    doc.text(lbl, clampedX, plotBottom - 12.5, {
      size: 7.2,
      font: 'F4',
      color: COLOR.slate,
      align: 'center',
    });
  }

  // X-axis caption
  doc.text(
    'Time Interval (Asia/Manila, UTC+8)',
    plotLeft + plotWidth / 2,
    boxBottom + 6,
    { size: 7, font: 'F2', color: COLOR.muted, align: 'center' },
  );

  return boxBottom;
}

/**
 * Generates an ISO/IEC 17025 styled Laboratory Telemetry Report PDF for UV Sanitization Cycles.
 */
export async function generateUvLabReportPDFBuffer(
  report: UvCycleReportExportData,
): Promise<Uint8Array> {
  const doc = new LabPdfDocument();
  const reportCode = buildReportCode(report);
  const avgDurationStr =
    report.summary.avgDurationSeconds !== null
      ? `${report.summary.avgDurationSeconds.toFixed(1)} s`
      : 'N/A';

  // ── Page 1 Top Institutional & Lab Masthead ────────────────────────────────
  doc.rectFill(0, PAGE_HEIGHT - 14, PAGE_WIDTH, 14, COLOR.navy);
  doc.rectFill(0, PAGE_HEIGHT - 17, PAGE_WIDTH, 3, COLOR.crimson);

  // Left Masthead Typography
  doc.text('KLIR SMART FLUSH  |  IOT SANITATION TELEMETRY LABORATORY', LEFT, 804, {
    size: 7.5,
    font: 'F2',
    color: COLOR.crimson,
  });
  doc.text('UV Sanitization Cycle Activity Report', LEFT, 783, {
    size: 17.5,
    font: 'F2',
    color: COLOR.navy,
  });
  doc.text(
    'Automated 5-Second UV-C Sterilization Verification & Audit',
    LEFT,
    767,
    { size: 8.6, font: 'F1', color: COLOR.slate },
  );

  // Right Document Control Box (ISO/IEC 17025 Clause 7.8.2)
  const ctrlX = 376;
  const ctrlW = RIGHT - ctrlX; // 177 pt
  const ctrlBottom = 758;
  const ctrlH = 56;
  doc.rectFill(ctrlX, ctrlBottom, ctrlW, ctrlH, COLOR.zebra);
  doc.rectFill(ctrlX, ctrlBottom + ctrlH - 14, ctrlW, 14, COLOR.navy);
  doc.rectStroke(ctrlX, ctrlBottom, ctrlW, ctrlH, COLOR.navy, 0.7);
  doc.text('DOCUMENT CONTROL', ctrlX + 7, ctrlBottom + ctrlH - 10, {
    size: 7,
    font: 'F2',
    color: COLOR.white,
  });

  const ctrlRows: Array<[string, string]> = [
    ['Report No:', reportCode],
    ['Issued (PHT):', report.generatedAtIso.slice(0, 19).replace('T', ' ')],
    ['Standard:', 'ISO/IEC 17025 Cl. 7.8'],
  ];
  let ctrlY = ctrlBottom + ctrlH - 24;
  for (const [k, v] of ctrlRows) {
    doc.text(k, ctrlX + 7, ctrlY, { size: 7, font: 'F2', color: COLOR.slate });
    doc.text(v, ctrlX + ctrlW - 7, ctrlY, {
      size: 7,
      font: 'F4',
      color: COLOR.charcoal,
      align: 'right',
    });
    ctrlY -= 11;
  }

  doc.line(LEFT, 749, RIGHT, 749, COLOR.navy, 1.0);
  doc.y = 740;

  // ── Section 1.0: Administrative & Equipment Identification ─────────────────
  doc.drawSectionHeader('1.0', 'Administrative & Equipment Identification');
  const metaH = 66;
  const metaBottom = doc.y - metaH;
  const midX = LEFT + Math.floor(CONTENT_WIDTH / 2);

  doc.rectFill(LEFT, metaBottom, CONTENT_WIDTH, metaH, COLOR.white);
  doc.rectStroke(LEFT, metaBottom, CONTENT_WIDTH, metaH, COLOR.border, 0.7);
  doc.line(midX, metaBottom, midX, metaBottom + metaH, COLOR.border, 0.5);

  const leftMeta: Array<[string, string]> = [
    ['Facility / Site:', 'St. Dominic College of Asia (SDCA) Annex'],
    ['System Under Test:', 'Klir Smart Flush IoT Restroom Unit'],
    ['Device Scope:', report.deviceId ?? 'All Active Hardware Units (toilet-01)'],
    ['Telemetry Path:', 'ESP32 -> HiveMQ TLS -> Cloud Firestore'],
  ];
  const rightMeta: Array<[string, string]> = [
    ['Observation Period:', `${report.from} to ${report.to}`],
    ['Timezone Standard:', report.timezone],
    ['Chart Resolution:', formatModeLabel(report.bucketMode)],
    ['Nominal UV Timer:', '5.0 s timer (NTP-synced)'],
  ];

  for (let i = 0; i < 4; i += 1) {
    const rowY = metaBottom + metaH - 14 - i * 15;
    if (i > 0) {
      doc.line(LEFT, rowY + 10.5, RIGHT, rowY + 10.5, COLOR.grid, 0.4);
    }
    doc.text(leftMeta[i][0], LEFT + 8, rowY, {
      size: 7.5,
      font: 'F2',
      color: COLOR.slate,
    });
    doc.text(truncateText(leftMeta[i][1], 162, 7.8, 'F1'), LEFT + 88, rowY, {
      size: 7.8,
      font: 'F1',
      color: COLOR.charcoal,
    });

    doc.text(rightMeta[i][0], midX + 8, rowY, {
      size: 7.5,
      font: 'F2',
      color: COLOR.slate,
    });
    doc.text(truncateText(rightMeta[i][1], 158, 7.8, 'F4'), midX + 92, rowY, {
      size: 7.5,
      font: 'F4',
      color: COLOR.charcoal,
    });
  }
  doc.y = metaBottom - 12;

  // ── Section 2.0: Executive Telemetry Summary ───────────────────────────────
  doc.drawSectionHeader('2.0', 'Executive Telemetry Summary');

  const cardGap = 9;
  const cardW = (CONTENT_WIDTH - cardGap * 3) / 4;
  const cardH = 54;
  const cardBottom = doc.y - cardH;

  const kpiCards: Array<{
    title: string;
    value: string;
    sub: string;
    accent: string;
  }> = [
    {
      title: 'CYCLES IN RANGE',
      value: String(report.summary.totalCycles),
      sub: `${report.summary.completedCycles} completed | ${report.summary.interruptedCycles} int.`,
      accent: COLOR.navy,
    },
    {
      title: 'AVG DURATION',
      value: avgDurationStr,
      sub: `Total runtime: ${report.summary.totalDurationSeconds.toFixed(0)} s`,
      accent: COLOR.hydroBlue,
    },
    {
      title: 'TODAY / THIS WEEK',
      value: `${report.summary.todayCount} / ${report.summary.thisWeekCount}`,
      sub: 'Daily & Mon-Sun (PHT)',
      accent: COLOR.emerald,
    },
    {
      title: 'MONTH / YEAR',
      value: `${report.summary.thisMonthCount} / ${report.summary.thisYearCount}`,
      sub: 'Calendar totals (PHT)',
      accent: COLOR.indigo,
    },
  ];

  kpiCards.forEach((card, idx) => {
    const cx = LEFT + idx * (cardW + cardGap);
    doc.rectFill(cx, cardBottom, cardW, cardH, COLOR.zebra);
    doc.rectStroke(cx, cardBottom, cardW, cardH, COLOR.border, 0.7);
    doc.rectFill(cx, cardBottom + cardH - 3, cardW, 3, card.accent);
    doc.text(card.title, cx + 8, cardBottom + cardH - 14, {
      size: 6.8,
      font: 'F2',
      color: COLOR.slate,
    });
    doc.text(card.value, cx + 8, cardBottom + 20, {
      size: 13.5,
      font: 'F5',
      color: COLOR.navy,
    });
    doc.text(truncateText(card.sub, cardW - 14, 6.8, 'F1'), cx + 8, cardBottom + 7.5, {
      size: 6.8,
      font: 'F1',
      color: COLOR.muted,
    });
  });

  // Objective Verification Basis & Relative Effectivity Callout
  const noteHeight = 28;
  const noteBottom = cardBottom - noteHeight - 6;
  doc.rectFill(LEFT, noteBottom, CONTENT_WIDTH, noteHeight, COLOR.navyLight);
  doc.rectStroke(LEFT, noteBottom, CONTENT_WIDTH, noteHeight, COLOR.border, 0.5);
  const conformityNote =
    report.summary.totalCycles === 0
      ? 'Observation Basis: 0 raw UV cycle logs recorded in this window. Values reflect direct event counts without synthetic percentages.'
      : `Observation Basis: Derived from ${report.summary.totalCycles} verified UV telemetry events (${report.summary.completedCycles} completed, ${report.summary.interruptedCycles} interrupted; mean ${avgDurationStr}).`;
  const relativeEffectivityNote =
    typeof report.summary.relativeEffectivityPercent === 'number'
      ? `Relative Effectivity ((Interrupted Avg / Completed Avg) x 100): ${report.summary.relativeEffectivityPercent.toFixed(1)}% (${(report.summary.interruptedAvgDurationSeconds ?? 0).toFixed(1)} s / ${(report.summary.completedAvgDurationSeconds ?? 0).toFixed(1)} s; constant irradiance H = I x t).`
      : report.summary.interruptedCycles === 0
        ? `Relative Effectivity ((Interrupted Avg / Completed Avg) x 100): N/A (0 interrupted cycles; completed mean ${typeof report.summary.completedAvgDurationSeconds === 'number' ? `${report.summary.completedAvgDurationSeconds.toFixed(1)} s` : avgDurationStr}; H = I x t).`
        : 'Relative Effectivity ((Interrupted Avg / Completed Avg) x 100): N/A (no completed baseline cycles recorded in window).';
  doc.text(truncateText(conformityNote, CONTENT_WIDTH - 14, 7.2, 'F1'), LEFT + 7, noteBottom + 16.5, {
    size: 7.2,
    font: 'F1',
    color: COLOR.charcoal,
  });
  doc.text(truncateText(relativeEffectivityNote, CONTENT_WIDTH - 14, 7.2, 'F1'), LEFT + 7, noteBottom + 5.5, {
    size: 7.2,
    font: 'F1',
    color: COLOR.slate,
  });

  doc.y = noteBottom - 10;

  // ── Section 3.0: Graphical Time-Series Analysis (Figure 1) ─────────────────
  doc.drawSectionHeader('3.0', 'Graphical Time-Series Analysis');
  const chartBottom = drawVectorLineChart(doc, report.series, report.bucketMode, doc.y);

  // Standardized Academic Figure Caption (Bold Prefix + Italic Description)
  const captionY = chartBottom - 12;
  const captionBody = `Time-series line graph of verified UV-C sanitization cycles logged for ${report.deviceId ?? 'all monitored units'} from ${report.from} to ${report.to} (${report.timezone}; mode: ${report.bucketMode}; n = ${report.summary.totalCycles} events).`;
  const wrappedCaption = wrapLines(`Figure 1.  ${captionBody}`, CONTENT_WIDTH, 8, 'F3');
  wrappedCaption.forEach((lineStr, idx) => {
    const cy = captionY - idx * 10.5;
    if (idx === 0 && lineStr.startsWith('Figure 1.')) {
      doc.text('Figure 1.', LEFT, cy, {
        size: 8,
        font: 'F2',
        color: COLOR.navy,
      });
      doc.text(lineStr.slice('Figure 1.'.length).trimStart(), LEFT + 43, cy, {
        size: 8,
        font: 'F3',
        color: COLOR.slate,
      });
    } else {
      doc.text(lineStr, LEFT, cy, {
        size: 8,
        font: 'F3',
        color: COLOR.slate,
      });
    }
  });

  doc.y = captionY - wrappedCaption.length * 10.5 - 10;

  // ── Section 4.0: Time-Series Bucket Distribution (Table 1) ─────────────────
  doc.drawSectionHeader('4.0', 'Time-Series Interval Distribution (Table 1)');

  const table1Cols = [
    { label: 'Interval / Bucket (PHT)', x: LEFT + 8, align: 'left' as const },
    { label: 'Total Cycles', x: LEFT + 215, align: 'right' as const },
    { label: 'Completed', x: LEFT + 295, align: 'right' as const },
    { label: 'Interrupted', x: LEFT + 375, align: 'right' as const },
    { label: 'Avg Dur.', x: LEFT + 445, align: 'right' as const },
    { label: 'Runtime', x: RIGHT - 8, align: 'right' as const },
  ];

  const drawTable1Header = () => {
    const headerH = 18;
    const hY = doc.y - headerH;
    doc.rectFill(LEFT, hY, CONTENT_WIDTH, headerH, COLOR.navy);
    for (const col of table1Cols) {
      doc.text(col.label, col.x, hY + 6, {
        size: 7.5,
        font: 'F2',
        color: COLOR.white,
        align: col.align,
      });
    }
    doc.y = hY;
  };

  const compactSeries =
    report.series.length > 35
      ? report.series.filter((pt) => pt.count > 0)
      : report.series;

  if (compactSeries.length === 0) {
    doc.ensureSpace(22);
    doc.text('No UV sanitization cycles were recorded during this observation window.', LEFT + 6, doc.y - 12, {
      size: 8.5,
      font: 'F3',
      color: COLOR.muted,
    });
    doc.y -= 26;
  } else {
    doc.ensureSpace(34);
    drawTable1Header();
    const maxBuckets = Math.min(compactSeries.length, 60);
    for (let i = 0; i < maxBuckets; i += 1) {
      const pt = compactSeries[i];
      const rowH = 14.5;
      doc.ensureSpace(rowH, drawTable1Header);
      const rY = doc.y - rowH;
      if (i % 2 === 1) {
        doc.rectFill(LEFT, rY, CONTENT_WIDTH, rowH, COLOR.zebra);
      }
      doc.line(LEFT, rY, RIGHT, rY, COLOR.grid, 0.5);

      const textY = rY + 4.3;
      doc.text(truncateText(pt.label, 145, 7.8, 'F4'), table1Cols[0].x, textY, {
        size: 7.8,
        font: 'F4',
        color: COLOR.charcoal,
      });
      doc.text(String(pt.count), table1Cols[1].x, textY, {
        size: 7.8,
        font: 'F5',
        color: COLOR.navy,
        align: 'right',
      });
      doc.text(String(pt.completed), table1Cols[2].x, textY, {
        size: 7.8,
        font: 'F4',
        color: COLOR.emerald,
        align: 'right',
      });
      doc.text(String(pt.interrupted), table1Cols[3].x, textY, {
        size: 7.8,
        font: 'F4',
        color: pt.interrupted > 0 ? COLOR.dangerText : COLOR.muted,
        align: 'right',
      });
      doc.text(
        pt.count > 0 ? `${pt.avgDurationSeconds.toFixed(1)}s` : '-',
        table1Cols[4].x,
        textY,
        { size: 7.8, font: 'F4', color: COLOR.slate, align: 'right' },
      );
      doc.text(`${pt.totalDurationSeconds.toFixed(0)}s`, table1Cols[5].x, textY, {
        size: 7.8,
        font: 'F4',
        color: COLOR.slate,
        align: 'right',
      });
      doc.y = rY;
    }

    // Booktabs closing rule
    doc.line(LEFT, doc.y, RIGHT, doc.y, COLOR.navy, 0.9);
    if (compactSeries.length > maxBuckets) {
      doc.y -= 12;
      doc.text(
        `Note: Showing ${maxBuckets} of ${compactSeries.length} intervals. Download CSV/JSON for the complete dataset.`,
        LEFT,
        doc.y,
        { size: 7.5, font: 'F3', color: COLOR.muted },
      );
    }
    doc.y -= 14;
  }

  // ── Section 5.0: Verified Raw UV Cycle Audit Log (Table 2) ─────────────────
  doc.drawSectionHeader(
    '5.0',
    `Verified Raw Telemetry Log — Exact PHT Timestamps (Table 2, n = ${report.logs.length})`,
  );

  const table2Cols = [
    { label: '#', x: LEFT + 22, align: 'right' as const },
    { label: 'Date (PHT)', x: LEFT + 34, align: 'left' as const },
    { label: 'Exact Time', x: LEFT + 106, align: 'left' as const },
    { label: 'Dur.', x: LEFT + 194, align: 'right' as const },
    { label: 'Verification Status', x: LEFT + 210, align: 'left' as const },
    { label: 'Device ID', x: LEFT + 338, align: 'left' as const },
    { label: 'Firestore Log ID', x: LEFT + 422, align: 'left' as const },
  ];

  const drawTable2Header = () => {
    const headerH = 18;
    const hY = doc.y - headerH;
    doc.rectFill(LEFT, hY, CONTENT_WIDTH, headerH, COLOR.navy);
    for (const col of table2Cols) {
      doc.text(col.label, col.x, hY + 6, {
        size: 7.3,
        font: 'F2',
        color: COLOR.white,
        align: col.align,
      });
    }
    doc.y = hY;
  };

  if (report.logs.length === 0) {
    doc.ensureSpace(22);
    doc.text(
      'No verified raw UV cycle records exist for this observation window.',
      LEFT + 6,
      doc.y - 12,
      { size: 8.5, font: 'F3', color: COLOR.muted },
    );
    doc.y -= 26;
  } else {
    doc.ensureSpace(34);
    drawTable2Header();
    const maxLogRows = Math.min(report.logs.length, 250);
    for (let i = 0; i < maxLogRows; i += 1) {
      const log = report.logs[i];
      const rowH = 14;
      doc.ensureSpace(rowH, drawTable2Header);
      const rY = doc.y - rowH;

      if (!log.completed) {
        doc.rectFill(LEFT, rY, CONTENT_WIDTH, rowH, COLOR.dangerBg);
      } else if (i % 2 === 1) {
        doc.rectFill(LEFT, rY, CONTENT_WIDTH, rowH, COLOR.zebra);
      }
      doc.line(LEFT, rY, RIGHT, rY, COLOR.grid, 0.45);

      const textY = rY + 4;
      const statusText = log.completed
        ? 'Completed'
        : `Interrupted${log.reason ? ` (${log.reason})` : ''}`;

      doc.text(String(i + 1), table2Cols[0].x, textY, {
        size: 7.4,
        font: 'F4',
        color: COLOR.muted,
        align: 'right',
      });
      doc.text(log.phtDate, table2Cols[1].x, textY, {
        size: 7.4,
        font: 'F4',
        color: COLOR.charcoal,
      });
      doc.text(log.phtTime, table2Cols[2].x, textY, {
        size: 7.6,
        font: 'F5',
        color: COLOR.navy,
      });
      doc.text(`${log.duration}s`, table2Cols[3].x, textY, {
        size: 7.4,
        font: 'F4',
        color: COLOR.hydroBlue,
        align: 'right',
      });
      doc.text(truncateText(statusText, 122, 7.4, 'F2'), table2Cols[4].x, textY, {
        size: 7.4,
        font: 'F2',
        color: log.completed ? COLOR.emerald : COLOR.dangerText,
      });
      doc.text(truncateText(log.deviceId, 78, 7.4, 'F4'), table2Cols[5].x, textY, {
        size: 7.4,
        font: 'F4',
        color: COLOR.slate,
      });
      doc.text(truncateText(log.id, 125, 7.2, 'F4'), table2Cols[6].x, textY, {
        size: 7.2,
        font: 'F4',
        color: COLOR.muted,
      });
      doc.y = rY;
    }

    doc.line(LEFT, doc.y, RIGHT, doc.y, COLOR.navy, 0.9);
    if (report.logs.length > maxLogRows) {
      doc.y -= 12;
      doc.text(
        `Note: Table capped at ${maxLogRows} of ${report.logs.length} verified records. Export CSV or JSON for the full chronological archive.`,
        LEFT,
        doc.y,
        { size: 7.5, font: 'F3', color: COLOR.muted },
      );
    }
    doc.y -= 14;
  }

  // ── Section 6.0: Traceability Statement & Formal Sign-Off Block ────────────
  // Keep methodology note + 3-column signature block + End-of-Report seal together
  doc.ensureSpace(150);
  doc.drawSectionHeader('6.0', 'Methodology, Traceability & Formal Authorization');

  const methodLines = wrapLines(
    'Methodology & Data Integrity: Each record reflects a hardware-emitted UV-C sanitization completion or interruption packet received over TLS-encrypted MQTT (topic: toilet/events/uv) and stamped by the NTP-synchronized ingestion clock in Asia/Manila (UTC+8). All counts, durations, and timestamps are reported verbatim from primary telemetry logs without synthetic smoothing or ratio inflation.',
    CONTENT_WIDTH - 16,
    7.6,
    'F1',
  );
  const methodBoxH = methodLines.length * 10.5 + 12;
  const methodBottom = doc.y - methodBoxH;
  doc.rectFill(LEFT, methodBottom, CONTENT_WIDTH, methodBoxH, COLOR.zebra);
  doc.rectStroke(LEFT, methodBottom, CONTENT_WIDTH, methodBoxH, COLOR.border, 0.6);
  methodLines.forEach((lineStr, idx) => {
    doc.text(lineStr, LEFT + 8, methodBottom + methodBoxH - 12 - idx * 10.5, {
      size: 7.6,
      font: 'F1',
      color: COLOR.charcoal,
    });
  });

  // 3-Column Sign-Off & Approval Block (ISO/IEC 17025 Clause 7.8.1.1)
  const sigTop = methodBottom - 10;
  const sigH = 66;
  const sigBottom = sigTop - sigH;
  const sigGap = 10;
  const sigW = (CONTENT_WIDTH - sigGap * 2) / 3;

  const signatories = [
    { role: 'PREPARED BY', title: 'System Administrator / Lab Tech' },
    { role: 'REVIEWED BY', title: 'QA Supervisor / Faculty Adviser' },
    { role: 'APPROVED BY', title: 'Dean / Facility Director' },
  ];

  signatories.forEach((sig, idx) => {
    const sx = LEFT + idx * (sigW + sigGap);
    doc.rectFill(sx, sigBottom, sigW, sigH, COLOR.white);
    doc.rectStroke(sx, sigBottom, sigW, sigH, COLOR.border, 0.7);
    doc.rectFill(sx, sigTop - 15, sigW, 15, COLOR.navyLight);
    doc.text(sig.role, sx + 8, sigTop - 10.5, {
      size: 6.8,
      font: 'F2',
      color: COLOR.navy,
    });
    doc.text(sig.title, sx + 8, sigTop - 25, {
      size: 7,
      font: 'F1',
      color: COLOR.slate,
    });
    // Signature rule
    doc.line(sx + 8, sigBottom + 18, sx + sigW - 8, sigBottom + 18, COLOR.slate, 0.6);
    doc.text('Signature / Printed Name', sx + 8, sigBottom + 7.5, {
      size: 6.5,
      font: 'F1',
      color: COLOR.muted,
    });
    doc.text('Date', sx + sigW - 8, sigBottom + 7.5, {
      size: 6.5,
      font: 'F1',
      color: COLOR.muted,
      align: 'right',
    });
  });

  // ISO/IEC 17025 End-of-Report Seal (prevents unauthorized page appending)
  doc.text('--- END OF LABORATORY REPORT ---', LEFT + CONTENT_WIDTH / 2, sigBottom - 15, {
    size: 7.5,
    font: 'F2',
    color: COLOR.slate,
    align: 'center',
  });

  return doc.finalize(reportCode, report.generatedAtIso);
}
