/**
 * WaveCarve — Main Application
 * Reactive UI controller. All processing in browser.
 */
import * as engine from "./engine";

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);

function setupFileUpload(): void {
  const dz = $("#drop-zone");
  const fi = $("input#file-input") as HTMLInputElement | null;
  if (!dz || !fi) return;
  dz.addEventListener("click", () => fi.click());
  dz.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ") { e.preventDefault(); fi.click(); }
  });
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("upload__circle--active"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("upload__circle--active"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault(); dz.classList.remove("upload__circle--active");
    const dt = (e as DragEvent).dataTransfer;
    if (dt?.files.length) handleFile(dt.files[0]);
  });
  fi.addEventListener("change", () => { if (fi.files?.length) handleFile(fi.files[0]); });
}

function handleFile(file: File): void {
  const fn = $("#file-name");
  if (fn) fn.textContent = file.name;
  const out = $("#output-area");
  if (out) out.textContent = `Loaded ${file.name} (${(file.size / 1024).toFixed(1)} KB) — processing in browser...`;
}

function setupReactiveInputs(): void {
  document.querySelectorAll<HTMLElement>("select, input[type=number], input[type=range]").forEach((el) => {
    el.addEventListener("input", handleChange);
    el.addEventListener("change", handleChange);
  });
}

function handleChange(): void {
  const out = $("#output-area");
  if (out) out.textContent = "WaveCarve ready — all processing runs in your browser.";
}

document.addEventListener("DOMContentLoaded", () => {
  setupFileUpload();
  setupReactiveInputs();
  handleChange();
  console.log("WaveCarve: loaded — browser-only, no backend");
});

// Expose engine for console debugging
(window as unknown as Record<string, unknown>)["wavecarveEngine"] = engine;
