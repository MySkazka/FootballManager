import { primaryPosition, roleToLine } from "./labels";
import type {
  FormationId,
  Player,
  PlayerSeasonStats,
  PreferredFoot,
  RoleId,
  TeamTactics,
} from "./types";

export const FORMATIONS: FormationId[] = ["4-4-2", "4-3-3", "3-5-2", "4-2-3-1", "5-3-2"];

/** Detailed formation slots (roles), left→right within each line. */
export const FORMATION_ROLES: Record<FormationId, RoleId[]> = {
  "4-4-2": ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "ST", "ST"],
  "4-3-3": ["GK", "LB", "CB", "CB", "RB", "CM", "CDM", "CM", "LW", "ST", "RW"],
  "3-5-2": ["GK", "CB", "CB", "CB", "LM", "CDM", "CM", "CDM", "RM", "ST", "ST"],
  "4-2-3-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "LM", "CAM", "RM", "ST"],
  "5-3-2": ["GK", "LWB", "CB", "CB", "CB", "RWB", "CM", "CDM", "CM", "ST", "ST"],
};

/** @deprecated coarse slots — prefer FORMATION_ROLES */
export const FORMATION_SLOTS: Record<FormationId, import("./types").Position[]> = {
  "4-4-2": FORMATION_ROLES["4-4-2"].map(roleToLine),
  "4-3-3": FORMATION_ROLES["4-3-3"].map(roleToLine),
  "3-5-2": FORMATION_ROLES["3-5-2"].map(roleToLine),
  "4-2-3-1": FORMATION_ROLES["4-2-3-1"].map(roleToLine),
  "5-3-2": FORMATION_ROLES["5-3-2"].map(roleToLine),
};

export const FORMATION_COORDS: Record<FormationId, { x: number; y: number }[]> = {
  "4-4-2": [
    { x: 50, y: 5 },
    { x: 12, y: 30 }, { x: 36, y: 27 }, { x: 64, y: 27 }, { x: 88, y: 30 },
    { x: 12, y: 55 }, { x: 36, y: 52 }, { x: 64, y: 52 }, { x: 88, y: 55 },
    { x: 34, y: 80 }, { x: 66, y: 80 },
  ],
  "4-3-3": [
    { x: 50, y: 5 },
    { x: 12, y: 30 }, { x: 36, y: 27 }, { x: 64, y: 27 }, { x: 88, y: 30 },
    { x: 24, y: 54 }, { x: 50, y: 50 }, { x: 76, y: 54 },
    { x: 14, y: 78 }, { x: 50, y: 82 }, { x: 86, y: 78 },
  ],
  "3-5-2": [
    { x: 50, y: 5 },
    { x: 24, y: 30 }, { x: 50, y: 27 }, { x: 76, y: 30 },
    { x: 8, y: 54 }, { x: 28, y: 60 }, { x: 50, y: 50 }, { x: 72, y: 60 }, { x: 92, y: 54 },
    { x: 34, y: 82 }, { x: 66, y: 82 },
  ],
  "4-2-3-1": [
    { x: 50, y: 5 },
    { x: 12, y: 28 }, { x: 36, y: 25 }, { x: 64, y: 25 }, { x: 88, y: 28 },
    { x: 34, y: 46 }, { x: 66, y: 46 },
    { x: 14, y: 64 }, { x: 50, y: 62 }, { x: 86, y: 64 },
    { x: 50, y: 82 },
  ],
  "5-3-2": [
    { x: 50, y: 5 },
    { x: 8, y: 32 }, { x: 28, y: 26 }, { x: 50, y: 24 }, { x: 72, y: 26 }, { x: 92, y: 32 },
    { x: 24, y: 55 }, { x: 50, y: 52 }, { x: 76, y: 55 },
    { x: 34, y: 80 }, { x: 66, y: 80 },
  ],
};

export function mentalityLabel(v: number): string {
  if (v <= 20) return "очень низкая";
  if (v <= 40) return "низкая";
  if (v <= 60) return "средняя";
  if (v <= 80) return "высокая";
  return "максимум";
}

