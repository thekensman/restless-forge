/* ForgeResume — pdf-lib renderer ("Classic" template, v1).
   Single column, serif headings feel, maximum ATS compatibility:
   real text (no images), simple top-to-bottom flow, page breaks. */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { ResumeData } from "./engine";

const PAGE: [number, number] = [612, 792]; // Letter
const MARGIN = 58;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.44);
const RULE = rgb(0.75, 0.75, 0.78);

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage(PAGE);
  ctx.y = PAGE[1] - MARGIN;
}

function ensure(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN) newPage(ctx);
}

function wrap(font: PDFFont, s: string, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of s.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(cand, size) <= maxW) cur = cand;
      else {
        if (cur) out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

export async function renderResumePdf(r: ResumeData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const ctx: Ctx = { doc, page: doc.addPage(PAGE), y: PAGE[1] - MARGIN, font, bold };
  const right = PAGE[0] - MARGIN;
  const width = right - MARGIN;

  const line = (s: string, size: number, useBold = false, color = INK, gap = 4): void => {
    ensure(ctx, size + gap);
    ctx.page.drawText(s, { x: MARGIN, y: ctx.y, size, font: useBold ? bold : font, color });
    ctx.y -= size + gap;
  };
  const rule = (): void => {
    ensure(ctx, 10);
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + 3 }, end: { x: right, y: ctx.y + 3 }, thickness: 0.7, color: RULE });
    ctx.y -= 8;
  };
  const section = (title: string): void => {
    ctx.y -= 8;
    line(title.toUpperCase(), 11, true);
    rule();
  };
  const body = (s: string, size = 10): void => {
    for (const l of wrap(font, s, size, width)) line(l, size, false, INK, 3);
  };

  // Header
  if (r.name) line(r.name, 22, true, INK, 6);
  if (r.title) line(r.title, 12, false, MUTED, 5);
  const contact = [r.email, r.phone, r.location, r.website].filter(Boolean).join("  ·  ");
  if (contact) line(contact, 9.5, false, MUTED, 4);

  if (r.summary.trim()) {
    section("Summary");
    body(r.summary.trim(), 10.5);
  }

  if (r.experience.length) {
    section("Experience");
    for (const e of r.experience) {
      ensure(ctx, 30);
      const head = [e.role, e.company].filter(Boolean).join(" — ");
      const when = [e.start, e.end || "present"].filter(Boolean).join("–");
      ctx.page.drawText(head, { x: MARGIN, y: ctx.y, size: 11, font: bold, color: INK });
      if (when) {
        const w = font.widthOfTextAtSize(when, 9.5);
        ctx.page.drawText(when, { x: right - w, y: ctx.y, size: 9.5, font, color: MUTED });
      }
      ctx.y -= 15;
      if (e.description.trim()) body(e.description.trim());
      ctx.y -= 4;
    }
  }

  if (r.education.length) {
    section("Education");
    for (const e of r.education) {
      const l = [e.degree, e.school].filter(Boolean).join(", ") + (e.year ? ` (${e.year})` : "");
      line(l, 10.5, false, INK, 4);
    }
  }

  if (r.skills.length) {
    section("Skills");
    body(r.skills.join(" · "), 10.5);
  }

  return doc.save();
}
