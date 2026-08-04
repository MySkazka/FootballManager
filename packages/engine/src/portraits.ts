/** Skin-tone buckets for portrait assets player-01 … player-N (0-based). */
export type PortraitTone = "light" | "medium" | "dark";

export const PORTRAIT_COUNT = 100;

/** Bump when portrait pack or assignment rules change — triggers respread on save load. */
export const PORTRAIT_SCHEMA = 4;

/**
 * Tone of each player-0N.png (0-based index).
 * Keep in sync with apps/mobile assets player-01…player-100.
 */
export const PORTRAIT_TONES: PortraitTone[] = [
  // 01–10 (original pack)
  "light", "dark", "light", "medium", "light", "dark", "medium", "medium", "light", "medium",
  // 11–20
  "light", "dark", "light", "dark", "light", "dark", "medium", "light", "medium", "dark",
  // 21–28
  "light", "medium", "light", "dark", "medium", "light", "medium", "medium",
  // 29–40
  "light", // 29 platinum
  "dark", // 30 braided
  "light", // 31 copper curly
  "medium", // 32 mediterranean
  "medium", // 33 ash-gray asian
  "medium", // 34 bleached buzz latino
  "dark", // 35 pink tips
  "light", // 36 long wavy
  "medium", // 37 bald mustache
  "light", // 38 blue highlights
  "dark", // 39 honey afro
  "light", // 40 silver older
  // 41–50
  "light", // 41 green hair
  "dark", // 42 cornrows gold
  "light", // 43 ginger pony
  "medium", // 44 purple hair
  "light", // 45 white buzz beard
  "dark", // 46 twists
  "light", // 47 strawberry
  "dark", // 48 high-top
  "light", // 49 man-bun
  "medium", // 50 teal hair
  // 51–60
  "light", // 51 undercut
  "dark", // 52 salt-pepper
  "light", // 53 neon orange
  "dark", // 54 dreads
  "medium", // 55 bowl cut
  "dark", // 56 blonde mohawk
  "light", // 57 sandy
  "medium", // 58 curly black
  "light", // 59 platinum mullet
  "dark", // 60 coils
  // 61–70
  "light", // 61 auburn
  "medium", // 62 white streak
  "medium", // 63 permed asian
  "dark", // 64 bald gray beard
  "light", // 65 pink curly
  "medium", // 66 pompadour
  "light", // 67 dirty blonde
  "dark", // 68 locs amber
  "medium", // 69 chestnut
  "light", // 70 raven long
  // 71–80
  "light", // 71 red tips
  "dark", // 72 fade curly
  "light", // 73 mutton chops
  "medium", // 74 braids back
  "light", // 75 yellow hair
  "dark", // 76 gray temples
  "light", // 77 ash-brown
  "medium", // 78 double bun
  "light", // 79 copper buzz
  "dark", // 80 wavy black
  // 81–90
  "light", // 81 violet long
  "dark", // 82 blonde patch
  "light", // 83 mint tips
  "dark", // 84 bald ebony
  "light", // 85 honey curtain
  "medium", // 86 buzz beard
  "light", // 87 blue underlight
  "dark", // 88 copper beads
  "light", // 89 silver-white
  "medium", // 90 wavy tan
  // 91–100
  "light", // 91 flat-top
  "dark", // 92 burgundy
  "light", // 93 blonde bangs
  "medium", // 94 horseshoe
  "light", // 95 orange curly
  "dark", // 96 cornrow fade
  "light", // 97 chocolate brown
  "dark", // 98 gray streak
  "light", // 99 neon blue
  "medium", // 100 curly beard
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

    let chosen: number | null = null;
    for (const t of toneNeighbors(tone)) {
      const pool = TONE_IDS[t].filter((id) => !used.has(id));
      if (pool.length) {
        chosen = rng.pick(pool);
        break;
      }
    }

    if (chosen == null) {
      const leftover = [...Array(PORTRAIT_COUNT).keys()].filter((id) => !used.has(id));
      if (leftover.length) chosen = rng.pick(leftover);
    }

    if (chosen == null) {
      let best: number[] = [];
      let bestCount = Infinity;
      for (const t of toneNeighbors(tone)) {
        for (const id of TONE_IDS[t]) {
          const c = useCount.get(id) ?? 0;
          if (c < bestCount) {
            bestCount = c;
            best = [id];
          } else if (c === bestCount) best.push(id);
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
