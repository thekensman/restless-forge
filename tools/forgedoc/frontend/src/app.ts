/* ForgeDoc — DOM wiring around engine.ts. */

import {
  mergePdfs,
  extractPages,
  splitToSinglePages,
  imagesToPdf,
  rotatePages,
  watermarkPdf,
  parsePageRanges,
  pageCount,
  PageSizeId,
  WatermarkPosition,
} from "./engine";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const status = (msg: string, isError = false): void => {
  const el = $("op-status");
  el.textContent = msg;
  el.classList.toggle("is-error", isError);
};

const clearDownloads = (): void => {
  $("op-downloads").innerHTML = "";
};

function offerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.className = "op-download";
  a.textContent = `⬇ ${filename} (${(blob.size / 1024).toFixed(0)} KB)`;
  $("op-downloads").appendChild(a);
}

const readFile = (f: File): Promise<Uint8Array> =>
  f.arrayBuffer().then((b) => new Uint8Array(b));

function listFiles(input: HTMLInputElement, listId: string): void {
  const ul = $(listId);
  ul.innerHTML = "";
  for (const f of input.files ?? []) {
    const li = document.createElement("li");
    li.textContent = `${f.name} (${(f.size / 1024).toFixed(0)} KB)`;
    ul.appendChild(li);
  }
}

async function run(label: string, fn: () => Promise<void>): Promise<void> {
  clearDownloads();
  status(`${label}…`);
  try {
    await fn();
    status("Done — your file is ready below.");
  } catch (e) {
    status(e instanceof Error ? e.message : String(e), true);
  }
}

function initTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".op-tab");
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.toggle("is-active", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      document.querySelectorAll<HTMLElement>(".op-panel").forEach((p) => {
        p.hidden = p.id !== `panel-${tab.dataset.op}`;
      });
      status("");
      clearDownloads();
    }),
  );
}

function init(): void {
  initTabs();
  const mergeInput = $<HTMLInputElement>("merge-files");
  mergeInput.addEventListener("change", () => listFiles(mergeInput, "merge-list"));
  $("merge-run").addEventListener("click", () =>
    run("Merging", async () => {
      const files = [...(mergeInput.files ?? [])];
      const inputs = await Promise.all(files.map(readFile));
      offerDownload(await mergePdfs(inputs), "merged.pdf");
    }),
  );

  const splitInput = $<HTMLInputElement>("split-file");
  splitInput.addEventListener("change", async () => {
    const f = splitInput.files?.[0];
    if (!f) return;
    try {
      const n = await pageCount(await readFile(f));
      $("split-meta").textContent = `${f.name}: ${n} pages`;
    } catch {
      $("split-meta").textContent = "Could not read that PDF.";
    }
  });
  $("split-run").addEventListener("click", () =>
    run("Extracting", async () => {
      const f = splitInput.files?.[0];
      if (!f) throw new Error("Pick a PDF first");
      const bytes = await readFile(f);
      const n = await pageCount(bytes);
      const idxs = parsePageRanges($<HTMLInputElement>("split-ranges").value, n);
      if ($<HTMLInputElement>("split-single").checked) {
        for (const part of await splitToSinglePages(bytes, idxs)) {
          offerDownload(part.bytes, `page-${part.page}.pdf`);
        }
      } else {
        offerDownload(await extractPages(bytes, idxs), "extracted.pdf");
      }
    }),
  );

  const imagesInput = $<HTMLInputElement>("images-files");
  imagesInput.addEventListener("change", () => listFiles(imagesInput, "images-list"));
  $("images-run").addEventListener("click", () =>
    run("Building PDF", async () => {
      const files = [...(imagesInput.files ?? [])];
      if (!files.length) throw new Error("Pick at least one image");
      const images = await Promise.all(
        files.map(async (f) => ({ bytes: await readFile(f), type: f.type })),
      );
      const size = $<HTMLSelectElement>("images-size").value as PageSizeId;
      offerDownload(await imagesToPdf(images, size), "images.pdf");
    }),
  );

  const rotateInput = $<HTMLInputElement>("rotate-file");
  rotateInput.addEventListener("change", async () => {
    const f = rotateInput.files?.[0];
    if (!f) return;
    try {
      const n = await pageCount(await readFile(f));
      $("rotate-meta").textContent = `${f.name}: ${n} pages`;
    } catch {
      $("rotate-meta").textContent = "Could not read that PDF.";
    }
  });
  $("rotate-run").addEventListener("click", () =>
    run("Rotating", async () => {
      const f = rotateInput.files?.[0];
      if (!f) throw new Error("Pick a PDF first");
      const bytes = await readFile(f);
      const n = await pageCount(bytes);
      const expr = $<HTMLInputElement>("rotate-ranges").value.trim();
      const idxs = expr && expr !== "all" ? parsePageRanges(expr, n) : [...Array(n).keys()];
      const deg = Number($<HTMLSelectElement>("rotate-deg").value) as 90 | 180 | 270;
      offerDownload(await rotatePages(bytes, idxs, deg), "rotated.pdf");
    }),
  );

  $("wm-run").addEventListener("click", () =>
    run("Watermarking", async () => {
      const f = $<HTMLInputElement>("wm-file").files?.[0];
      if (!f) throw new Error("Pick a PDF first");
      offerDownload(
        await watermarkPdf(await readFile(f), {
          text: $<HTMLInputElement>("wm-text").value,
          position: $<HTMLSelectElement>("wm-pos").value as WatermarkPosition,
          opacity: Number($<HTMLInputElement>("wm-opacity").value) / 100,
        }),
        "watermarked.pdf",
      );
    }),
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
