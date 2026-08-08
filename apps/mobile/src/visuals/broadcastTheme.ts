/** Premium sports UI tokens — dark (default) and light. */

export type ThemeMode = "dark" | "light";

export type BroadcastTokens = {
  bg: string;
  bgDeep: string;
  bgMid: string;
  meshTeal: string;
  meshCyan: string;
  meshMagenta: string;
  meshViolet: string;
  meshGreen: string;
  meshPurple: string;
  surface: string;
  surfaceAlt: string;
  surfaceElevated: string;
  card: string;
  cardBorder: string;
  cardGlow: string;
  rowRight: string;
  rowRightMine: string;
  /** Primary text / bright fill */
  white: string;
  /** Ink on light CTAs */
  ink: string;
  inkMuted: string;
  mist: string;
  mistDim: string;
  pill: string;
  accent: string;
  accentSoft: string;
  accentGlow: string;
  accentMuted: string;
  accentMagenta: string;
  accentMagentaSoft: string;
  gold: string;
  cta: string;
  ctaText: string;
  ctaSecondaryBorder: string;
  zoneUcl: string;
  zoneUel: string;
  zoneUecl: string;
  danger: string;
  dangerBorder: string;
  geometric: string;
  pitch: string;
  pitchMid: string;
  pitchLine: string;
  pitchBorder: string;
  pitchBadge: string;
  pitchBadgeBorder: string;
  radiusSm: number;
  radiusMd: number;
  radiusLg: number;
  radiusXl: number;
  radiusPill: number;
  /** Theme chrome for chips / toggles */
  chipBg: string;
  chipBorder: string;
  dateChipBg: string;
  dateChipBorder: string;
  dateChipText: string;
};

export const darkBroadcast: BroadcastTokens = {
  bg: "#0A0E18",
  bgDeep: "#05070C",
  bgMid: "#0B101C",
  meshTeal: "#00D4FF",
  meshCyan: "#00E8FF",
  meshMagenta: "#FF2D9B",
  meshViolet: "#7B5CFF",
  meshGreen: "#00FF9C",
  meshPurple: "#A855F7",
  surface: "rgba(14, 20, 36, 0.92)",
  surfaceAlt: "rgba(10, 14, 26, 0.9)",
  surfaceElevated: "rgba(18, 26, 44, 0.95)",
  card: "rgba(12, 18, 32, 0.94)",
  cardBorder: "rgba(0, 232, 255, 0.34)",
  cardGlow: "rgba(0, 232, 255, 0.45)",
  rowRight: "rgba(10, 24, 48, 0.85)",
  rowRightMine: "rgba(18, 48, 74, 0.9)",
  white: "#FFFFFF",
  ink: "#05080F",
  inkMuted: "#8B9BB8",
  mist: "rgba(255,255,255,0.72)",
  mistDim: "rgba(255,255,255,0.42)",
  pill: "rgba(18, 26, 44, 0.92)",
  accent: "#00E8FF",
  accentSoft: "rgba(0,232,255,0.28)",
  accentGlow: "rgba(0,232,255,0.7)",
  accentMuted: "#00B4CC",
  accentMagenta: "#FF2D9B",
  accentMagentaSoft: "rgba(255,45,155,0.18)",
  gold: "#D4B56A",
  cta: "#FFFFFF",
  ctaText: "#05080F",
  ctaSecondaryBorder: "rgba(0,232,255,0.32)",
  zoneUcl: "#2E9B5A",
  zoneUel: "#C47828",
  zoneUecl: "#3D7EC4",
  danger: "#E8A0A0",
  dangerBorder: "#5A3030",
  geometric: "rgba(0,232,255,0.18)",
  pitch: "#060B14",
  pitchMid: "#0A1220",
  pitchLine: "rgba(0,232,255,0.42)",
  pitchBorder: "rgba(0,232,255,0.28)",
  pitchBadge: "#121A2E",
  pitchBadgeBorder: "rgba(255,255,255,0.14)",
  radiusSm: 10,
  radiusMd: 16,
  radiusLg: 22,
  radiusXl: 28,
  radiusPill: 999,
  chipBg: "rgba(5, 8, 15, 0.72)",
  chipBorder: "rgba(255,255,255,0.22)",
  dateChipBg: "rgba(0, 232, 255, 0.14)",
  dateChipBorder: "rgba(0, 232, 255, 0.65)",
  dateChipText: "#FFFFFF",
};

