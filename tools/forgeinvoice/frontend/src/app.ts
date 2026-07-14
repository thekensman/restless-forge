/* ForgeInvoice — form controller, live preview, PDF download. */

import {
  LineItem,
  InvoiceInput,
  DiscountType,
  computeTotals,
  fmtMoney,
  nextInvoiceNumber,
  dueDate,
  invoiceFilename,
  CURRENCIES,
  PAYMENT_TERMS,
} from "./engine";
import { renderInvoicePdf, InvoiceMeta } from "./pdf";
import * as store from "./storage";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};
const val = (id: string): string => $<HTMLInputElement>(id).value;

let db = store.load();

const status = (msg: string, isError = false): void => {
  const el = $("op-status");
  el.textContent = msg;
  el.classList.toggle("is-error", isError);
};

/* ── line items ── */
function addItemRow(item?: Partial<LineItem>): void {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML =
    `<input type="text" class="it-desc" placeholder="Description" value="${item?.description ?? ""}">` +
    `<input type="number" class="it-qty" min="0" step="any" placeholder="Qty" value="${item?.quantity ?? 1}">` +
    `<input type="number" class="it-price" min="0" step="0.01" placeholder="Price" value="${item?.unitPrice ?? ""}">` +
    `<button type="button" class="it-del" aria-label="Remove item">×</button>`;
  row.querySelector(".it-del")!.addEventListener("click", () => {
    row.remove();
    render();
  });
  row.querySelectorAll("input").forEach((i) => i.addEventListener("input", render));
  $("items").appendChild(row);
}

function readItems(): LineItem[] {
  return [...document.querySelectorAll<HTMLElement>(".item-row")].map((row) => ({
    description: row.querySelector<HTMLInputElement>(".it-desc")!.value,
    quantity: Number(row.querySelector<HTMLInputElement>(".it-qty")!.value) || 0,
    unitPrice: Number(row.querySelector<HTMLInputElement>(".it-price")!.value) || 0,
  }));
}

