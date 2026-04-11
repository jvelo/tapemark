import type { ThemeName } from "./types";

export interface ThemeDefinition {
  name: ThemeName;
  label: string;
  fontFamily: string;
  /** Monospace companion — used for UUIDs, JSON, code, hashes. */
  fontFamilyMono: string;
  /** Key into the font CSS files (e.g. "depart" → fonts-depart.css). */
  fontFile: string;
  /** Base font size for the UI. Table cells scale from this via em units. */
  fontSizeBase: string;
  /** Background color. */
  bg: string;
  /** Primary text color. */
  text: string;
  /** Border / divider color. */
  border: string;
  /** Accent color for links, focus, primary actions. */
  accent: string;
  /** Text color that reads well on top of the accent color. */
  accentText: string;
}

export const themes: Record<ThemeName, ThemeDefinition> = {
  hubot: {
    name: "hubot",
    label: "Hubot",
    fontFamily: '"Hubot Sans", system-ui, sans-serif',
    fontFamilyMono: '"Monaspace Neon", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    fontFile: "fonts-hubot.css",
    fontSizeBase: "0.9375rem",
    bg: "#fafaf8",
    text: "#1a1a1a",
    border: "#d8d6d2",
    accent: "#3D5A80",
    accentText: "#ffffff",
  },
  plex: {
    name: "plex",
    label: "Plex",
    fontFamily: '"IBM Plex Sans Condensed", "IBM Plex Sans", sans-serif',
    fontFamilyMono: '"IBM Plex Mono", ui-monospace, monospace',
    fontFile: "fonts-plex.css",
    fontSizeBase: "0.81rem",
    bg: "#161a1f",
    text: "#ffffff",
    border: "#f3f3f3",
    accent: "#3B8EA5",
    accentText: "#ffffff",
  },
  depart: {
    name: "depart",
    label: "Depart",
    fontFamily: '"Departure Mono", "IBM Plex Mono", monospace',
    fontFamilyMono: '"Departure Mono", ui-monospace, monospace',
    fontFile: "fonts-depart.css",
    fontSizeBase: "0.81rem",
    bg: "#181818",
    text: "#ffffff",
    border: "#f3f3f3",
    accent: "#FFD043",
    accentText: "#181818",
  },
};

export const defaultTheme: ThemeName = "hubot";
