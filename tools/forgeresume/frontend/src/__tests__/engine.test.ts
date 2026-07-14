import { describe, it, expect, beforeEach } from "vitest";
import {
  extractKeywords,
  atsScore,
  parseSkills,
  resumeToPlainText,
  EMPTY_RESUME,
  ResumeData,
} from "../engine";
import { load, save, saveProfile, deleteProfile, exportJson, importJson, EMPTY_PROFILES } from "../storage";

const JOB = `We are hiring a Senior TypeScript Engineer to build React applications.
Requirements: TypeScript, React, Node.js, GraphQL, testing with Vitest,
CI/CD pipelines, PostgreSQL. Experience with Kubernetes preferred.
Strong TypeScript skills required. React React React.`;

const RESUME: ResumeData = {
  ...EMPTY_RESUME,
  name: "Ada Example",
  title: "Software Engineer",
  email: "ada@example.com",
  summary: "Engineer focused on TypeScript and React with GraphQL APIs.",
  experience: [
    {
      role: "Engineer",
      company: "ExampleCo",
      start: "2022",
      end: "",
      description: "Built Node.js services, tested with Vitest.",
    },
  ],
  education: [{ degree: "BSc CS", school: "State U", year: "2021" }],
  skills: ["TypeScript", "React", "GraphQL"],
};

describe("extractKeywords", () => {
  it("surfaces the load-bearing terms, most frequent first", () => {
    const kw = extractKeywords(JOB);
    expect(kw[0]).toBe("react"); // mentioned 5 times
    expect(kw).toContain("typescript");
    expect(kw).toContain("kubernetes");
    expect(kw).toContain("postgresql");
  });
  it("drops stopwords and hiring boilerplate", () => {
    const kw = extractKeywords(JOB);
    expect(kw).not.toContain("the");
    expect(kw).not.toContain("experience");
    expect(kw).not.toContain("required");
  });
  it("empty description → no keywords", () => {
    expect(extractKeywords("")).toEqual([]);
  });
});

describe("atsScore", () => {
  it("scores matched vs missing keywords", () => {
    const res = atsScore(resumeToPlainText(RESUME), JOB);
    expect(res.matched).toContain("typescript");
    expect(res.matched).toContain("react");
    expect(res.matched).toContain("vitest");
    expect(res.missing).toContain("kubernetes");
    expect(res.missing).toContain("postgresql");
    expect(res.score).toBeGreaterThan(30);
    expect(res.score).toBeLessThan(100);
  });
  it("perfect resume scores 100", () => {
    const res = atsScore(JOB, JOB);
    expect(res.score).toBe(100);
    expect(res.missing).toEqual([]);
  });
  it("empty job description scores 0 without dividing by zero", () => {
    expect(atsScore("anything", "").score).toBe(0);
  });
});

describe("parseSkills", () => {
  it("splits on commas and newlines, trims, dedupes case-insensitively", () => {
    expect(parseSkills("TypeScript, react\nReact , GraphQL,,")).toEqual([
      "TypeScript",
      "react",
      "GraphQL",
    ]);
  });
});

describe("resumeToPlainText", () => {
  it("includes every populated section", () => {
    const t = resumeToPlainText(RESUME);
    expect(t).toContain("Ada Example");
    expect(t).toContain("SUMMARY");
    expect(t).toContain("EXPERIENCE");
    expect(t).toContain("Engineer — ExampleCo (2022–present)");
    expect(t).toContain("EDUCATION");
    expect(t).toContain("SKILLS");
  });
  it("empty resume produces empty-ish text", () => {
    expect(resumeToPlainText(EMPTY_RESUME).trim()).toBe("");
  });
});

describe("profile storage", () => {
  beforeEach(() => localStorage.clear());

  it("fresh load yields the Default profile", () => {
    expect(load()).toEqual(EMPTY_PROFILES);
  });

  it("save/load round-trip with multiple profiles", () => {
    let s = load();
    s = saveProfile(s, "Backend", RESUME);
    save(s);
    const back = load();
    expect(Object.keys(back.profiles).sort()).toEqual(["Backend", "Default"]);
    expect(back.activeProfile).toBe("Backend");
    expect(back.profiles["Backend"].name).toBe("Ada Example");
  });

  it("deleting the active profile falls back to another; deleting all resets", () => {
    let s = saveProfile(load(), "Backend", RESUME);
    s = deleteProfile(s, "Backend");
    expect(s.activeProfile).toBe("Default");
    s = deleteProfile(s, "Default");
    expect(s).toEqual(EMPTY_PROFILES);
  });

  it("export/import round-trip; rejects foreign JSON", () => {
    const s = saveProfile(load(), "Backend", RESUME);
    const back = importJson(exportJson(s));
    expect(back.profiles["Backend"].skills).toContain("GraphQL");
    expect(() => importJson('{"app":"nope","profiles":{"x":{}}}')).toThrow();
  });

  it("corrupt localStorage falls back to defaults", () => {
    localStorage.setItem("forgeresume:v1", "]]][[");
    expect(load()).toEqual(EMPTY_PROFILES);
  });
});
