/* ═══════════════════════════════════════════════════════
   ForgeDoc — PDF operations on top of pdf-lib. Every
   function takes/returns bytes, so the whole engine is
   unit-testable in Node. DOM wiring (file inputs, download
   links) lives in app.ts.

   v1 scope: merge, split, images→PDF, rotate, watermark.
   Compress and PDF→images need a renderer (pdf.js) and are
   deliberately deferred to v2.
   ═══════════════════════════════════════════════════════ */

import { PDFDocument, degrees, rgb, StandardFonts } from "pdf-lib";

/**
 * Parse a page-range expression ("1-3, 7, 10-15") against a page count.
 * Returns 0-based page indices in the order written, deduped. Throws with
 * a user-readable message on anything invalid or out of bounds.
 */
export function parsePageRanges(expr: string, pageCount: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const parts = expr.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("Enter pages like: 1-3, 7, 10-15");
  for (const part of parts) {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error(`Can't read "${part}" — use numbers and ranges like 2-5`);
    const a = parseInt(m[1], 10);
    const b = m[2] !== undefined ? parseInt(m[2], 10) : a;
    if (a < 1 || b < 1 || a > pageCount || b > pageCount)
      throw new Error(`"${part}" is outside 1–${pageCount}`);
    if (b < a) throw new Error(`"${part}" runs backwards`);
    for (let p = a; p <= b; p++) {
      if (!seen.has(p - 1)) {
        seen.add(p - 1);
        out.push(p - 1);
      }
    }
  }
  return out;
}

/** Merge PDFs in the given order into one document. */
export async function mergePdfs(inputs: Uint8Array[]): Promise<Uint8Array> {
  if (inputs.length < 2) throw new Error("Add at least two PDFs to merge");
  const out = await PDFDocument.create();
  for (const bytes of inputs) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return out.save();
}

/** Extract the given 0-based pages into a new PDF (order preserved). */
export async function extractPages(input: Uint8Array, pageIdxs: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(input, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, pageIdxs);
  for (const p of pages) out.addPage(p);
  return out.save();
}

/** Split into one single-page PDF per selected page. */
export async function splitToSinglePages(
  input: Uint8Array,
  pageIdxs: number[],
): Promise<Array<{ page: number; bytes: Uint8Array }>> {
  const results: Array<{ page: number; bytes: Uint8Array }> = [];
  for (const idx of pageIdxs) {
    results.push({ page: idx + 1, bytes: await extractPages(input, [idx]) });
  }
  return results;
}

export type PageSizeId = "a4" | "letter" | "fit";

const PAGE_SIZES: Record<Exclude<PageSizeId, "fit">, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

export interface ImageInput {
  bytes: Uint8Array;
  /** "image/jpeg" | "image/png" */
  type: string;
}

/**
 * Build a PDF from images, one per page. "fit" sizes each page to its
 * image; fixed sizes center the image inside margins, scaled to fit.
 */
export async function imagesToPdf(
  images: ImageInput[],
  pageSize: PageSizeId = "fit",
  marginPt = 36,
): Promise<Uint8Array> {
  if (images.length === 0) throw new Error("Add at least one image");
  const out = await PDFDocument.create();
  for (const img of images) {
    const embedded = img.type === "image/png" ? await out.embedPng(img.bytes) : await out.embedJpg(img.bytes);
    if (pageSize === "fit") {
      const page = out.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    } else {
      const [pw, ph] = PAGE_SIZES[pageSize];
      const page = out.addPage([pw, ph]);
      const maxW = pw - marginPt * 2;
      const maxH = ph - marginPt * 2;
      const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
      const w = embedded.width * scale;
      const h = embedded.height * scale;
      page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
  }
  return out.save();
}

/** Rotate the given 0-based pages by 90/180/270 degrees (added to current). */
export async function rotatePages(
  input: Uint8Array,
  pageIdxs: number[],
  deg: 90 | 180 | 270,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input, { ignoreEncryption: true });
  for (const idx of pageIdxs) {
    const page = doc.getPage(idx);
    page.setRotation(degrees(((page.getRotation().angle + deg) % 360 + 360) % 360));
  }
  return doc.save();
}

export type WatermarkPosition = "diagonal" | "header" | "footer";

export interface WatermarkOptions {
  text: string;
  opacity?: number;
  position?: WatermarkPosition;
  size?: number;
}

/** Draw a text watermark on every page. */
export async function watermarkPdf(input: Uint8Array, opts: WatermarkOptions): Promise<Uint8Array> {
  const text = opts.text.trim();
  if (!text) throw new Error("Enter watermark text");
  const opacity = Math.min(Math.max(opts.opacity ?? 0.25, 0.05), 1);
  const position = opts.position ?? "diagonal";
  const doc = await PDFDocument.load(input, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const size = opts.size ?? Math.max(24, Math.min(width, height) / 8);
    const textWidth = font.widthOfTextAtSize(text, size);
    if (position === "diagonal") {
      page.drawText(text, {
        x: width / 2 - (textWidth / 2) * Math.cos(Math.PI / 4),
        y: height / 2 - (textWidth / 2) * Math.sin(Math.PI / 4),
        size,
        font,
        color: rgb(0.55, 0.55, 0.55),
        opacity,
        rotate: degrees(45),
      });
    } else {
      const y = position === "header" ? height - size - 18 : 18;
      page.drawText(text, {
        x: (width - textWidth) / 2,
        y,
        size,
        font,
        color: rgb(0.55, 0.55, 0.55),
        opacity,
      });
    }
  }
  return doc.save();
}

/** Page count of a PDF (cheap load, used to drive range inputs). */
export async function pageCount(input: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(input, { ignoreEncryption: true });
  return doc.getPageCount();
}
