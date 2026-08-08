import { computeOverall, primaryPosition } from "./labels";
import { recomputeMarketValue } from "./players";
import { buildSeasonEndQuotes, type SeasonEndQuote } from "./seasonQuotes";
import { averageRating, leagueTopScorers, leagueTopAssists, leagueTopRatings } from "./stats";
import type {
  CareerSave,
  NewsItem,
  Player,
  PlayerSeasonStats,
  WorldPack,
} from "./types";

export type { SeasonEndQuote };

function clampAttr(v: number): number {
  return Math.max(25, Math.min(95, Math.round(v)));
}

function bumpKeyAttrs(player: Player, delta: number): void {
  const pos = primaryPosition(player);
  const keys =
    pos === "GK"
      ? (["goalkeeping", "physical", "passing"] as const)
      : pos === "DF"
        ? (["defending", "physical", "passing"] as const)
        : pos === "MF"
          ? (["passing", "dribbling", "pace"] as const)
          : (["shooting", "pace", "dribbling"] as const);
  for (const k of keys) {
    player.attributes[k] = clampAttr(player.attributes[k] + delta);
  }
}

function syncOverall(player: Player): void {
  const next = computeOverall(primaryPosition(player), player.attributes);
  const capped = Math.min(player.potential, Math.max(40, next));
  // Reasonable per-update clamp vs previous overall
  player.overall = Math.max(player.overall - 1, Math.min(player.overall + 1, capped));
}

/**
 * Tiny form-driven development after a match (reasonable bounds).
 * High rating → chance to grow; poor rating → chance to dip.
 * Loaned players who actually play grow faster than sitting on a parent bench.
 */
export function applyMatchDevelopment(
  players: Player[],
  ratings: Record<string, number>,
  playerIds: string[],
  stats: Record<string, PlayerSeasonStats>,
  chance: (p: number) => boolean = (p) => Math.random() < p
): void {
  for (const id of playerIds) {
    const p = players.find((x) => x.id === id);
    if (!p) continue;
    const r = ratings[id];
    if (r == null) continue;
    const season = stats[id];
    const apps = season?.appearances ?? 0;
    const onLoan = Boolean(p.loan);

    // Loan minutes: higher growth chance (incentive to send youngsters out)
    const growChance = onLoan ? (r >= 7.5 ? 0.32 : r >= 6.8 ? 0.24 : 0.12) : 0.18;
    if (r >= (onLoan ? 6.8 : 8.0) && apps >= 1 && chance(growChance)) {
      if (p.overall < p.potential) {
        bumpKeyAttrs(p, 1);
        syncOverall(p);
      }
    } else if (r <= 5.4 && chance(onLoan ? 0.1 : 0.14)) {
      const floor = Math.max(45, p.potential - 22);
      if (p.overall > floor) {
        bumpKeyAttrs(p, -1);
        syncOverall(p);
        if (p.overall < floor) p.overall = floor;
      }
    }
    p.marketValue = recomputeMarketValue(p, season ?? null);
  }
}

/**
 * End-of-season development from championship form (larger, still capped).
 */
export function applySeasonDevelopment(save: CareerSave): void {
  for (const p of save.players) {
    const st = save.playerStats[p.id];
    const onLoan = Boolean(p.loan);

    // Youngsters stuck on the parent bench rust slightly vs peers who went on loan
    if (
      !onLoan &&
      p.clubId === save.clubId &&
      p.age <= 23 &&
      (!st || st.appearances < 4) &&
      p.overall < p.potential
    ) {
      if (Math.random() < 0.35) {
        bumpKeyAttrs(p, -1);
        syncOverall(p);
        p.marketValue = recomputeMarketValue(p, st ?? null);
      }
      continue;
    }

    if (!st || st.appearances < 6) continue;
    const avg = averageRating(st);
    let delta = 0;
    if (avg >= 7.6) delta = 2;
    else if (avg >= 7.1) delta = 1;
    else if (avg <= 5.8) delta = -2;
    else if (avg <= 6.2) delta = -1;

    if (primaryPosition(p) !== "GK" && st.goals + st.assists >= 12) delta += 1;
    if (primaryPosition(p) === "GK" && (st.cleanSheets ?? 0) >= 8) delta += 1;

    // Loan with regular starts: extra step toward potential
    if (onLoan && st.appearances >= 10 && avg >= 6.6) delta += 1;

    delta = Math.max(-3, Math.min(3, delta));
    if (delta === 0) continue;

    bumpKeyAttrs(p, delta > 0 ? 1 : -1);
    if (Math.abs(delta) >= 2) bumpKeyAttrs(p, delta > 0 ? 1 : -1);

    const recomputed = computeOverall(primaryPosition(p), p.attributes);
    const target = Math.min(p.potential, Math.max(45, recomputed));
    const next = Math.max(p.overall - 3, Math.min(p.overall + 3, target));
    p.overall = next;
    p.marketValue = recomputeMarketValue(p, st);
  }
}

