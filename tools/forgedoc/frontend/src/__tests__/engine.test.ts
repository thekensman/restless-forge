import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  parsePageRanges,
  mergePdfs,
  extractPages,
  splitToSinglePages,
  imagesToPdf,
  rotatePages,
  watermarkPdf,
  pageCount,
} from "../engine";

/** Build a real n-page PDF for round-trip tests. */
async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`Page ${i + 1}`, { x: 40, y: 350, size: 18 });
  }
  return doc.save();
}

/** Tiny valid 1×1 red JPEG + PNG fixtures (base64). */
const PNG_1PX = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

describe("parsePageRanges", () => {
  it("parses singles, ranges, and mixes (1-based → 0-based)", () => {
    expect(parsePageRanges("1-3, 7, 10-12", 15)).toEqual([0, 1, 2, 6, 9, 10, 11]);
  });
  it("dedupes overlaps, preserves written order", () => {
    expect(parsePageRanges("3, 1-4", 10)).toEqual([2, 0, 1, 3]);
  });
  it("rejects out-of-bounds, backwards, and garbage", () => {
    expect(() => parsePageRanges("0", 5)).toThrow();
    expect(() => parsePageRanges("6", 5)).toThrow(/outside/);
    expect(() => parsePageRanges("4-2", 5)).toThrow(/backwards/);
    expect(() => parsePageRanges("a-b", 5)).toThrow();
    expect(() => parsePageRanges("", 5)).toThrow();
  });
});

describe("mergePdfs", () => {
  it("concatenates page counts in order", async () => {
    const merged = await mergePdfs([await makePdf(3), await makePdf(2)]);
    expect(await pageCount(merged)).toBe(5);
  });
  it("requires at least two inputs", async () => {
    await expect(mergePdfs([await makePdf(1)])).rejects.toThrow();
  });
});

describe("extract / split", () => {
  it("extractPages keeps only the selection", async () => {
    const src = await makePdf(6);
    const out = await extractPages(src, parsePageRanges("2-3, 6", 6));
    expect(await pageCount(out)).toBe(3);
  });
  it("splitToSinglePages yields one PDF per page with labels", async () => {
    const src = await makePdf(4);
    const parts = await splitToSinglePages(src, [0, 2]);
    expect(parts.map((p) => p.page)).toEqual([1, 3]);
    for (const p of parts) expect(await pageCount(p.bytes)).toBe(1);
  });
});

describe("imagesToPdf", () => {
  it("fit mode: one page per image at image size", async () => {
    const out = await imagesToPdf(
      [
        { bytes: PNG_1PX, type: "image/png" },
        { bytes: PNG_1PX, type: "image/png" },
      ],
      "fit",
    );
    expect(await pageCount(out)).toBe(2);
  });
  it("a4 mode: page has A4 dimensions", async () => {
    const out = await imagesToPdf([{ bytes: PNG_1PX, type: "image/png" }], "a4");
    const doc = await PDFDocument.load(out);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });
  it("rejects empty input", async () => {
    await expect(imagesToPdf([], "fit")).rejects.toThrow();
  });
});

describe("rotatePages", () => {
  it("sets rotation on selected pages only, additive", async () => {
    const src = await makePdf(3);
    const once = await rotatePages(src, [1], 90);
    const twice = await rotatePages(once, [1], 90);
    const doc = await PDFDocument.load(twice);
    expect(doc.getPage(0).getRotation().angle).toBe(0);
    expect(doc.getPage(1).getRotation().angle).toBe(180);
    expect(doc.getPage(2).getRotation().angle).toBe(0);
  });
});

describe("watermarkPdf", () => {
  it("stamps every page and grows the file", async () => {
    const src = await makePdf(3);
    const out = await watermarkPdf(src, { text: "CONFIDENTIAL" });
    expect(await pageCount(out)).toBe(3);
    expect(out.byteLength).toBeGreaterThan(src.byteLength);
  });
  it("supports header/footer positions", async () => {
    const src = await makePdf(1);
    for (const position of ["header", "footer", "diagonal"] as const) {
      const out = await watermarkPdf(src, { text: "DRAFT", position });
      expect(await pageCount(out)).toBe(1);
    }
  });
  it("rejects empty text", async () => {
    await expect(watermarkPdf(await makePdf(1), { text: "  " })).rejects.toThrow();
  });
});