/**
 * High attack + defence at once stretches the side: both suffer.
 * Sum 125 = no penalty; sum 200 ≈ 32% effectiveness loss.
 */
export function tacticsStretchPenalty(tactics: TeamTactics): number {
  const overload = tactics.attack + tactics.defence - 125;
  if (overload <= 0) return 0;
  return Math.min(0.32, overload / 230);
}

function roleFromLegacy(player: Player): RoleId {
  const line = primaryPosition(player);
  if (line === "GK") return "GK";
  if (line === "DF") return "CB";
  if (line === "FW") return "ST";
  return "CM";
}

/** How well a player suits a role (higher = better). */
export function roleFitBonus(player: Player, role: RoleId): number {
  const primary = player.preferredRole ?? roleFromLegacy(player);
  const roles = player.roles?.length ? player.roles : [primary];
  let fit = 0;
  if (roles[0] === role) fit = 30;
  else if (roles.includes(role)) fit = 18;
  else if (roleToLine(primary) === roleToLine(role)) fit = 8;
  return fit + flankFootBonus(player.preferredFoot, roleFlank(role));
}

/**
 * Effective overall when playing a specific role.
 * Out-of-position and wrong-foot reduce the displayed/used rating.
 */
export function effectiveOverall(player: Player, role: RoleId): number {
  const primary = player.preferredRole ?? roleFromLegacy(player);
  const roles = player.roles?.length ? player.roles : [primary];
  let penalty = 0;
  if (roles[0] === role) penalty = 0;
  else if (roles.includes(role)) penalty = 3;
  else if (roleToLine(primary) === roleToLine(role)) penalty = 8;
  else penalty = 15;

  const foot = flankFootBonus(player.preferredFoot, roleFlank(role));
  if (foot < 0) penalty += 4;
  else if (foot === 0 && roleFlank(role) !== "C") penalty += 1;

  return Math.max(40, Math.min(99, Math.round(player.overall - penalty)));
}

export type LineupContext = {
  stats?: Record<string, PlayerSeasonStats>;
  suspensions?: Record<string, number>;
  /** Extra players to exclude (already used / injured) */
  exclude?: Set<string>;
};

function disciplinePenalty(
  player: Player,
  ctx?: LineupContext
): number {
  const sus = ctx?.suspensions?.[player.id] ?? 0;
  if (sus > 0) return -10_000;
  const yellows = ctx?.stats?.[player.id]?.yellowCards ?? 0;
  // Near ban (every 5 yellows) — avoid starting
  if (yellows > 0 && yellows % 5 === 4) return -28;
  return -yellows * 1.5;
}

function pickForSlot(
  pool: Player[],
  role: RoleId,
  used: Set<string>,
  ctx?: LineupContext
): Player | undefined {
  const ranked = pool
    .filter((p) => !used.has(p.id) && !(ctx?.exclude?.has(p.id)))
    .filter((p) => (ctx?.suspensions?.[p.id] ?? 0) <= 0)
    .sort(
      (a, b) =>
        effectiveOverall(b, role) +
        roleFitBonus(b, role) * 0.15 +
        disciplinePenalty(b, ctx) -
        (effectiveOverall(a, role) + roleFitBonus(a, role) * 0.15 + disciplinePenalty(a, ctx))
    );
  return ranked[0];
}

export function autoSelectLineup(
  players: Player[],
  clubId: string,
  formation: FormationId,
  ctx?: LineupContext
): string[] {
  const squad = players.filter((p) => p.clubId === clubId);
  const slots = FORMATION_ROLES[formation];
  const used = new Set<string>();
  const ids: string[] = [];
  for (const role of slots) {
    const p = pickForSlot(squad, role, used, ctx);
    if (p) {
      used.add(p.id);
      ids.push(p.id);
    }
  }
  for (const p of [...squad]
    .filter((x) => (ctx?.suspensions?.[x.id] ?? 0) <= 0)
    .sort((a, b) => b.overall - a.overall + disciplinePenalty(b, ctx) - disciplinePenalty(a, ctx))) {
    if (ids.length >= 11) break;
    if (!used.has(p.id)) {
      used.add(p.id);
      ids.push(p.id);
    }
  }
  return ids.slice(0, 11);
}