export interface SeasonAwards {
  season: string;
  leagueId: string;
  leagueName: string;
  place: number;
  played: number;
  points: number;
  gd: number;
  championClubId: string;
  championName: string;
  userClubId: string;
  userClubName: string;
  topScorerName?: string;
  topScorerId?: string;
  topScorerGoals?: number;
  topAssistName?: string;
  topAssistId?: string;
  topAssistCount?: number;
  topRatingName?: string;
  topRatingId?: string;
  topRatingValue?: number;
  headline: string;
  body: string;
  /** Club hierarchy reactions — unique lines per role. */
  quotes: SeasonEndQuote[];
}

export function userLeagueId(pack: WorldPack, clubId: string): string | undefined {
  return pack.leagues.find((l) => l.clubIds.includes(clubId))?.id;
}

export function isUserLeagueComplete(pack: WorldPack, save: CareerSave): boolean {
  const leagueId = userLeagueId(pack, save.clubId);
  if (!leagueId) return false;
  const fixtures = save.fixtures.filter((f) => f.tournamentId === leagueId);
  if (!fixtures.length) return false;
  return fixtures.every((f) => !!f.result);
}

export function buildSeasonAwards(pack: WorldPack, save: CareerSave): SeasonAwards | null {
  const league = pack.leagues.find((l) => l.clubIds.includes(save.clubId));
  if (!league) return null;
  const table = save.table[league.id] ?? [];
  if (!table.length) return null;

  const sorted = [...table].sort(
    (a, b) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf
  );
  const place = sorted.findIndex((r) => r.clubId === save.clubId) + 1;
  if (place <= 0) return null;

  const userRow = sorted[place - 1]!;
  const champ = sorted[0]!;
  const userClub = pack.clubs.find((c) => c.id === save.clubId);
  const champClub = pack.clubs.find((c) => c.id === champ.clubId);

  const scorers = leagueTopScorers(save.playerStats, league.clubIds, 1);
  const assists = leagueTopAssists(save.playerStats, league.clubIds, 1);
  const ratings = leagueTopRatings(save.playerStats, league.clubIds, 1);

  const scorerP = scorers[0] && save.players.find((p) => p.id === scorers[0].playerId);
  const assistP = assists[0] && save.players.find((p) => p.id === assists[0].playerId);
  const ratingP = ratings[0] && save.players.find((p) => p.id === ratings[0].playerId);

  const placeWord = place === 1 ? "чемпионский титул" : `${place}-е место`;
  const headline =
    place === 1
      ? `«${userClub?.shortName ?? "Клуб"}» — чемпион сезона ${save.season}!`
      : `Сезон ${save.season}: ${place}-е место`;

  const bodyParts = [
    `«${userClub?.name ?? save.clubId}» завершили чемпионат на ${placeWord}.`,
    `Очки: ${userRow.points}, разница мячей ${userRow.gf - userRow.ga > 0 ? "+" : ""}${userRow.gf - userRow.ga} (${userRow.gf}:${userRow.ga}).`,
  ];
  if (place > 1 && champClub) {
    bodyParts.push(`Чемпион: «${champClub.name}» (${champ.points} очков).`);
  }
  if (scorerP && scorers[0]) {
    bodyParts.push(`Лучший бомбардир лиги: ${scorerP.firstName} ${scorerP.lastName} — ${scorers[0].goals}.`);
  }

  return {
    season: save.season,
    leagueId: league.id,
    leagueName: league.name,
    place,
    played: userRow.played,
    points: userRow.points,
    gd: userRow.gf - userRow.ga,
    championClubId: champ.clubId,
    championName: champClub?.name ?? champ.clubId,
    userClubId: save.clubId,
    userClubName: userClub?.name ?? save.clubId,
    topScorerName: scorerP ? `${scorerP.firstName} ${scorerP.lastName}` : undefined,
    topScorerId: scorerP?.id,
    topScorerGoals: scorers[0]?.goals,
    topAssistName: assistP ? `${assistP.firstName} ${assistP.lastName}` : undefined,
    topAssistId: assistP?.id,
    topAssistCount: assists[0]?.assists,
    topRatingName: ratingP ? `${ratingP.firstName} ${ratingP.lastName}` : undefined,
    topRatingId: ratingP?.id,
    topRatingValue: ratings[0] ? averageRating(ratings[0]) : undefined,
    headline,
    body: bodyParts.join(" "),
    quotes: buildSeasonEndQuotes(pack, save, {
      place,
      userClubId: save.clubId,
      season: save.season,
    }),
  };
}

export function seasonAwardsNews(awards: SeasonAwards): NewsItem {
  return {
    id: `news-awards-${awards.leagueId}-${awards.season}`,
    date: "",
    category: "insight",
    headline: awards.headline,
    body: awards.body,
    relatedClubIds: [awards.userClubId, awards.championClubId],
  };
}
