/** Skin-tone buckets for portrait assets player-01 … player-N (0-based). */
export type PortraitTone = "light" | "medium" | "dark";

export const PORTRAIT_COUNT = 28;

/** Bump when portrait pack or assignment rules change — triggers respread on save load. */
export const PORTRAIT_SCHEMA = 3;

/**
 * Tone of each player-0N.png (0-based index).
 * Keep in sync with apps/mobile assets player-01…player-28.
 */
export const PORTRAIT_TONES: PortraitTone[] = [
  "light", // 01 fair smile
  "dark", // 02
  "light", // 03 blonde
  "medium", // 04 olive
  "light", // 05 ginger freckles
  "dark", // 06 bald
  "medium", // 07 tan + stubble
  "medium", // 08 tan ponytail
  "light", // 09 ginger
  "medium", // 10 olive buzz
  "light", // 11 curly + beard
  "dark", // 12 fade
  "light", // 13 older thinning
  "dark", // 14 afro
  "light", // 15 long straight hair
  "dark", // 16 dreads
  "medium", // 17 mustache
  "light", // 18 platinum buzz
  "medium", // 19 wavy latino
  "dark", // 20 bald goatee
  "light", // 21 messy blonde
  "medium", // 22 thick brows
  "light", // 23 ginger beard
  "dark", // 24 cornrows
  "medium", // 25 slicked
  "light", // 26 mullet
  "medium", // 27 bald + beard
  "medium", // 28 east-asian short
];

if (PORTRAIT_TONES.length !== PORTRAIT_COUNT) {
  throw new Error(`PORTRAIT_TONES length ${PORTRAIT_TONES.length} != PORTRAIT_COUNT ${PORTRAIT_COUNT}`);
}

const TONE_IDS: Record<PortraitTone, number[]> = {
  light: PORTRAIT_TONES.map((t, i) => (t === "light" ? i : -1)).filter((i) => i >= 0),
  medium: PORTRAIT_TONES.map((t, i) => (t === "medium" ? i : -1)).filter((i) => i >= 0),
  dark: PORTRAIT_TONES.map((t, i) => (t === "dark" ? i : -1)).filter((i) => i >= 0),
};

/** Typical appearance mix by federation (priors for matching names ↔ faces). */
export function toneWeights(nationalityId: string): Record<PortraitTone, number> {
  switch (nationalityId) {
    case "RUS":
    case "BLR":
    case "UKR":
      return { light: 0.82, medium: 0.16, dark: 0.02 };
    case "KAZ":
      return { light: 0.55, medium: 0.4, dark: 0.05 };
    case "GER":
    case "NED":
      return { light: 0.72, medium: 0.23, dark: 0.05 };
    case "ENG":
      return { light: 0.48, medium: 0.32, dark: 0.2 };
    case "FRA":
      return { light: 0.38, medium: 0.34, dark: 0.28 };
    case "ESP":
    case "ITA":
    case "POR":
    case "CRO":
      return { light: 0.32, medium: 0.54, dark: 0.14 };
    case "ARG":
    case "COL":
      return { light: 0.22, medium: 0.58, dark: 0.2 };
    case "BRA":
      return { light: 0.18, medium: 0.42, dark: 0.4 };
    case "SEN":
    case "NGA":
      return { light: 0.05, medium: 0.15, dark: 0.8 };
    case "SRB":
      return { light: 0.7, medium: 0.26, dark: 0.04 };
    default:
      return { light: 0.45, medium: 0.4, dark: 0.15 };
  }
}

function pickTone(weights: Record<PortraitTone, number>, roll: number): PortraitTone {
  const entries = Object.entries(weights) as [PortraitTone, number][];
  let r = roll;
  for (const [tone, w] of entries) {
    r -= w;
    if (r <= 0) return tone;
  }
  return "light";
}

type MiniRng = { next: () => number; pick: <T>(items: T[]) => T };

function toneNeighbors(tone: PortraitTone): PortraitTone[] {
  if (tone === "light") return ["light", "medium", "dark"];
  if (tone === "dark") return ["dark", "medium", "light"];
  return ["medium", "light", "dark"];
}

/**
 * Assign portrait indices for a squad.
 * Uniqueness within the squad is preferred over perfect tone match:
 * use every face once before any face is reused.
 */
export function assignSquadPortraits(nationalityIds: string[], rng: MiniRng): number[] {
  const used = new Set<number>();
  const useCount = new Map<number, number>();
  for (let i = 0; i < PORTRAIT_COUNT; i++) useCount.set(i, 0);

  return nationalityIds.map((nat) => {
    const weights = toneWeights(nat);
    const tone = pickTone(weights, rng.next());

    // 1) Unused faces in preferred / neighboring tones
    let chosen: number | null = null;
    for (const t of toneNeighbors(tone)) {
      const pool = TONE_IDS[t].filter((id) => !used.has(id));
      if (pool.length) {
        chosen = rng.pick(pool);
        break;
      }
    }

    // 2) Any unused face left in the pack
    if (chosen == null) {
      const leftover = [...Array(PORTRAIT_COUNT).keys()].filter((id) => !used.has(id));
      if (leftover.length) chosen = rng.pick(leftover);
    }

    // 3) Squad larger than pack — reuse least-used, prefer tone
    if (chosen == null) {
      let best: number[] = [];
      let bestCount = Infinity;
      for (const t of toneNeighbors(tone)) {
        for (const id of TONE_IDS[t]) {
          const c = useCount.get(id) ?? 0;
          if (c < bestCount) {
            bestCount = c;
            best = [id];
          } else if (c === bestCount) {
            best.push(id);
          }
        }
      }
      if (!best.length) {
        for (let id = 0; id < PORTRAIT_COUNT; id++) {
          const c = useCount.get(id) ?? 0;
          if (c < bestCount) {
            bestCount = c;
            best = [id];
          } else if (c === bestCount) best.push(id);
        }
      }
      chosen = rng.pick(best);
    }

    used.add(chosen);
    useCount.set(chosen, (useCount.get(chosen) ?? 0) + 1);
    if (used.size >= PORTRAIT_COUNT) used.clear();
    return chosen;
  });
}

export function isValidPortraitId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id >= 0 && id < PORTRAIT_COUNT;
}

export function portraitIdForPlayer(nationalityId: string, seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const roll = ((h >>> 0) % 1000) / 1000;
  const tone = pickTone(toneWeights(nationalityId), roll);
  const pool = TONE_IDS[tone];
  return pool[Math.abs(h) % pool.length];
}
