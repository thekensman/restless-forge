/* Multi-profile localStorage persistence for ForgeResume. */

import { ResumeData, EMPTY_RESUME } from "./engine";

const KEY = "forgeresume:v1";

export interface ProfileStore {
  profiles: Record<string, ResumeData>;
  activeProfile: string;
}

export const EMPTY_PROFILES: ProfileStore = {
  profiles: { Default: structuredClone(EMPTY_RESUME) },
  activeProfile: "Default",
};

export function load(): ProfileStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY_PROFILES);
    const parsed = JSON.parse(raw) as Partial<ProfileStore>;
    const profiles =
      parsed.profiles && typeof parsed.profiles === "object" && Object.keys(parsed.profiles).length
        ? (parsed.profiles as Record<string, ResumeData>)
        : structuredClone(EMPTY_PROFILES.profiles);
    const active =
      typeof parsed.activeProfile === "string" && profiles[parsed.activeProfile]
        ? parsed.activeProfile
        : Object.keys(profiles)[0];
    return { profiles, activeProfile: active };
  } catch {
    return structuredClone(EMPTY_PROFILES);
  }
}

export function save(store: ProfileStore): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function saveProfile(store: ProfileStore, name: string, data: ResumeData): ProfileStore {
  return { profiles: { ...store.profiles, [name]: data }, activeProfile: name };
}

export function deleteProfile(store: ProfileStore, name: string): ProfileStore {
  const profiles = { ...store.profiles };
  delete profiles[name];
  if (Object.keys(profiles).length === 0) return structuredClone(EMPTY_PROFILES);
  const active = store.activeProfile === name ? Object.keys(profiles)[0] : store.activeProfile;
  return { profiles, activeProfile: active };
}

export function exportJson(store: ProfileStore): string {
  return JSON.stringify({ app: "forgeresume", version: 1, ...store }, null, 2);
}

export function importJson(raw: string): ProfileStore {
  const parsed = JSON.parse(raw) as Partial<ProfileStore> & { app?: string };
  if (parsed.app !== "forgeresume") throw new Error("Not a ForgeResume backup file");
  if (!parsed.profiles || !Object.keys(parsed.profiles).length) throw new Error("Backup has no profiles");
  const active =
    typeof parsed.activeProfile === "string" && parsed.profiles[parsed.activeProfile]
      ? parsed.activeProfile
      : Object.keys(parsed.profiles)[0];
  return { profiles: parsed.profiles as Record<string, ResumeData>, activeProfile: active };
}
