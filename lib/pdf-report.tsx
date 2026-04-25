// lib/pdf-report.tsx
// Server-safe PDF generation without relying on React renderers.

export interface FlushEventRow {
  id: string;
  deviceId: string;
  waterVolume: number;
  duration: number;
  timestamp: string;
}

export interface UVCycleRow {
  id: string;
  deviceId: string;
  duration: number;
  completed: boolean;
  timestamp: string;
}

interface PdfLine {
  text: string;
  fontSize: number;
  spacingAfter?: number;
}

interface PositionedLine {
  text: string;
  fontSize: number;
  x: number;
  y: number;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT_MARGIN = 40;
const TOP_MARGIN_Y = 800;
const BOTTOM_MARGIN_Y = 50;

function sanitizeText(value: string): string {
  return value
    .replaceAll('—', '-')
    .replaceAll('–', '-')
    .replaceAll('…', '...')
    .replaceAll(/[^\x20-\x7E]/g, '');
}

function escapePdfText(value: string): string {
  return sanitizeText(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function wrapText(text: string, maxChars: number): string[] {
  const sanitized = sanitizeText(text).trim();
  if (!sanitized) {
    return [''];
  }

  const words = sanitized.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxChars) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    if (word.length <= maxChars) {
      currentLine = word;
      continue;
    }

    let remaining = word;
    while (remaining.length > maxChars) {
      lines.push(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars);
    }
    currentLine = remaining;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

function buildReportLines(
  from: string,
  to: string,
  flushEvents: FlushEventRow[],
  uvCycles: UVCycleRow[],
): PdfLine[] {
  const totalWater = flushEvents.reduce(
    (sum, event) => sum + (event.waterVolume ?? 0),
    0,
  );
  const completedUvCycles = uvCycles.filter((cycle) => cycle.completed).length;
  const uvRate =
    uvCycles.length === 0
      ? '100%'
      : `${Math.round((completedUvCycles / uvCycles.length) * 100)}%`;

  const lines: PdfLine[] = [
    { text: 'Smart Flush System Report', fontSize: 20, spacingAfter: 10 },
    { text: `Period: ${from} to ${to}`, fontSize: 11, spacingAfter: 14 },
    { text: 'Summary', fontSize: 14, spacingAfter: 6 },
    { text: `Total Flushes: ${flushEvents.length}`, fontSize: 11 },
    {
      text: `Total Water Used: ${Math.round(totalWater * 100) / 100} L`,
      fontSize: 11,
    },
    { text: `UV Cycles: ${uvCycles.length}`, fontSize: 11 },
    { text: `UV Completion Rate: ${uvRate}`, fontSize: 11, spacingAfter: 14 },
    {
      text: `Flush Events (${flushEvents.length})`,
      fontSize: 14,
      spacingAfter: 6,
    },
  ];

  if (flushEvents.length === 0) {
    lines.push({
      text: 'No flush events were recorded for this period.',
      fontSize: 11,
      spacingAfter: 10,
    });
  } else {
    for (const event of flushEvents.slice(0, 20)) {
      lines.push({
        text: `${event.timestamp.slice(0, 16)}  ${event.deviceId}  ${event.waterVolume} L  ${event.duration}s`,
        fontSize: 10,
      });
    }

    if (flushEvents.length > 20) {
      lines.push({
        text: `... and ${flushEvents.length - 20} more flush events`,
        fontSize: 10,
        spacingAfter: 10,
      });
    } else {
      lines.push({ text: '', fontSize: 10, spacingAfter: 10 });
    }
  }

  lines.push({
    text: `UV Cycles (${uvCycles.length})`,
    fontSize: 14,
    spacingAfter: 6,
  });

  if (uvCycles.length === 0) {
    lines.push({
      text: 'No UV cycles were recorded for this period.',
      fontSize: 11,
    });
  } else {
    for (const cycle of uvCycles.slice(0, 12)) {
      lines.push({
        text: `${cycle.timestamp.slice(0, 16)}  ${cycle.deviceId}  ${cycle.completed ? 'Completed' : 'Failed'}  ${cycle.duration}s`,
        fontSize: 10,
      });
    }

    if (uvCycles.length > 12) {
      lines.push({
        text: `... and ${uvCycles.length - 12} more UV cycles`,
        fontSize: 10,
      });
    }
  }

  return lines;
}

function paginateLines(lines: PdfLine[]): PositionedLine[][] {
  const pages: PositionedLine[][] = [[]];
  let pageIndex = 0;
  let currentY = TOP_MARGIN_Y;

  for (const line of lines) {
    const wrappedLines = wrapText(line.text, line.fontSize >= 14 ? 64 : 90);
    const lineHeight = line.fontSize + 4;

    for (const wrappedLine of wrappedLines) {
      if (currentY - lineHeight < BOTTOM_MARGIN_Y) {
        pages.push([]);
        pageIndex += 1;
        currentY = TOP_MARGIN_Y;
      }

      pages[pageIndex].push({
        text: wrappedLine,
        fontSize: line.fontSize,
        x: LEFT_MARGIN,
        y: currentY,
      });
      currentY -= lineHeight;
    }

    currentY -= line.spacingAfter ?? 0;
  }

  return pages;
}

function buildContentStream(lines: PositionedLine[]): string {
  return lines
    .map((line) => {
      const text = escapePdfText(line.text);
      return [
        'BT',
        `/F1 ${line.fontSize} Tf`,
        `1 0 0 1 ${line.x} ${line.y} Tm`,
        `(${text}) Tj`,
        'ET',
      ].join('\n');
    })
    .join('\n');
}

function buildPdfBuffer(pages: PositionedLine[][]): Uint8Array {
  const objects = new Map<number, string>();
  const pageObjectNumbers: number[] = [];
  const maxObjectNumber = 3 + pages.length * 2;

  objects.set(1, '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.set(
    3,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  );

  let objectNumber = 4;
  for (const pageLines of pages) {
    const pageObjectNumber = objectNumber;
    const contentObjectNumber = objectNumber + 1;
    objectNumber += 2;

    pageObjectNumbers.push(pageObjectNumber);

    const contentStream = buildContentStream(pageLines);
    const contentLength = Buffer.byteLength(contentStream, 'utf8');

    objects.set(
      pageObjectNumber,
      `${pageObjectNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>\nendobj\n`,
    );
    objects.set(
      contentObjectNumber,
      `${contentObjectNumber} 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
    );
  }

  objects.set(
    2,
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjectNumbers.map((pageNumber) => `${pageNumber} 0 R`).join(' ')}] /Count ${pageObjectNumbers.length} >>\nendobj\n`,
  );

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = new Array(maxObjectNumber + 1).fill(0);

  for (let index = 1; index <= maxObjectNumber; index += 1) {
    const object = objects.get(index);
    if (!object) {
      continue;
    }

    offsets[index] = Buffer.byteLength(pdf, 'utf8');
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${maxObjectNumber + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let index = 1; index <= maxObjectNumber; index += 1) {
    pdf += `${offsets[index].toString().padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${maxObjectNumber + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Uint8Array.from(Buffer.from(pdf, 'utf8'));
}

export async function generatePDFBuffer(
  from: string,
  to: string,
  flushEvents: FlushEventRow[],
  uvCycles: UVCycleRow[],
): Promise<Uint8Array> {
  const lines = buildReportLines(from, to, flushEvents, uvCycles);
  const pages = paginateLines(lines);
  return buildPdfBuffer(pages);
}