export function defaultTactics(
  players: Player[],
  clubId: string,
  formation: FormationId = "4-3-3",
  ctx?: LineupContext
): TeamTactics {
  return {
    formation,
    lineup: autoSelectLineup(players, clubId, formation, ctx),
    attack: 55,
    defence: 55,
    aggression: 50,
  };
}

export type FormationSuggestion = {
  formation: FormationId;
  score: number;
  /** Human-readable tip why this shape fits the squad. */
  reason: string;
};

function countRoles(squad: Player[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of squad) {
    const role = p.preferredRole ?? (primaryPosition(p) === "GK" ? "GK" : primaryPosition(p) === "DF" ? "CB" : primaryPosition(p) === "FW" ? "ST" : "CM");
    counts[role] = (counts[role] ?? 0) + 1;
    const line = primaryPosition(p);
    counts[`line:${line}`] = (counts[`line:${line}`] ?? 0) + 1;
  }
  return counts;
}

function formationReason(formation: FormationId, counts: Record<string, number>): string {
  switch (formation) {
    case "4-3-3":
      return counts["LW"] || counts["RW"] || (counts["line:FW"] ?? 0) >= 4
        ? "Много крайних и форвардов — классика 4-3-3."
        : "Сбалансированная атака тремя вперед.";
    case "4-4-2":
      return (counts["ST"] ?? 0) + (counts["CF"] ?? 0) >= 3 || (counts["line:FW"] ?? 0) >= 4
        ? "Два нападающих закрыты составом — удобная 4-4-2."
        : "Классическая схема с двумя форвардами.";
    case "4-2-3-1":
      return (counts["CDM"] ?? 0) >= 2 || (counts["CAM"] ?? 0) >= 1
        ? "Есть опорники и плеймейкер — сильная 4-2-3-1."
        : "Контроль полузащиты и один наконечник.";
    case "3-5-2":
      return (counts["CB"] ?? 0) >= 4 || (counts["line:DF"] ?? 0) >= 8
        ? "Глубокая оборона и фланги — 3-5-2 подходит."
        : "Три центральных и насыщенная середина.";
    case "5-3-2":
      return (counts["CB"] ?? 0) >= 4 || (counts["LWB"] ?? 0) + (counts["RWB"] ?? 0) >= 2
        ? "Много защитников — плотная 5-3-2."
        : "Пять защитников и два форварда.";
    default:
      return "Общепринятая схема.";
  }
}

/** How well the current squad fills a formation (sum of effective overalls). */
export function scoreFormationFit(
  players: Player[],
  clubId: string,
  formation: FormationId,
  ctx?: LineupContext
): number {
  const lineup = autoSelectLineup(players, clubId, formation, ctx);
  const roles = FORMATION_ROLES[formation];
  let score = 0;
  for (let i = 0; i < roles.length; i++) {
    const p = players.find((x) => x.id === lineup[i]);
    if (!p) continue;
    const role = roles[i]!;
    score += effectiveOverall(p, role) + roleFitBonus(p, role) * 0.25;
  }
  // Prefer full XI
  score += lineup.length * 2;
  return Math.round(score * 10) / 10;
}

/**
 * Rank common formations for this squad — top suggestions for the manager UI.
 */
export function suggestFormations(
  players: Player[],
  clubId: string,
  ctx?: LineupContext,
  limit = 5
): FormationSuggestion[] {
  const squad = players.filter((p) => p.clubId === clubId);
  const counts = countRoles(squad);
  const ranked = FORMATIONS.map((formation) => ({
    formation,
    score: scoreFormationFit(players, clubId, formation, ctx),
    reason: formationReason(formation, counts),
  })).sort((a, b) => b.score - a.score || a.formation.localeCompare(b.formation));
  return ranked.slice(0, limit);
}

/** Best standard formation for an AI (or auto) club right now. */
export function bestFormationForClub(
  players: Player[],
  clubId: string,
  ctx?: LineupContext
): FormationId {
  return suggestFormations(players, clubId, ctx, 1)[0]?.formation ?? "4-3-3";
}

