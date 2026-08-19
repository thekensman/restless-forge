/* ForgeResume — form controller, ATS panel, profiles, PDF download. */

import {
  ResumeData,
  EMPTY_RESUME,
  atsScore,
  parseSkills,
  resumeToPlainText,
} from "./engine";
import { renderResumePdf } from "./pdf";
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

/* ── dynamic entry rows ── */
function addExpRow(e?: Partial<ResumeData["experience"][0]>): void {
  const row = document.createElement("div");
  row.className = "entry-row";
  row.innerHTML =
    `<div class="field-row">` +
    `<input type="text" class="ex-role" placeholder="Role" value="${e?.role ?? ""}">` +
    `<input type="text" class="ex-company" placeholder="Company" value="${e?.company ?? ""}">` +
    `<input type="text" class="ex-start" placeholder="2022" value="${e?.start ?? ""}">` +
    `<input type="text" class="ex-end" placeholder="present" value="${e?.end ?? ""}">` +
    `<button type="button" class="it-del" aria-label="Remove">×</button></div>` +
    `<textarea class="ex-desc" rows="2" placeholder="What you did (bullets welcome)">${e?.description ?? ""}</textarea>`;
  row.querySelector(".it-del")!.addEventListener("click", () => row.remove());
  $("exp-list").appendChild(row);
}

function addEduRow(e?: Partial<ResumeData["education"][0]>): void {
  const row = document.createElement("div");
  row.className = "entry-row field-row";
  row.innerHTML =
    `<input type="text" class="ed-degree" placeholder="Degree" value="${e?.degree ?? ""}">` +
    `<input type="text" class="ed-school" placeholder="School" value="${e?.school ?? ""}">` +
    `<input type="text" class="ed-year" placeholder="Year" value="${e?.year ?? ""}">` +
    `<button type="button" class="it-del" aria-label="Remove">×</button>`;
  row.querySelector(".it-del")!.addEventListener("click", () => row.remove());
  $("edu-list").appendChild(row);
}

function readResume(): ResumeData {
  return {
    name: val("r-name"),
    title: val("r-title"),
    email: val("r-email"),
    phone: val("r-phone"),
    location: val("r-location"),
    website: val("r-website"),
    summary: val("r-summary"),
    experience: [...document.querySelectorAll<HTMLElement>("#exp-list .entry-row")].map((row) => ({
      role: row.querySelector<HTMLInputElement>(".ex-role")!.value,
      company: row.querySelector<HTMLInputElement>(".ex-company")!.value,
      start: row.querySelector<HTMLInputElement>(".ex-start")!.value,
      end: row.querySelector<HTMLInputElement>(".ex-end")!.value,
      description: row.querySelector<HTMLTextAreaElement>(".ex-desc")!.value,
    })),
    education: [...document.querySelectorAll<HTMLElement>("#edu-list .entry-row")].map((row) => ({
      degree: row.querySelector<HTMLInputElement>(".ed-degree")!.value,
      school: row.querySelector<HTMLInputElement>(".ed-school")!.value,
      year: row.querySelector<HTMLInputElement>(".ed-year")!.value,
    })),
    skills: parseSkills(val("r-skills")),
  };
}

function fillForm(r: ResumeData): void {
  $<HTMLInputElement>("r-name").value = r.name;
  $<HTMLInputElement>("r-title").value = r.title;
  $<HTMLInputElement>("r-email").value = r.email;
  $<HTMLInputElement>("r-phone").value = r.phone;
  $<HTMLInputElement>("r-location").value = r.location;
  $<HTMLInputElement>("r-website").value = r.website;
  $<HTMLTextAreaElement>("r-summary").value = r.summary;
  $("exp-list").innerHTML = "";
  r.experience.forEach(addExpRow);
  $("edu-list").innerHTML = "";
  r.education.forEach(addEduRow);
  $<HTMLTextAreaElement>("r-skills").value = r.skills.join(", ");
}

function refreshProfileSelect(): void {
  const sel = $<HTMLSelectElement>("profile-select");
  sel.innerHTML = Object.keys(db.profiles)
    .map((n) => `<option value="${n}"${n === db.activeProfile ? " selected" : ""}>${n}</option>`)
    .join("");
}

function init(): void {
  refreshProfileSelect();
  fillForm(db.profiles[db.activeProfile] ?? EMPTY_RESUME);
  if (!document.querySelector("#exp-list .entry-row")) addExpRow();
  if (!document.querySelector("#edu-list .entry-row")) addEduRow();

  $("exp-add").addEventListener("click", () => addExpRow());
  $("edu-add").addEventListener("click", () => addEduRow());

  $("profile-select").addEventListener("change", () => {
    const name = $<HTMLSelectElement>("profile-select").value;
    db = { ...db, activeProfile: name };
    store.save(db);
    fillForm(db.profiles[name] ?? EMPTY_RESUME);
  });

  $("profile-save").addEventListener("click", () => {
    const name = val("profile-name").trim() || db.activeProfile;
    db = store.saveProfile(db, name, readResume());
    store.save(db);
    refreshProfileSelect();
    status(`Saved profile "${name}" (stays in this browser).`);
  });

  $("r-download").addEventListener("click", async () => {
    try {
      status("Rendering PDF…");
      const r = readResume();
      const bytes = await renderResumePdf(r);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      a.download = `${(r.name || "resume").replace(/[^\w-]+/g, "-")}.pdf`;
      a.click();
      status(`Downloaded ${a.download}.`);
    } catch (e) {
      status(e instanceof Error ? e.message : String(e), true);
    }
  });

  $("r-plain").addEventListener("click", async () => {
    const text = resumeToPlainText(readResume());
    try {
      await navigator.clipboard.writeText(text);
      status("Plain-text resume copied to clipboard.");
    } catch {
      status("Clipboard blocked — text logged to console instead.", true);
      console.log(text);
    }
  });

  $("ats-run").addEventListener("click", () => {
    const jd = $<HTMLTextAreaElement>("ats-jd").value;
    if (!jd.trim()) return status("Paste a job description first", true);
    const res = atsScore(resumeToPlainText(readResume()), jd);
    $("ats-result").hidden = false;
    $("ats-score").textContent = `${res.score}%`;
    $("ats-missing").textContent = res.missing.length ? res.missing.join(", ") : "None — nice.";
    $("ats-matched").textContent = res.matched.join(", ") || "none yet";
    status("");
  });

  $("data-export").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([store.exportJson(db)], { type: "application/json" }));
    a.download = "forgeresume-backup.json";
    a.click();
  });

  $("data-import").addEventListener("change", async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      db = store.importJson(await f.text());
      store.save(db);
      refreshProfileSelect();
      fillForm(db.profiles[db.activeProfile]);
      status("Backup imported.");
    } catch (err) {
      status(err instanceof Error ? err.message : String(err), true);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
