import { POSITION_LABEL, primaryPosition, preferredRoleLabel } from "./labels";
import type { Player, Position, TeamTactics } from "./types";

export interface SquadNeed {
  position: Position;
  label: string;
  depth: number;
  bestOverall: number;
  severity: "low" | "medium" | "high";
  tip: string;
}

const TARGET_DEPTH: Record<Position, number> = {
  GK: 2,
  DF: 6,
  MF: 6,
  FW: 4,
};

interface LineSnapshot {
  position: Position;
  depth: number;
  bestOverall: number;
  secondOverall: number;
  avgTop: number;
  target: number;
  score: number; // lower = weaker / more urgent
  leader?: Player;
}

function formationPositionBias(formation?: string): Partial<Record<Position, number>> {
  if (!formation) return {};
  if (formation.startsWith("5")) return { DF: 1, MF: -1 };
  if (formation.startsWith("3")) return { DF: -1, FW: 1 };
  if (formation.includes("2") && formation.endsWith("1")) return { FW: 1 };
  return {};
}

function lineSnapshots(
  players: Player[],
  clubId: string,
  tactics?: TeamTactics | null
): LineSnapshot[] {
  const squad = players.filter((p) => p.clubId === clubId);
  const byPos: Record<Position, Player[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of squad) byPos[primaryPosition(p)].push(p);

  const formationBias = formationPositionBias(tactics?.formation);
  const snaps: LineSnapshot[] = [];

  for (const pos of ["GK", "DF", "MF", "FW"] as Position[]) {
    const group = [...byPos[pos]].sort((a, b) => b.overall - a.overall);
    const depth = group.length;
    const bestOverall = group[0]?.overall ?? 0;
    const secondOverall = group[1]?.overall ?? 0;
    const target = Math.max(1, TARGET_DEPTH[pos] + (formationBias[pos] ?? 0));
    const topN = Math.min(3, group.length);
    const avgTop =
      topN === 0
        ? 0
        : group.slice(0, topN).reduce((s, p) => s + p.overall, 0) / topN;

    // Relative weakness score — used to always surface the softest lines
    let score = avgTop || bestOverall;
    if (depth < target) score -= (target - depth) * 4;
    if (depth < Math.max(1, target - 1)) score -= 8;
    if (pos === "GK" && depth < 2) score -= 12;
    if (bestOverall > 0 && bestOverall - secondOverall >= 10) score -= 3;
    if (depth === 0) score = 0;

    snaps.push({
      position: pos,
      depth,
      bestOverall,
      secondOverall,
      avgTop,
      target,
      score,
      leader: group[0],
    });
  }

  return snaps;
}

function tipForLine(s: LineSnapshot): { severity: SquadNeed["severity"]; tip: string } {
  const label = POSITION_LABEL[s.position];

  if (s.depth === 0) {
    return {
      severity: "high",
      tip: `На позиции ${label} никого нет — срочно нужен игрок.`,
    };
  }
  if (s.depth < s.target - 1 || (s.position === "GK" && s.depth < 2)) {
    return {
      severity: "high",
      tip: `Мало игроков на позиции ${label} (${s.depth}/${s.target}). Стоит усилить линию.`,
    };
  }
  if (s.bestOverall > 0 && s.bestOverall < 70) {
    return {
      severity: "high",
      tip: `Лидер линии ${label} слабый (OVR ${s.bestOverall}). Нужен качественный трансфер.`,
    };
  }
  if (s.depth >= 2 && s.bestOverall - s.secondOverall >= 10) {
    const role = s.leader ? preferredRoleLabel(s.leader) : label;
    return {
      severity: "medium",
      tip: `Нет достойной замены ${role} (разрыв ${s.bestOverall - s.secondOverall}).`,
    };
  }
  if (s.avgTop < 72) {
    return {
      severity: "medium",
      tip: `Средний уровень ${label} невысокий (~${Math.round(s.avgTop)}). Можно точечно усилить.`,
    };
  }
  if (s.depth < s.target) {
    return {
      severity: "low",
      tip: `Глубина ${label} на грани (${s.depth}/${s.target}).`,
    };
  }
  return {
    severity: "low",
    tip: `${label}: относительно слабее других линий (лучше ~${Math.round(s.avgTop)}, глубина ${s.depth}).`,
  };
}

/**
 * Which lines look thin or weak for the club — for transfer tips.
 * Always returns at least the 1–2 softest lines so the UI is never empty.
 */
export function analyzeSquadNeeds(
  players: Player[],
  clubId: string,
  tactics?: TeamTactics | null
): SquadNeed[] {
  const snaps = lineSnapshots(players, clubId, tactics);
  const flagged: SquadNeed[] = [];

  for (const s of snaps) {
    const hard =
      s.depth === 0 ||
      s.depth < s.target - 1 ||
      (s.position === "GK" && s.depth < 2) ||
      (s.bestOverall > 0 && s.bestOverall < 70) ||
      (s.depth >= 2 && s.bestOverall - s.secondOverall >= 10) ||
      s.avgTop < 72 ||
      s.depth < s.target;

    if (!hard) continue;
    const { severity, tip } = tipForLine(s);
    flagged.push({
      position: s.position,
      label: POSITION_LABEL[s.position],
      depth: s.depth,
      bestOverall: s.bestOverall,
      severity,
      tip,
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  if (flagged.length > 0) {
    return flagged.sort(
      (a, b) => order[a.severity] - order[b.severity] || a.bestOverall - b.bestOverall
    );
  }

  // Balanced squad: still suggest the relatively weakest line(s)
  const weakest = [...snaps].sort((a, b) => a.score - b.score).slice(0, 2);
  return weakest.map((s) => {
    const { severity, tip } = tipForLine(s);
    return {
      position: s.position,
      label: POSITION_LABEL[s.position],
      depth: s.depth,
      bestOverall: s.bestOverall,
      severity,
      tip,
    };
  });
}

export function topSquadNeedPositions(needs: SquadNeed[], limit = 2): Position[] {
  return needs
    .filter((n) => n.severity === "high" || n.severity === "medium")
    .slice(0, limit)
    .map((n) => n.position);
}

/** Short line for career dashboard near Transfers. */
export function squadNeedsSummary(needs: SquadNeed[]): string {
  if (!needs.length) return "Состав выглядит сбалансированным.";
  const top = needs.slice(0, 2);
  const labels = top.map((n) => n.label).join(", ");
  if (top[0]?.severity === "high") return `Приоритет усиления: ${labels}.`;
  return `Можно усилить: ${labels}.`;
}