function readInvoice(): { meta: InvoiceMeta; inv: InvoiceInput } {
  const inv: InvoiceInput = {
    items: readItems(),
    discountType: $<HTMLSelectElement>("inv-discount-type").value as DiscountType,
    discountValue: Number(val("inv-discount")) || 0,
    taxRate: Number(val("inv-tax")) || 0,
  };
  const meta: InvoiceMeta = {
    businessName: val("biz-name"),
    businessAddress: val("biz-address"),
    businessEmail: val("biz-email"),
    businessPhone: val("biz-phone"),
    clientName: val("cl-name"),
    clientAddress: val("cl-address"),
    clientEmail: val("cl-email"),
    number: val("inv-number"),
    date: val("inv-date"),
    dueDate: dueDate(val("inv-date"), $<HTMLSelectElement>("inv-terms").value),
    currency: $<HTMLSelectElement>("inv-currency").value,
    notes: val("inv-notes"),
    logo: db.business.logo,
  };
  return { meta, inv };
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(): void {
  const { meta, inv } = readInvoice();
  const t = computeTotals(inv);
  const cur = meta.currency;
  const rows = inv.items
    .map(
      (it) =>
        `<tr><td>${esc(it.description) || "—"}</td><td>${it.quantity}</td>` +
        `<td>${fmtMoney(it.unitPrice, cur)}</td><td>${fmtMoney(it.quantity * it.unitPrice, cur)}</td></tr>`,
    )
    .join("");
  $("preview").innerHTML =
    `<div class="pv-head"><div><strong>${esc(meta.businessName) || "Your Business"}</strong><br>` +
    `<span class="pv-muted">${esc(meta.businessAddress)}</span></div>` +
    `<div class="pv-title">INVOICE<br><span class="pv-muted">${esc(meta.number)}</span></div></div>` +
    `<div class="pv-meta"><div><span class="pv-label">BILL TO</span><br>${esc(meta.clientName)}<br>` +
    `<span class="pv-muted">${esc(meta.clientAddress)}</span></div>` +
    `<div class="pv-dates">${meta.date ? `Date: ${meta.date}<br>` : ""}${meta.dueDate ? `Due: ${meta.dueDate}` : ""}</div></div>` +
    `<table class="pv-table"><thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>` +
    `<div class="pv-totals">Subtotal ${fmtMoney(t.subtotal, cur)}` +
    (t.discount ? `<br>Discount −${fmtMoney(t.discount, cur)}` : "") +
    (t.tax ? `<br>Tax ${fmtMoney(t.tax, cur)}` : "") +
    `<br><strong>Total ${fmtMoney(t.total, cur)}</strong></div>` +
    (meta.notes ? `<p class="pv-notes">${esc(meta.notes)}</p>` : "");
}

function persistBusiness(): void {
  db = {
    ...db,
    business: {
      ...db.business,
      name: val("biz-name"),
      address: val("biz-address"),
      email: val("biz-email"),
      phone: val("biz-phone"),
    },
  };
  store.save(db);
}

function refreshClientSelect(): void {
  const sel = $<HTMLSelectElement>("client-select");
  sel.innerHTML =
    `<option value="">— new client —</option>` +
    db.clients.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
}

function init(): void {
  $<HTMLSelectElement>("inv-terms").innerHTML = PAYMENT_TERMS.map(
    (t) => `<option value="${t.id}">${t.label}</option>`,
  ).join("");
  $<HTMLSelectElement>("inv-currency").innerHTML = CURRENCIES.map(
    (c) => `<option value="${c.code}">${c.code} — ${c.label}</option>`,
  ).join("");

  // hydrate from storage
  $<HTMLInputElement>("biz-name").value = db.business.name;
  $<HTMLInputElement>("biz-address").value = db.business.address;
  $<HTMLInputElement>("biz-email").value = db.business.email;
  $<HTMLInputElement>("biz-phone").value = db.business.phone;
  $<HTMLInputElement>("inv-number").value = nextInvoiceNumber(db.lastNumber);
  $<HTMLInputElement>("inv-date").value = new Date().toISOString().slice(0, 10);
  refreshClientSelect();
  addItemRow();

  ["biz-name", "biz-address", "biz-email", "biz-phone"].forEach((id) =>
    $(id).addEventListener("change", persistBusiness),
  );
  [
    "cl-name", "cl-address", "cl-email", "inv-number", "inv-date", "inv-terms",
    "inv-currency", "inv-discount", "inv-discount-type", "inv-tax", "inv-notes",
  ].forEach((id) => $(id).addEventListener("input", render));

  $("item-add").addEventListener("click", () => addItemRow());

  $("client-select").addEventListener("change", () => {
    const c = db.clients.find((x) => x.id === $<HTMLSelectElement>("client-select").value);
    if (!c) return;
    $<HTMLInputElement>("cl-name").value = c.name;
    $<HTMLInputElement>("cl-address").value = c.address;
    $<HTMLInputElement>("cl-email").value = c.email;
    render();
  });

  $("client-save").addEventListener("click", () => {
    const name = val("cl-name").trim();
    if (!name) return status("Enter a client name first", true);
    const existing = db.clients.find((c) => c.name === name);
    db = store.upsertClient(db, {
      id: existing?.id ?? `c${Date.now()}`,
      name,
      address: val("cl-address"),
      email: val("cl-email"),
    });
    store.save(db);
    refreshClientSelect();
    status(`Saved client "${name}" (stays in this browser).`);
  });

  $("inv-download").addEventListener("click", async () => {
    try {
      status("Rendering PDF…");
      const { meta, inv } = readInvoice();
      const bytes = await renderInvoicePdf(meta, inv);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = invoiceFilename(meta.number, meta.clientName);
      a.click();
      db = store.addHistory(db, {
        number: meta.number,
        client: meta.clientName,
        date: meta.date,
        total: computeTotals(inv).total,
        currency: meta.currency,
      });
      store.save(db);
      status(`Downloaded ${a.download}. Next number: ${nextInvoiceNumber(meta.number)}.`);
    } catch (e) {
      status(e instanceof Error ? e.message : String(e), true);
    }
  });

  $("data-export").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([store.exportJson(db)], { type: "application/json" }));
    a.download = "forgeinvoice-backup.json";
    a.click();
  });

  $("data-import").addEventListener("change", async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      db = store.importJson(await f.text());
      store.save(db);
      refreshClientSelect();
      status("Backup imported.");
    } catch (err) {
      status(err instanceof Error ? err.message : String(err), true);
    }
  });

  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
