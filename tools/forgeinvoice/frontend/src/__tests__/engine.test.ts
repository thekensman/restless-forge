import { describe, it, expect, beforeEach } from "vitest";
import {
  computeTotals,
  lineAmount,
  fmtMoney,
  nextInvoiceNumber,
  dueDate,
  invoiceFilename,
  CURRENCIES,
  PAYMENT_TERMS,
} from "../engine";
import {
  load,
  save,
  upsertClient,
  removeClient,
  addHistory,
  exportJson,
  importJson,
  EMPTY_STORE,
} from "../storage";

const items = [
  { description: "Design work", quantity: 10, unitPrice: 85 },
  { description: "Hosting", quantity: 1, unitPrice: 25.5 },
];

describe("invoice math", () => {
  it("line amounts and subtotal", () => {
    expect(lineAmount(items[0])).toBe(850);
    const t = computeTotals({ items, discountType: "percent", discountValue: 0, taxRate: 0 });
    expect(t.subtotal).toBe(875.5);
    expect(t.total).toBe(875.5);
  });

  it("percent discount then tax on the discounted base", () => {
    const t = computeTotals({ items, discountType: "percent", discountValue: 10, taxRate: 8 });
    expect(t.discount).toBe(87.55);
    expect(t.taxable).toBe(787.95);
    expect(t.tax).toBe(63.04);
    expect(t.total).toBe(850.99);
  });

  it("fixed discount", () => {
    const t = computeTotals({ items, discountType: "fixed", discountValue: 100, taxRate: 0 });
    expect(t.discount).toBe(100);
    expect(t.total).toBe(775.5);
  });

  it("discount can never exceed subtotal", () => {
    const t = computeTotals({ items, discountType: "fixed", discountValue: 99999, taxRate: 10 });
    expect(t.discount).toBe(875.5);
    expect(t.taxable).toBe(0);
    expect(t.total).toBe(0);
  });

  it("zero items", () => {
    const t = computeTotals({ items: [], discountType: "percent", discountValue: 10, taxRate: 8 });
    expect(t.total).toBe(0);
  });

  it("negative inputs are treated as zero", () => {
    const t = computeTotals({
      items: [{ description: "x", quantity: -5, unitPrice: 100 }],
      discountType: "fixed",
      discountValue: -50,
      taxRate: -8,
    });
    expect(t.subtotal).toBe(0);
    expect(t.discount).toBe(0);
    expect(t.tax).toBe(0);
  });

  it("100% tax doubles the taxable base", () => {
    const t = computeTotals({ items, discountType: "percent", discountValue: 0, taxRate: 100 });
    expect(t.total).toBe(1751);
  });
});

describe("formatting + numbering", () => {
  it("formats every supported currency without throwing", () => {
    for (const c of CURRENCIES) expect(fmtMoney(1234.56, c.code)).toBeTruthy();
  });
  it("USD renders with symbol", () => {
    expect(fmtMoney(1234.5, "USD")).toBe("$1,234.50");
  });
  it("nextInvoiceNumber preserves prefix and padding", () => {
    expect(nextInvoiceNumber("INV-007")).toBe("INV-008");
    expect(nextInvoiceNumber("INV-099")).toBe("INV-100");
    expect(nextInvoiceNumber("2026-12")).toBe("2026-13");
    expect(nextInvoiceNumber("")).toBe("INV-001");
    expect(nextInvoiceNumber("draft")).toBe("draft-1");
  });
  it("dueDate applies payment terms", () => {
    expect(dueDate("2026-07-01", "net30")).toBe("2026-07-31");
    expect(dueDate("2026-07-01", "receipt")).toBe("2026-07-01");
    expect(dueDate("garbage", "net30")).toBe("");
    expect(PAYMENT_TERMS.length).toBeGreaterThanOrEqual(5);
  });
  it("invoiceFilename sanitizes", () => {
    expect(invoiceFilename("INV-008", "ACME Corp!")).toBe("INV-008-ACME-Corp.pdf");
  });
});

describe("storage", () => {
  beforeEach(() => localStorage.clear());

  it("load returns empty store on fresh browser", () => {
    expect(load()).toEqual(EMPTY_STORE);
  });

  it("save/load round-trip", () => {
    let s = load();
    s = { ...s, business: { ...s.business, name: "Restless Forge LLC" } };
    s = upsertClient(s, { id: "c1", name: "ACME", address: "", email: "a@x.com" });
    s = addHistory(s, { number: "INV-001", client: "ACME", date: "2026-07-13", total: 850.99, currency: "USD" });
    save(s);
    const back = load();
    expect(back.business.name).toBe("Restless Forge LLC");
    expect(back.clients).toHaveLength(1);
    expect(back.history[0].total).toBe(850.99);
    expect(back.lastNumber).toBe("INV-001");
  });

  it("upsert replaces by id; remove deletes", () => {
    let s = load();
    s = upsertClient(s, { id: "c1", name: "ACME", address: "", email: "" });
    s = upsertClient(s, { id: "c1", name: "ACME Renamed", address: "", email: "" });
    expect(s.clients).toHaveLength(1);
    expect(s.clients[0].name).toBe("ACME Renamed");
    s = removeClient(s, "c1");
    expect(s.clients).toHaveLength(0);
  });

  it("export/import round-trip; rejects foreign JSON", () => {
    let s = load();
    s = upsertClient(s, { id: "c1", name: "ACME", address: "", email: "" });
    const back = importJson(exportJson(s));
    expect(back.clients[0].name).toBe("ACME");
    expect(() => importJson('{"app":"other"}')).toThrow();
  });

  it("corrupt localStorage falls back to empty store", () => {
    localStorage.setItem("forgeinvoice:v1", "{not json");
    expect(load()).toEqual(EMPTY_STORE);
  });
});