export const lightBroadcast: BroadcastTokens = {
  bg: "#F2F4F8",
  bgDeep: "#E8ECF2",
  bgMid: "#DEE3EB",
  meshTeal: "#0090B0",
  meshCyan: "#0088A8",
  meshMagenta: "#C2186A",
  meshViolet: "#5B3FBF",
  meshGreen: "#0A9B64",
  meshPurple: "#7C3AED",
  surface: "#FFFFFF",
  surfaceAlt: "#F7F9FC",
  surfaceElevated: "#FFFFFF",
  card: "#FFFFFF",
  cardBorder: "rgba(0, 120, 150, 0.28)",
  cardGlow: "rgba(0, 120, 150, 0.2)",
  rowRight: "#F0F4F8",
  rowRightMine: "#E3F2F7",
  white: "#0C121C",
  ink: "#05080F",
  inkMuted: "#5A6A82",
  mist: "rgba(12,18,28,0.78)",
  mistDim: "rgba(12,18,28,0.55)",
  pill: "#FFFFFF",
  accent: "#0088A8",
  accentSoft: "rgba(0,136,168,0.16)",
  accentGlow: "rgba(0,136,168,0.45)",
  accentMuted: "#007090",
  accentMagenta: "#C2186A",
  accentMagentaSoft: "rgba(194,24,106,0.12)",
  gold: "#7A5C12",
  /** Primary action fill — accent, not near-black (readable label on light UI). */
  cta: "#0088A8",
  ctaText: "#FFFFFF",
  ctaSecondaryBorder: "rgba(0,136,168,0.35)",
  zoneUcl: "#1F7A45",
  zoneUel: "#A66A1A",
  zoneUecl: "#2F6AA8",
  danger: "#B33A3A",
  dangerBorder: "#E8B4B4",
  geometric: "rgba(0,136,168,0.14)",
  pitch: "#E7EFE8",
  pitchMid: "#D8E5DA",
  pitchLine: "rgba(0,100,80,0.35)",
  pitchBorder: "rgba(0,100,80,0.22)",
  pitchBadge: "#FFFFFF",
  pitchBadgeBorder: "rgba(12,18,28,0.12)",
  radiusSm: 10,
  radiusMd: 16,
  radiusLg: 22,
  radiusXl: 28,
  radiusPill: 999,
  chipBg: "rgba(255,255,255,0.92)",
  chipBorder: "rgba(12,18,28,0.14)",
  dateChipBg: "#FFFFFF",
  dateChipBorder: "rgba(0, 136, 168, 0.55)",
  dateChipText: "#0C121C",
};

/** Live token bag — mutated on theme change; StyleSheet factories re-read it. */
export const broadcast: BroadcastTokens = { ...darkBroadcast };

type Listener = () => void;
const listeners = new Set<Listener>();
const rebuilders = new Set<Listener>();

let mode: ThemeMode = "dark";

export function getThemeMode(): ThemeMode {
  return mode;
}

export function subscribeTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Register StyleSheet rebuilders that must run before React re-renders. */
export function registerThemeRebuild(rebuild: Listener): () => void {
  rebuilders.add(rebuild);
  return () => rebuilders.delete(rebuild);
}

export function setThemeMode(next: ThemeMode): void {
  if (next === mode) return;
  mode = next;
  Object.assign(broadcast, next === "light" ? lightBroadcast : darkBroadcast);
  rebuilders.forEach((r) => r());
  listeners.forEach((l) => l());
}

export function toggleThemeMode(): ThemeMode {
  const next: ThemeMode = mode === "dark" ? "light" : "dark";
  setThemeMode(next);
  return next;
}

export type BroadcastZone = "ucl" | "uel" | "uecl";

export const titleEnergy = {
  color: broadcast.white,
  fontWeight: "800" as const,
  letterSpacing: 1.2,
  textTransform: "uppercase" as const,
};

export const titleSection = {
  color: broadcast.mist,
  fontWeight: "700" as const,
  letterSpacing: 1.3,
  textTransform: "uppercase" as const,
  fontSize: 11,
};
