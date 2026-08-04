import { primaryPosition } from "./labels";
import type { MatchEvent, MatchResult, Player, PlayerSeasonStats } from "./types";

export function emptyPlayerStats(playerId: string, clubId: string): PlayerSeasonStats {
  return {
    playerId,
    clubId,
    appearances: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    minutes: 0,
    ratingSum: 0,
    ratingCount: 0,
    saves: 0,
    cleanSheets: 0,
    goalsConceded: 0,
  };
}

/** Fill missing GK / card fields on older saves. */
export function normalizePlayerStats(raw: Partial<PlayerSeasonStats> & Pick<PlayerSeasonStats, "playerId" | "clubId">): PlayerSeasonStats {
  const base = emptyPlayerStats(raw.playerId, raw.clubId);
  return {
    ...base,
    ...raw,
    saves: raw.saves ?? 0,
    cleanSheets: raw.cleanSheets ?? 0,
    goalsConceded: raw.goalsConceded ?? 0,
    yellowCards: raw.yellowCards ?? 0,
    redCards: raw.redCards ?? 0,
  };
}

export function averageRating(s: PlayerSeasonStats): number {
  if (s.ratingCount === 0) return 0;
  return Math.round((s.ratingSum / s.ratingCount) * 10) / 10;
}

function findStartingGk(lineup: string[], players: Player[]): string | undefined {
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const id of lineup) {
    const p = byId.get(id);
    if (p && primaryPosition(p) === "GK") return id;
  }
  return lineup[0];
}

/** Apply final ratings + event tallies into season stats. */
export function applyMatchToSeasonStats(
  stats: Record<string, PlayerSeasonStats>,
  result: MatchResult,
  homeClubId: string,
  awayClubId: string,
  homeLineup: string[],
  awayLineup: string[],
  ratings: Record<string, number>,
  players: Player[] = []
): void {
  const touch = (playerId: string, clubId: string) => {
    if (!stats[playerId]) stats[playerId] = emptyPlayerStats(playerId, clubId);
    else stats[playerId] = normalizePlayerStats(stats[playerId]);
    return stats[playerId];
  };

  for (const id of homeLineup) {
    const s = touch(id, homeClubId);
    s.appearances += 1;
    s.minutes += 90;
    const r = ratings[id] ?? 6.5;
    s.ratingSum += r;
    s.ratingCount += 1;
  }
  for (const id of awayLineup) {
    const s = touch(id, awayClubId);
    s.appearances += 1;
    s.minutes += 90;
    const r = ratings[id] ?? 6.5;
    s.ratingSum += r;
    s.ratingCount += 1;
  }

  // Also count players who only appeared via sub events
  for (const e of result.events) {
    if (e.type === "sub_on" && e.playerId) {
      const clubId = e.clubId ?? "";
      const s = touch(e.playerId, clubId);
      if (!homeLineup.includes(e.playerId) && !awayLineup.includes(e.playerId)) {
        // came on as sub — minutes approximated later; ensure appearance
        if (s.appearances === 0) {
          s.appearances = 1;
          s.minutes += Math.max(1, 90 - e.minute);
          const r = ratings[e.playerId] ?? 6.3;
          s.ratingSum += r;
          s.ratingCount += 1;
        }
      }
    }
    if (e.type === "goal" && e.playerId) {
      touch(e.playerId, e.clubId ?? "").goals += 1;
    }
    if (e.type === "assist" && e.playerId) {
      touch(e.playerId, e.clubId ?? "").assists += 1;
    }
    if (e.type === "card" && e.playerId) {
      const s = touch(e.playerId, e.clubId ?? "");
      if (e.detail === "red") s.redCards += 1;
      else s.yellowCards += 1;
    }
    if (e.type === "save" && e.playerId) {
      touch(e.playerId, e.clubId ?? "").saves += 1;
    }
  }

  if (players.length) {
    const homeGk = findStartingGk(homeLineup, players);
    const awayGk = findStartingGk(awayLineup, players);
    if (homeGk) {
      const s = touch(homeGk, homeClubId);
      s.goalsConceded += result.awayGoals;
      if (result.awayGoals === 0) s.cleanSheets += 1;
    }
    if (awayGk) {
      const s = touch(awayGk, awayClubId);
      s.goalsConceded += result.homeGoals;
      if (result.homeGoals === 0) s.cleanSheets += 1;
    }
  }
}

function inLeague(stats: Record<string, PlayerSeasonStats>, clubIds: string[]): PlayerSeasonStats[] {
  const set = new Set(clubIds);
  return Object.values(stats ?? {})
    .filter((s) => set.has(s.clubId))
    .map(normalizePlayerStats);
}

export function leagueTopScorers(
  stats: Record<string, PlayerSeasonStats>,
  clubIds: string[],
  limit = 10
): PlayerSeasonStats[] {
  return inLeague(stats, clubIds)
    .filter((s) => s.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
    .slice(0, limit);
}

export function leagueTopAssists(
  stats: Record<string, PlayerSeasonStats>,
  clubIds: string[],
  limit = 10
): PlayerSeasonStats[] {
  return inLeague(stats, clubIds)
    .filter((s) => s.assists > 0)
    .sort((a, b) => b.assists - a.assists || b.goals - a.goals)
    .slice(0, limit);
}

/** Goals + assists combined leaderboard. */
export function leagueTopGoalInvolvements(
  stats: Record<string, PlayerSeasonStats>,
  clubIds: string[],
  limit = 10
): PlayerSeasonStats[] {
  return inLeague(stats, clubIds)
    .filter((s) => s.goals + s.assists > 0)
    .sort(
      (a, b) =>
        b.goals + b.assists - (a.goals + a.assists) || b.goals - a.goals || b.assists - a.assists
    )
    .slice(0, limit);
}

export function leagueTopRatings(
  stats: Record<string, PlayerSeasonStats>,
  clubIds: string[],
  limit = 10
): PlayerSeasonStats[] {
  return inLeague(stats, clubIds)
    .filter((s) => s.appearances >= 1)
    .sort((a, b) => averageRating(b) - averageRating(a) || b.appearances - a.appearances)
    .slice(0, limit);
}

/** Discipline: yellows first, then reds. */
export function leagueTopCards(
  stats: Record<string, PlayerSeasonStats>,
  clubIds: string[],
  limit = 10
): PlayerSeasonStats[] {
  return inLeague(stats, clubIds)
    .filter((s) => s.yellowCards + s.redCards > 0)
    .sort(
      (a, b) =>
        b.yellowCards + b.redCards * 3 - (a.yellowCards + a.redCards * 3) ||
        b.redCards - a.redCards ||
        b.yellowCards - a.yellowCards
    )
    .slice(0, limit);
}

/** Keepers by clean sheets, then saves, then fewest goals conceded. */
export function leagueTopKeepers(
  stats: Record<string, PlayerSeasonStats>,
  clubIds: string[],
  players: Player[],
  limit = 10
): PlayerSeasonStats[] {
  const gkIds = new Set(
    players.filter((p) => primaryPosition(p) === "GK").map((p) => p.id)
  );
  return inLeague(stats, clubIds)
    .filter((s) => gkIds.has(s.playerId) && s.appearances >= 1)
    .sort(
      (a, b) =>
        b.cleanSheets - a.cleanSheets ||
        b.saves - a.saves ||
        a.goalsConceded - b.goalsConceded ||
        averageRating(b) - averageRating(a)
    )
    .slice(0, limit);
}

export function deriveAssistsFromEvents(events: MatchEvent[]): MatchEvent[] {
  // already produced by live engine; helper kept for typing
  return events;
}
