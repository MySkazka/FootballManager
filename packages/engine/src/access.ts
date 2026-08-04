import type { ContinentalAccessRule, WorldPack } from "./types";

function seasonKey(season: string): number {
  // "2024/25" -> 2024
  return parseInt(season.slice(0, 4), 10);
}

function ruleApplies(rule: ContinentalAccessRule, season: string): boolean {
  const s = seasonKey(season);
  const from = seasonKey(rule.range.fromSeason);
  const to = rule.range.toSeason ? seasonKey(rule.range.toSeason) : null;
  if (s < from) return false;
  if (to !== null && s > to) return false;
  return true;
}

/** Effective continental cup access for a federation in a given season. */
export function hasContinentalAccess(
  pack: WorldPack,
  federationId: string,
  season: string = pack.season
): boolean {
  const rules = pack.continentalAccess
    .filter((r) => r.federationId === federationId)
    .filter((r) => ruleApplies(r, season))
    .sort((a, b) => seasonKey(b.range.fromSeason) - seasonKey(a.range.fromSeason));

  if (rules.length === 0) return true; // default: allowed unless restricted
  return rules[0].allowed;
}

/** Federations that can send clubs to continental tournaments this season. */
export function federationsWithContinentalAccess(pack: WorldPack, season?: string): string[] {
  const s = season ?? pack.season;
  return pack.federations
    .filter((f) => hasContinentalAccess(pack, f.id, s))
    .map((f) => f.id);
}
