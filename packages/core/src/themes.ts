import type { ThemeName } from "./types";

export interface ThemeDefinition {
  name: ThemeName;
  label: string;
  fontFamily: string;
  accent: string;
  /** Key into the font CSS files (e.g. "depart" → fonts-depart.css). */
  fontFile: string;
}

export const themes: Record<ThemeName, ThemeDefinition> = {
  plex: {
    name: "plex",
    label: "Plex",
    fontFamily: '"IBM Plex Sans Condensed", "IBM Plex Sans", sans-serif',
    accent: "#4A90D9",
    fontFile: "fonts-plex.css",
  },
  depart: {
    name: "depart",
    label: "Depart",
    fontFamily: '"Departure Mono", "IBM Plex Mono", monospace',
    accent: "#FFD043",
    fontFile: "fonts-depart.css",
  },
};

export const defaultTheme: ThemeName = "plex";
