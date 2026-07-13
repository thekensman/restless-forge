/* ═══════════════════════════════════════════════════════
   ForgeInvoice — invoice math + formatting. Pure functions;
   localStorage persistence lives in storage.ts, PDF layout
   in pdf.ts, DOM wiring in app.ts.
   ═══════════════════════════════════════════════════════ */

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export type DiscountType = "percent" | "fixed";

export interface InvoiceInput {
  items: LineItem[];
  discountType: DiscountType;
  discountValue: number;
  /** percentage, e.g. 8.25 */
  taxRate: number;
}

export interface Totals {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineAmount(item: LineItem): number {
  const qty = Math.max(0, item.quantity || 0);
  const price = item.unitPrice || 0;
  return round2(qty * price);
}

export function computeTotals(inv: InvoiceInput): Totals {
  const subtotal = round2(inv.items.reduce((s, it) => s + lineAmount(it), 0));
  const rawDiscount =
    inv.discountType === "percent"
      ? subtotal * (Math.max(0, inv.discountValue) / 100)
      : Math.max(0, inv.discountValue);
  const discount = round2(Math.min(rawDiscount, subtotal));
  const taxable = round2(subtotal - discount);
  const tax = round2(taxable * (Math.max(0, inv.taxRate) / 100));
  return { subtotal, discount, taxable, tax, total: round2(taxable + tax) };
}

export const CURRENCIES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "SEK", label: "Swedish Krona" },
  { code: "NZD", label: "NZ Dollar" },
  { code: "MXN", label: "Mexican Peso" },
  { code: "INR", label: "Indian Rupee" },
  { code: "BRL", label: "Brazilian Real" },
];

export function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Next invoice number: increments the trailing integer and preserves any
 * prefix and zero-padding ("INV-007" → "INV-008", "2026-12" → "2026-13").
 * No trailing number → append "-1".
 */
export function nextInvoiceNumber(prev: string): string {
  const m = prev.match(/^(.*?)(\d+)\s*$/);
  if (!m) return prev ? `${prev}-1` : "INV-001";
  const digits = m[2];
  const next = String(parseInt(digits, 10) + 1).padStart(digits.length, "0");
  return `${m[1]}${next}`;
}

export const PAYMENT_TERMS: ReadonlyArray<{ id: string; label: string; days: number | null }> = [
  { id: "receipt", label: "Due on receipt", days: 0 },
  { id: "net15", label: "Net 15", days: 15 },
  { id: "net30", label: "Net 30", days: 30 },
  { id: "net60", label: "Net 60", days: 60 },
  { id: "net90", label: "Net 90", days: 90 },
];

/** Due date from an ISO invoice date + terms id ("" when unknown terms). */
export function dueDate(invoiceDateIso: string, termsId: string): string {
  const terms = PAYMENT_TERMS.find((t) => t.id === termsId);
  if (!terms || terms.days === null) return "";
  const d = new Date(invoiceDateIso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + terms.days);
  return d.toISOString().slice(0, 10);
}

/** Safe filename: INV-{number}-{client}.pdf */
export function invoiceFilename(num: string, client: string): string {
  const safe = (s: string) => s.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${safe(num) || "invoice"}${client ? "-" + safe(client) : ""}.pdf`;
}
