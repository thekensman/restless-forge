/* localStorage persistence for ForgeInvoice. Everything stays on the
   user's device; export/import gives them a portable JSON backup. */

export interface BusinessInfo {
  name: string;
  address: string;
  email: string;
  phone: string;
  /** data URL, resized client-side before saving */
  logo: string;
}

export interface ClientInfo {
  id: string;
  name: string;
  address: string;
  email: string;
}

export interface HistoryEntry {
  number: string;
  client: string;
  date: string;
  total: number;
  currency: string;
}

const KEY = "forgeinvoice:v1";

export interface Store {
  business: BusinessInfo;
  clients: ClientInfo[];
  history: HistoryEntry[];
  lastNumber: string;
}

export const EMPTY_STORE: Store = {
  business: { name: "", address: "", email: "", phone: "", logo: "" },
  clients: [],
  history: [],
  lastNumber: "INV-000",
};

export function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY_STORE);
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      business: { ...EMPTY_STORE.business, ...(parsed.business ?? {}) },
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      lastNumber: typeof parsed.lastNumber === "string" ? parsed.lastNumber : EMPTY_STORE.lastNumber,
    };
  } catch {
    return structuredClone(EMPTY_STORE);
  }
}

export function save(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function upsertClient(store: Store, client: ClientInfo): Store {
  const idx = store.clients.findIndex((c) => c.id === client.id);
  const clients = [...store.clients];
  if (idx === -1) clients.push(client);
  else clients[idx] = client;
  return { ...store, clients };
}

export function removeClient(store: Store, id: string): Store {
  return { ...store, clients: store.clients.filter((c) => c.id !== id) };
}

export function addHistory(store: Store, entry: HistoryEntry): Store {
  return { ...store, history: [entry, ...store.history].slice(0, 200), lastNumber: entry.number };
}

export function exportJson(store: Store): string {
  return JSON.stringify({ app: "forgeinvoice", version: 1, ...store }, null, 2);
}

export function importJson(raw: string): Store {
  const parsed = JSON.parse(raw) as Partial<Store> & { app?: string };
  if (parsed.app !== "forgeinvoice") throw new Error("Not a ForgeInvoice backup file");
  return {
    business: { ...EMPTY_STORE.business, ...(parsed.business ?? {}) },
    clients: Array.isArray(parsed.clients) ? parsed.clients : [],
    history: Array.isArray(parsed.history) ? parsed.history : [],
    lastNumber: typeof parsed.lastNumber === "string" ? parsed.lastNumber : EMPTY_STORE.lastNumber,
  };
}
