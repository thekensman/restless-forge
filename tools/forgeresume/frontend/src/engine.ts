/* ═══════════════════════════════════════════════════════
   ForgeResume — data model + ATS keyword matching. Pure
   text analysis (no AI, no network); storage.ts persists,
   pdf.ts renders, app.ts wires the DOM.
   ═══════════════════════════════════════════════════════ */

export interface ExperienceEntry {
  role: string;
  company: string;
  start: string;
  end: string;
  description: string;
}

export interface EducationEntry {
  degree: string;
  school: string;
  year: string;
}

export interface ResumeData {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  /** comma/newline separated in the UI; stored as a flat list */
  skills: string[];
}

export const EMPTY_RESUME: ResumeData = {
  name: "",
  title: "",
  email: "",
  phone: "",
  location: "",
  website: "",
  summary: "",
  experience: [],
  education: [],
  skills: [],
};

/** Flatten a resume to plain text (also used for pasting into ATS forms). */
export function resumeToPlainText(r: ResumeData): string {
  const lines: string[] = [];
  if (r.name) lines.push(r.name);
  if (r.title) lines.push(r.title);
  const contact = [r.email, r.phone, r.location, r.website].filter(Boolean).join(" · ");
  if (contact) lines.push(contact);
  if (r.summary) lines.push("", "SUMMARY", r.summary);
  if (r.experience.length) {
    lines.push("", "EXPERIENCE");
    for (const e of r.experience) {
      lines.push(`${e.role} — ${e.company} (${e.start}–${e.end || "present"})`);
      if (e.description) lines.push(e.description);
    }
  }
  if (r.education.length) {
    lines.push("", "EDUCATION");
    for (const e of r.education) lines.push(`${e.degree}, ${e.school} (${e.year})`);
  }
  if (r.skills.length) lines.push("", "SKILLS", r.skills.join(", "));
  return lines.join("\n");
}

/* ── ATS keyword matching ── */

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its " +
    "may more most much must my no nor not of on or our out own she should so some such than that the their them then there " +
    "these they this those to too until up us was we were what when where which while who whom why will with would you your " +
    "job role team work working candidate experience years ability strong preferred required requirements responsibilities " +
    "including etc plus new using use skills knowledge related within across also well"
  ).split(/\s+/),
);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9+#.-]{1,}/g) ?? []).map((w) =>
    w.replace(/[.,]+$/, ""),
  );
}

/**
 * Keywords worth matching from a job description: non-stopword tokens of
 * length ≥ 3 (or containing digits/symbols like "c#", "ci/cd" fragments),
 * ranked by frequency, deduped, capped at `limit`.
 */
export function extractKeywords(jobDescription: string, limit = 30): string[] {
  const counts = new Map<string, number>();
  for (const t of tokenize(jobDescription)) {
    if (STOPWORDS.has(t)) continue;
    if (t.length < 3 && !/[0-9+#]/.test(t)) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([w]) => w);
}

export interface AtsResult {
  /** 0–100, percentage of extracted keywords present in the resume */
  score: number;
  matched: string[];
  missing: string[];
}

export function atsScore(resumeText: string, jobDescription: string): AtsResult {
  const keywords = extractKeywords(jobDescription);
  if (keywords.length === 0) return { score: 0, matched: [], missing: [] };
  const resumeTokens = new Set(tokenize(resumeText));
  const matched: string[] = [];
  const missing: string[] = [];
  for (const k of keywords) (resumeTokens.has(k) ? matched : missing).push(k);
  return { score: Math.round((matched.length / keywords.length) * 100), matched, missing };
}

/** Parse the skills textarea: split on commas/newlines, trim, dedupe. */
export function parseSkills(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw.split(/[,\n]/)) {
    const t = s.trim();
    const key = t.toLowerCase();
    if (t && !seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}