/** Build optimal tactics: best formation + auto XI. */
export function optimalTactics(
  players: Player[],
  clubId: string,
  ctx?: LineupContext
): TeamTactics {
  const formation = bestFormationForClub(players, clubId, ctx);
  return defaultTactics(players, clubId, formation, ctx);
}

export function validateLineup(tactics: TeamTactics): boolean {
  return tactics.lineup.length === 11 && new Set(tactics.lineup).size === 11;
}

/** How well a footed player suits a pitch flank. */
export function flankFootBonus(foot: PreferredFoot | undefined, side: "L" | "R" | "C"): number {
  const f = foot ?? "R";
  if (side === "C") return f === "B" ? 4 : 0;
  if (side === "L") {
    if (f === "L") return 12;
    if (f === "B") return 6;
    return -8;
  }
  if (f === "R") return 12;
  if (f === "B") return 6;
  return -8;
}

export function roleFlank(role: RoleId): "L" | "R" | "C" {
  if (["LB", "LWB", "LM", "LW"].includes(role)) return "L";
  if (["RB", "RWB", "RM", "RW"].includes(role)) return "R";
  return "C";
}

export type AutoSubSuggestion = { outId: string; inId: string; gain: number; role: RoleId };

/**
 * Best computer substitutions: replace low-performing / poorly fitted starters
 * with stronger bench options for their slots.
 */
export function suggestAutoSubstitutions(
  onField: string[],
  bench: string[],
  formation: FormationId,
  players: Player[],
  ratings: Record<string, number>,
  matchYellows: Record<string, number>,
  maxSubs: number,
  stamina?: Record<string, number>
): AutoSubSuggestion[] {
  if (maxSubs <= 0) return [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const roles = FORMATION_ROLES[formation];
  const usedBench = new Set<string>();
  const suggestions: AutoSubSuggestion[] = [];

  const scored = onField.map((id, idx) => {
    const p = byId.get(id);
    const role = roles[idx] ?? "CM";
    if (!p) return { id, idx, role, score: 99 };
    const eff = effectiveOverall(p, role);
    const rating = ratings[id] ?? 6.5;
    const yellow = matchYellows[id] ?? 0;
    const sta = stamina?.[id] ?? 100;
    // Lower = more urgent to replace (tired / poor form / cards)
    const urgency = rating * 8 + eff * 0.35 - yellow * 6 + sta * 0.08;
    return { id, idx, role, score: urgency, eff, rating, yellow, sta };
  });

  scored.sort((a, b) => a.score - b.score);

  for (const slot of scored) {
    if (suggestions.length >= maxSubs) break;
    const out = byId.get(slot.id);
    if (!out) continue;
    // Don't sub GK unless rating is terrible
    if (slot.role === "GK" && (slot.rating ?? 6.5) >= 5.8) continue;

    let best: AutoSubSuggestion | null = null;
    for (const bid of bench) {
      if (usedBench.has(bid)) continue;
      const bp = byId.get(bid);
      if (!bp) continue;
      // GK only for GK
      if (slot.role === "GK" && primaryPosition(bp) !== "GK") continue;
      if (slot.role !== "GK" && primaryPosition(bp) === "GK") continue;
      const inEff = effectiveOverall(bp, slot.role);
      const outEff = slot.eff ?? effectiveOverall(out, slot.role);
      const ratingGap = 6.8 - (slot.rating ?? 6.5);
      const tiredBonus = Math.max(0, 55 - (slot.sta ?? 100)) * 0.12;
      const gain = inEff - outEff + ratingGap * 4 + (slot.yellow ?? 0) * 3 + tiredBonus;
      if (gain < 2.5) continue;
      if (!best || gain > best.gain) {
        best = { outId: slot.id, inId: bid, gain, role: slot.role };
      }
    }
    if (best) {
      usedBench.add(best.inId);
      suggestions.push(best);
    }
  }

  return suggestions.sort((a, b) => b.gain - a.gain).slice(0, maxSubs);
}
