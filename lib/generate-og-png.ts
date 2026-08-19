import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Generates a valid 1200x630 static fallback PNG with Klir branding colors
 * (#0B0F19 base, #B5121B crimson glow, #C9A227 gold glow).
 */
export function generateOgImagePng(outputPath?: string): string {
  const targetPath =
    outputPath || path.join(process.cwd(), 'public', 'og-image.png');
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const width = 1200;
  const height = 630;

  // Precomputed CRC32 table
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }

  function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type: string, data: Buffer): Buffer {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  // PNG Signature
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit color depth
  ihdr.writeUInt8(6, 9); // RGBA color type
  ihdr.writeUInt8(0, 10); // Deflate compression
  ihdr.writeUInt8(0, 11); // Standard filter
  ihdr.writeUInt8(0, 12); // No interlace

  // Raw Scanlines (1 filter byte + width * 4 RGBA bytes per row)
  const bytesPerRow = 1 + width * 4;
  const rawData = Buffer.alloc(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * bytesPerRow;
    rawData[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Distance to crimson glow center (top-right)
      const dx1 = x - 1050;
      const dy1 = y - 100;
      const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const intensity1 = Math.max(0, 1 - dist1 / 650);

      // Distance to gold glow center (bottom-left)
      const dx2 = x - 150;
      const dy2 = y - 520;
      const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      const intensity2 = Math.max(0, 1 - dist2 / 550);

      let r = 11 + Math.round(170 * intensity1 * 0.35 + 190 * intensity2 * 0.22);
      let g = 15 + Math.round(3 * intensity1 * 0.35 + 147 * intensity2 * 0.22);
      let b = 25 + Math.round(2 * intensity1 * 0.35 + 14 * intensity2 * 0.22);

      // Subtle border frame
      if (
        ((x === 28 || x === width - 29) && y >= 28 && y <= height - 29) ||
        ((y === 28 || y === height - 29) && x >= 28 && x <= width - 29)
      ) {
        r = Math.min(255, r + 40);
        g = Math.min(255, g + 40);
        b = Math.min(255, b + 50);
      }

      rawData[pxOffset] = Math.min(255, r);
      rawData[pxOffset + 1] = Math.min(255, g);
      rawData[pxOffset + 2] = Math.min(255, b);
      rawData[pxOffset + 3] = 255;
    }
  }

  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  const pngBuffer = Buffer.concat([
    pngSig,
    makeChunk('IHDR', ihdr),
    idatChunk,
    iendChunk,
  ]);

  fs.writeFileSync(targetPath, pngBuffer);
  return targetPath;
}
