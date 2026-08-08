import { primaryPosition, ROLE_LABEL, roleToLine } from "./labels";
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
    { x: 50, y: 4 },
    { x: 12, y: 28 }, { x: 36, y: 24 }, { x: 64, y: 24 }, { x: 88, y: 28 },
    { x: 12, y: 56 }, { x: 36, y: 52 }, { x: 64, y: 52 }, { x: 88, y: 56 },
    { x: 34, y: 86 }, { x: 66, y: 86 },
  ],
  "4-3-3": [
    { x: 50, y: 4 },
    { x: 12, y: 28 }, { x: 36, y: 24 }, { x: 64, y: 24 }, { x: 88, y: 28 },
    { x: 24, y: 56 }, { x: 50, y: 52 }, { x: 76, y: 56 },
    { x: 14, y: 84 }, { x: 50, y: 88 }, { x: 86, y: 84 },
  ],
  "3-5-2": [
    { x: 50, y: 4 },
    { x: 24, y: 28 }, { x: 50, y: 24 }, { x: 76, y: 28 },
    { x: 8, y: 54 }, { x: 28, y: 60 }, { x: 50, y: 50 }, { x: 72, y: 60 }, { x: 92, y: 54 },
    { x: 34, y: 86 }, { x: 66, y: 86 },
  ],
  "4-2-3-1": [
    { x: 50, y: 4 },
    { x: 12, y: 26 }, { x: 36, y: 22 }, { x: 64, y: 22 }, { x: 88, y: 26 },
    { x: 34, y: 46 }, { x: 66, y: 46 },
    { x: 14, y: 66 }, { x: 50, y: 64 }, { x: 86, y: 66 },
    { x: 50, y: 88 },
  ],
  "5-3-2": [
    { x: 50, y: 4 },
    { x: 8, y: 30 }, { x: 28, y: 24 }, { x: 50, y: 22 }, { x: 72, y: 24 }, { x: 92, y: 30 },
    { x: 24, y: 56 }, { x: 50, y: 52 }, { x: 76, y: 56 },
    { x: 34, y: 86 }, { x: 66, y: 86 },
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

/** Contribution of a player in a formation slot (role fit + foot + OVR + cards). */
export function slotContribution(player: Player, role: RoleId, ctx?: LineupContext): number {
  return (
    effectiveOverall(player, role) +
    roleFitBonus(player, role) * 0.25 +
    disciplinePenalty(player, ctx)
  );
}

export function lineupContributionScore(
  lineup: string[],
  formation: FormationId,
  players: Player[],
  ctx?: LineupContext
): number {
  const roles = FORMATION_ROLES[formation];
  const byId = new Map(players.map((p) => [p.id, p]));
  let score = 0;
  for (let i = 0; i < roles.length; i++) {
    const p = byId.get(lineup[i] ?? "");
    if (!p) continue;
    score += slotContribution(p, roles[i]!, ctx);
  }
  return score;
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
    .sort((a, b) => slotContribution(b, role, ctx) - slotContribution(a, role, ctx));
  return ranked[0];
}

/** Greedy XI, then local swaps so bench cannot systematically outrate starters. */
function improveLineup(
  ids: string[],
  squad: Player[],
  formation: FormationId,
  ctx?: LineupContext
): string[] {
  const roles = FORMATION_ROLES[formation];
  const byId = new Map(squad.map((p) => [p.id, p]));
  const lineup = ids.slice(0, 11);
  while (lineup.length < 11) {
    const filler = squad.find(
      (p) =>
        !lineup.includes(p.id) &&
        !(ctx?.exclude?.has(p.id)) &&
        (ctx?.suspensions?.[p.id] ?? 0) <= 0
    );
    if (!filler) break;
    lineup.push(filler.id);
  }

  let improved = true;
  let guard = 0;
  while (improved && guard++ < 80) {
    improved = false;
    const used = new Set(lineup);
    const bench = squad.filter(
      (p) =>
        !used.has(p.id) &&
        !(ctx?.exclude?.has(p.id)) &&
        (ctx?.suspensions?.[p.id] ?? 0) <= 0
    );

    // Starter ↔ bench
    for (let i = 0; i < lineup.length; i++) {
      const role = roles[i]!;
      const out = byId.get(lineup[i]!);
      if (!out) continue;
      const outScore = slotContribution(out, role, ctx);
      for (const bp of bench) {
        if (role === "GK" && primaryPosition(bp) !== "GK") continue;
        if (role !== "GK" && primaryPosition(bp) === "GK") continue;
        const inScore = slotContribution(bp, role, ctx);
        if (inScore <= outScore + 0.4) continue;
        const bi = bench.indexOf(bp);
        lineup[i] = bp.id;
        if (bi >= 0) bench[bi] = out;
        improved = true;
        break;
      }
      if (improved) break;
    }
    if (improved) continue;

    // Swap two starters across slots when both fit better
    for (let i = 0; i < lineup.length; i++) {
      for (let j = i + 1; j < lineup.length; j++) {
        const a = byId.get(lineup[i]!);
        const b = byId.get(lineup[j]!);
        if (!a || !b) continue;
        const ri = roles[i]!;
        const rj = roles[j]!;
        if (ri === "GK" || rj === "GK") continue;
        const before =
          slotContribution(a, ri, ctx) + slotContribution(b, rj, ctx);
        const after =
          slotContribution(b, ri, ctx) + slotContribution(a, rj, ctx);
        if (after <= before + 0.4) continue;
        const tmp = lineup[i]!;
        lineup[i] = lineup[j]!;
        lineup[j] = tmp;
        improved = true;
        break;
      }
      if (improved) break;
    }
  }
  return lineup.slice(0, 11);
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
    .filter((x) => !(ctx?.exclude?.has(x.id)))
    .sort((a, b) => b.overall - a.overall + disciplinePenalty(b, ctx) - disciplinePenalty(a, ctx))) {
    if (ids.length >= 11) break;
    if (!used.has(p.id)) {
      used.add(p.id);
      ids.push(p.id);
    }
  }
  return improveLineup(ids, squad, formation, ctx);
}

