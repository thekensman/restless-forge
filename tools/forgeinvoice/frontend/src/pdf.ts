/* ForgeInvoice — pdf-lib renderer ("Clean" template, v1).
   A simple y-cursor layout with table page breaks; more templates
   arrive as configs on top of this renderer. */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { InvoiceInput, Totals, computeTotals, fmtMoney, lineAmount } from "./engine";

export interface InvoiceMeta {
  businessName: string;
  businessAddress: string;
  businessEmail: string;
  businessPhone: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  number: string;
  date: string;
  dueDate: string;
  currency: string;
  notes: string;
  /** data URL (image/png or image/jpeg) or "" */
  logo: string;
}

const PAGE: [number, number] = [612, 792]; // Letter
const MARGIN = 54;
const ACCENT = rgb(0.83, 0.64, 0.31);
const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.45, 0.45, 0.48);

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

function ensureRoom(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN) newPage(ctx);
}

function text(ctx: Ctx, s: string, x: number, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; right?: number } = {}): void {
  const font = opts.bold ? ctx.bold : ctx.font;
  const xx = opts.right !== undefined ? opts.right - font.widthOfTextAtSize(s, size) : x;
  ctx.page.drawText(s, { x: xx, y: ctx.y, size, font, color: opts.color ?? INK });
}

function wrapText(font: PDFFont, s: string, size: number, maxW: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxW) cur = candidate;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export async function renderInvoicePdf(meta: InvoiceMeta, inv: InvoiceInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, page: doc.addPage(PAGE), y: PAGE[1] - MARGIN, font, bold };
  const right = PAGE[0] - MARGIN;
  const totals: Totals = computeTotals(inv);

  // Header: logo / business block left, INVOICE + number right
  if (meta.logo.startsWith("data:image/")) {
    try {
      const b64 = meta.logo.split(",")[1] ?? "";
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const img = meta.logo.startsWith("data:image/png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const h = 40;
      const w = (img.width / img.height) * h;
      ctx.page.drawImage(img, { x: MARGIN, y: ctx.y - h + 10, width: Math.min(w, 160), height: h });
      ctx.y -= h + 6;
    } catch {
      /* unreadable logo: skip silently */
    }
  }
  text(ctx, meta.businessName || "Your Business", MARGIN, 14, { bold: true });
  text(ctx, "INVOICE", 0, 22, { bold: true, color: ACCENT, right });
  ctx.y -= 16;
  text(ctx, meta.number, 0, 11, { color: MUTED, right });
  for (const line of [meta.businessAddress, meta.businessEmail, meta.businessPhone].filter(Boolean)) {
    text(ctx, line, MARGIN, 9.5, { color: MUTED });
    ctx.y -= 12;
  }

  ctx.y -= 18;
  // Bill-to + dates
  const blockTop = ctx.y;
  text(ctx, "BILL TO", MARGIN, 9, { bold: true, color: ACCENT });
  ctx.y -= 13;
  for (const line of [meta.clientName, meta.clientAddress, meta.clientEmail].filter(Boolean)) {
    text(ctx, line, MARGIN, 10.5);
    ctx.y -= 13;
  }
  const afterClient = ctx.y;
  ctx.y = blockTop;
  if (meta.date) {
    text(ctx, `Date: ${meta.date}`, 0, 10, { right });
    ctx.y -= 13;
  }
  if (meta.dueDate) {
    text(ctx, `Due: ${meta.dueDate}`, 0, 10, { right });
    ctx.y -= 13;
  }
  ctx.y = Math.min(afterClient, ctx.y) - 20;

  // Items table
  const cols = { desc: MARGIN, qty: right - 190, price: right - 110, amount: right };
  const header = (): void => {
    ensureRoom(ctx, 24);
    text(ctx, "DESCRIPTION", cols.desc, 9, { bold: true, color: MUTED });
    text(ctx, "QTY", 0, 9, { bold: true, color: MUTED, right: cols.qty });
    text(ctx, "PRICE", 0, 9, { bold: true, color: MUTED, right: cols.price });
    text(ctx, "AMOUNT", 0, 9, { bold: true, color: MUTED, right: cols.amount });
    ctx.y -= 6;
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: right, y: ctx.y }, thickness: 0.8, color: ACCENT });
    ctx.y -= 14;
  };
  header();
  for (const item of inv.items) {
    const lines = wrapText(font, item.description || "—", 10.5, cols.qty - MARGIN - 100);
    const rowH = lines.length * 13 + 5;
    if (ctx.y - rowH < MARGIN) {
      newPage(ctx);
      header();
    }
    const rowTop = ctx.y;
    for (const l of lines) {
      text(ctx, l, cols.desc, 10.5);
      ctx.y -= 13;
    }
    const rowY = ctx.y;
    ctx.y = rowTop;
    text(ctx, String(item.quantity), 0, 10.5, { right: cols.qty });
    text(ctx, fmtMoney(item.unitPrice, meta.currency), 0, 10.5, { right: cols.price });
    text(ctx, fmtMoney(lineAmount(item), meta.currency), 0, 10.5, { right: cols.amount });
    ctx.y = rowY - 5;
  }

  // Totals block
  ensureRoom(ctx, 110);
  ctx.y -= 8;
  ctx.page.drawLine({ start: { x: cols.qty - 40, y: ctx.y }, end: { x: right, y: ctx.y }, thickness: 0.5, color: MUTED });
  ctx.y -= 16;
  const trow = (label: string, val: string, boldRow = false): void => {
    text(ctx, label, 0, boldRow ? 12 : 10.5, { bold: boldRow, right: cols.price });
    text(ctx, val, 0, boldRow ? 12 : 10.5, { bold: boldRow, right: cols.amount });
    ctx.y -= boldRow ? 18 : 15;
  };
  trow("Subtotal", fmtMoney(totals.subtotal, meta.currency));
  if (totals.discount > 0) trow("Discount", `−${fmtMoney(totals.discount, meta.currency)}`);
  if (totals.tax > 0) trow(`Tax (${inv.taxRate}%)`, fmtMoney(totals.tax, meta.currency));
  trow("Total", fmtMoney(totals.total, meta.currency), true);

  if (meta.notes.trim()) {
    ensureRoom(ctx, 60);
    ctx.y -= 10;
    text(ctx, "NOTES", MARGIN, 9, { bold: true, color: ACCENT });
    ctx.y -= 13;
    for (const l of wrapText(font, meta.notes.trim(), 9.5, right - MARGIN)) {
      ensureRoom(ctx, 12);
      text(ctx, l, MARGIN, 9.5, { color: MUTED });
      ctx.y -= 12;
    }
  }

  return doc.save();
}
