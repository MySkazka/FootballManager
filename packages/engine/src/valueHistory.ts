import type { CareerSave, Player, PlayerSeasonStats } from "./types";

export type ValueHistoryPoint = {
  /** Axis label (age or season milestone). */
  label: string;
  age?: number;
  value: number;
};

function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

function roundMv(v: number): number {
  return Math.max(0.1, Math.round(v * 10) / 10);
}

/**
 * Fabricated yearly market-value path from career debut to now.
 * Last point always matches the player's current market value.
 */
export function buildCareerValueHistory(player: Player): ValueHistoryPoint[] {
  const current = Math.max(0.1, player.marketValue ?? 0.1);
  const age = Math.max(16, player.age);
  const debutRoll = hashUnit(player.id + ":debut");
  const debutAge = Math.min(age, Math.max(16, 16 + Math.floor(debutRoll * 3))); // 16–18
  const peakAge = 24 + Math.floor(hashUnit(player.id + ":peak") * 5); // 24–28
  const potGap = Math.max(0, (player.potential ?? player.overall) - player.overall);
  const debutShare = 0.04 + hashUnit(player.id + ":floor") * 0.1; // 4–14% of current at debut

  const n = age - debutAge + 1;
  const points: ValueHistoryPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = debutAge + i;
    const t = n === 1 ? 1 : i / (n - 1);
    // Growth toward peak, then soft decline — then remap so end = current
    let curve: number;
    if (a <= peakAge) {
      const span = Math.max(1, Math.min(peakAge, age) - debutAge);
      const u = (a - debutAge) / span;
      curve = debutShare + (1 - debutShare) * Math.pow(Math.min(1, u), 1.05);
    } else {
      const over = (a - peakAge) / Math.max(1, age - peakAge);
      const fade = 0.08 + hashUnit(player.id + ":fade") * 0.28;
      curve = 1 - over * fade * (age > peakAge ? 1 : 0);
      curve = Math.max(debutShare + 0.15, curve);
    }
    if (a <= 21 && potGap >= 6) {
      curve *= 0.75 + 0.25 * ((a - debutAge) / Math.max(1, 21 - debutAge));
    }
    const wobble = 0.92 + hashUnit(`${player.id}:yv:${a}`) * 0.16;
    let value = current * curve * wobble;
    // Keep relative shape, will rescale below
    points.push({ label: `${a}`, age: a, value });
  }

  const lastRaw = points[points.length - 1]?.value || 1;
  const scale = current / lastRaw;
  return points.map((p, i) => ({
    ...p,
    value: i === points.length - 1 ? roundMv(current) : roundMv(p.value * scale),
  }));
}

/**
 * Short series for the current championship: season-start → now,
 * with invented mid-season checkpoints that end on the live value.
 */
export function buildSeasonValueHistory(
  player: Player,
  seasonStartValue: number,
  stats?: PlayerSeasonStats | null,
  seasonLabel = "сезон"
): ValueHistoryPoint[] {
  const start = roundMv(Math.max(0.1, seasonStartValue));
  const current = roundMv(Math.max(0.1, player.marketValue ?? start));
  const apps = stats?.appearances ?? 0;
  const form =
    stats && stats.ratingCount > 0 ? stats.ratingSum / stats.ratingCount : 6.5;

  const midCount = 3;
  const points: ValueHistoryPoint[] = [{ label: "Старт", value: start }];

  for (let i = 1; i <= midCount; i++) {
    const t = i / (midCount + 1);
    const base = start + (current - start) * t;
    // Form / minutes wobble the invented mid points
    const formPush = (form - 6.5) * 0.04 * start;
    const appsPush = Math.min(0.12, apps * 0.004) * (current - start || start * 0.1);
    const noise = (hashUnit(`${player.id}:sv:${i}`) - 0.5) * 0.08 * Math.max(start, current);
    points.push({
      label: i === 2 ? "Середина" : `·`,
      value: roundMv(Math.max(0.1, base + formPush * t + appsPush * t + noise)),
    });
  }
  points.push({ label: "Сейчас", value: current });
  // Relabel middle dots for clarity when few labels
  if (points.length >= 5) {
    points[1]!.label = "Осень";
    points[2]!.label = "Зима";
    points[3]!.label = "Весна";
  }
  void seasonLabel;
  return points;
}

export function seasonValueDelta(
  current: number,
  seasonStart: number
): { absolute: number; percent: number } {
  const absolute = roundMv(current - seasonStart);
  const percent =
    seasonStart > 0 ? Math.round(((current - seasonStart) / seasonStart) * 1000) / 10 : 0;
  return { absolute, percent };
}

/** Snapshot every player's market value as the championship baseline. */
export function snapshotSeasonStartValues(save: CareerSave): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of save.players) {
    map[p.id] = roundMv(p.marketValue ?? 0.1);
  }
  return map;
}

/** Ensure map exists and player has a baseline (arrival / migration). */
export function ensurePlayerSeasonStartValue(
  save: CareerSave,
  playerId: string,
  fallback?: number
): number {
  if (!save.seasonStartMarketValues) save.seasonStartMarketValues = {};
  const existing = save.seasonStartMarketValues[playerId];
  if (existing != null && Number.isFinite(existing)) return existing;
  const p = save.players.find((x) => x.id === playerId);
  const v = roundMv(fallback ?? p?.marketValue ?? 0.1);
  save.seasonStartMarketValues[playerId] = v;
  return v;
}