export type LineupStrengthHint = {
  /** Short Russian tip for the manager UI. */
  message: string;
  outId?: string;
  inId?: string;
  role?: RoleId;
  gain?: number;
};

/**
 * Hints to strengthen XI using the same contribution rules as autoSelectLineup.
 */
export function analyzeLineupStrength(
  players: Player[],
  clubId: string,
  tactics: TeamTactics,
  ctx?: LineupContext
): LineupStrengthHint[] {
  const formation = tactics.formation ?? "4-3-3";
  const roles = FORMATION_ROLES[formation];
  const squad = players.filter((p) => p.clubId === clubId);
  const byId = new Map(squad.map((p) => [p.id, p]));
  const current = (tactics.lineup ?? []).slice(0, 11);
  const optimal = autoSelectLineup(players, clubId, formation, ctx);
  const hints: LineupStrengthHint[] = [
    {
      message:
        "Сила слота = OVR с штрафом за чужую роль и «не ту» ногу на фланге, плюс бонус за родную роль. Карточки у порога бана снижают приоритет.",
    },
  ];

  const currentScore = lineupContributionScore(current, formation, players, ctx);
  const optimalScore = lineupContributionScore(optimal, formation, players, ctx);
  if (optimalScore > currentScore + 1.5) {
    hints.push({
      message: `Автооснова сильнее текущей примерно на ${Math.round(optimalScore - currentScore)} усл. ед. Можно применить автоподбор.`,
    });
  } else {
    hints.push({
      message: "Текущая основа близка к оптимальной по правилам силы слотов.",
    });
  }

  const used = new Set(current);
  const bench = squad.filter(
    (p) =>
      !used.has(p.id) &&
      !(ctx?.exclude?.has(p.id)) &&
      (ctx?.suspensions?.[p.id] ?? 0) <= 0
  );

  const swaps: LineupStrengthHint[] = [];
  for (let i = 0; i < Math.min(current.length, roles.length); i++) {
    const role = roles[i]!;
    const out = byId.get(current[i]!);
    if (!out) continue;
    const outScore = slotContribution(out, role, ctx);
    const eff = effectiveOverall(out, role);
    if (eff < out.overall - 2) {
      hints.push({
        message: `${out.lastName} на ${ROLE_LABEL[role]}: сила ${eff} при OVR ${out.overall} (не родная роль/нога).`,
        outId: out.id,
        role,
      });
    }
    let best: { p: Player; gain: number } | null = null;
    for (const bp of bench) {
      if (role === "GK" && primaryPosition(bp) !== "GK") continue;
      if (role !== "GK" && primaryPosition(bp) === "GK") continue;
      const gain = slotContribution(bp, role, ctx) - outScore;
      if (gain < 2) continue;
      if (!best || gain > best.gain) best = { p: bp, gain };
    }
    if (best) {
      swaps.push({
        message: `Замените ${out.lastName} → ${best.p.lastName} (${ROLE_LABEL[role]}, +${best.gain.toFixed(0)} к слоту).`,
        outId: out.id,
        inId: best.p.id,
        role,
        gain: best.gain,
      });
    }
  }

  swaps.sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0));
  hints.push(...swaps.slice(0, 5));
  if (swaps.length === 0 && optimalScore <= currentScore + 1.5) {
    hints.push({ message: "Явных усиливающих замен со скамейки нет." });
  }
  return hints;
}

/** Rebuild XI with the same logic as auto-lineup (for «применить подсказки»). */
export function applyOptimalLineup(
  players: Player[],
  clubId: string,
  tactics: TeamTactics,
  ctx?: LineupContext
): TeamTactics {
  const formation = tactics.formation ?? "4-3-3";
  return {
    ...tactics,
    formation,
    lineup: autoSelectLineup(players, clubId, formation, ctx),
  };
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
  const score = lineupContributionScore(lineup, formation, players, ctx);
  // Prefer full XI
  return Math.round((score + lineup.length * 2) * 10) / 10;
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
