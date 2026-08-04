import { playerDisplayName } from "./labels";
import { emptySideStats, resolveMatchStats, resolveSideStats } from "./liveMatch";
import { buildMatchReactions, reactionSeedFromResult } from "./matchReactions";
import type { MatchResult, MatchSummary, MatchSummaryPlayerLine, Player } from "./types";

type Acc = { clubId: string; count: number; detail?: string; minutes: number[] };

function toLines(map: Map<string, Acc>, players: Player[]): MatchSummaryPlayerLine[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return [...map.entries()]
    .map(([playerId, v]) => {
      const p = byId.get(playerId);
      return {
        playerId,
        name: p ? playerDisplayName(p) : playerId,
        clubId: v.clubId,
        count: v.count,
        detail: v.detail,
        minutes: [...v.minutes].sort((a, b) => a - b),
      };
    })
    .sort((a, b) => (a.minutes?.[0] ?? 99) - (b.minutes?.[0] ?? 99));
}

function bump(
  map: Map<string, Acc>,
  playerId: string,
  clubId: string,
  minute: number,
  detail?: string
): void {
  const prev = map.get(playerId);
  if (prev) {
    prev.count += 1;
    prev.minutes.push(minute);
    if (detail) prev.detail = detail;
  } else {
    map.set(playerId, { clubId, count: 1, detail, minutes: [minute] });
  }
}

export function summarizeMatch(
  result: MatchResult,
  players: Player[],
  homeClubId?: string,
  awayClubId?: string
): MatchSummary {
  const scorers = new Map<string, Acc>();
  const yellow = new Map<string, Acc>();
  const red = new Map<string, Acc>();

  for (const e of result.events) {
    if (!e.playerId) continue;
    if (e.type === "goal") {
      bump(scorers, e.playerId, e.clubId ?? "", e.minute, e.detail);
    } else if (e.type === "card") {
      const target = e.detail === "red" ? red : yellow;
      bump(target, e.playerId, e.clubId ?? "", e.minute, e.detail);
    }
  }

  let motm: MatchSummaryPlayerLine | null = null;
  if (result.ratings) {
    const homeLine = result.homeLineup ?? [];
    const awayLine = result.awayLineup ?? [];
    const onPitch = new Set([...homeLine, ...awayLine]);
    const entries = Object.entries(result.ratings)
      .filter(([id]) => onPitch.size === 0 || onPitch.has(id))
      .sort((a, b) => b[1] - a[1]);
    if (entries.length) {
      const [playerId, rating] = entries[0];
      const p = players.find((x) => x.id === playerId);
      if (p) {
        const fromLineup = homeLine.includes(playerId)
          ? homeClubId
          : awayLine.includes(playerId)
            ? awayClubId
            : undefined;
        motm = {
          playerId,
          name: playerDisplayName(p),
          clubId: fromLineup || p.clubId || "",
          rating,
        };
      }
    }
  }

  const homeId = homeClubId ?? "";
  const awayId = awayClubId ?? "";
  let homeStats = result.homeStats ?? emptySideStats();
  let awayStats = result.awayStats ?? emptySideStats();
  if (homeId && awayId) {
    const resolved = resolveMatchStats({
      homeClubId: homeId,
      awayClubId: awayId,
      events: result.events,
      homeStats: result.homeStats,
      awayStats: result.awayStats,
      homeShots: result.homeShots,
      awayShots: result.awayShots,
    });
    homeStats = resolved.home;
    awayStats = resolved.away;
  } else if (homeId) {
    homeStats = resolveSideStats(result.events, homeId, result.homeStats, result.homeShots);
  }

  return {
    homeGoals: result.homeGoals,
    awayGoals: result.awayGoals,
    homeShots: result.homeShots,
    awayShots: result.awayShots,
    scorers: toLines(scorers, players),
    yellowCards: toLines(yellow, players),
    redCards: toLines(red, players),
    motm,
    fouls: result.events.filter((e) => e.type === "foul").length,
    penalties: result.events.filter((e) => e.type === "penalty").length,
    corners: result.events.filter((e) => e.type === "corner").length,
    homeStats,
    awayStats,
    reactions:
      homeId && awayId
        ? buildMatchReactions(
            result,
            players,
            homeId,
            awayId,
            homeStats,
            awayStats,
            reactionSeedFromResult(result, homeId, awayId)
          )
        : [],
  };
}
