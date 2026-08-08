import { hasContinentalAccess } from "./access";
import {
  applyMatchDevelopment,
  applySeasonDevelopment,
  buildSeasonAwards,
  isUserLeagueComplete,
  seasonAwardsNews,
  userLeagueId,
  type SeasonAwards,
} from "./development";
import {
  applySeasonAging,
  ensureRetirementAge,
  generateAcademyProspects,
  lastSeasonWarningNews,
  retirementNews,
} from "./aging";
import { buildLeagueFixtures, ensureFullLeagueFixtures, seasonStartFromPack } from "./fixtures";
import { ensureContinentalFixtures } from "./continental";
import {
  createLiveMatch,
  liveMatchToResult,
  simulateMatch,
} from "./liveMatch";
import { generateWindowRumours, newsFromMatch, newsNationalTeam } from "./news";
import {
  computePlayerWage,
  generateWorldPlayers,
  hasLatinLetters,
  recomputeMarketValue,
  refreshMarketValues,
  ensureMissingClubSquads,
  rollBody,
  rollCyrillicName,
  rollNationality,
  rollRolesAndFoot,
} from "./players";
import { assignSquadPortraits, isValidPortraitId, portraitIdForPlayer, PORTRAIT_SCHEMA } from "./portraits";
import { formatMarketValue, primaryPosition } from "./labels";
import { Rng } from "./rng";
import { applyMatchToSeasonStats } from "./stats";
import { defaultTactics, autoSelectLineup, optimalTactics } from "./tactics";
import {
  buildTransferWindows,
  detectClosedTransferWindow,
  expireStaleIncomingOffers,
  expireStaleOutgoingOffers,
  generateIncomingTransferOffers,
  isTransferWindowOpen,
  resolveExpiredLoans,
  resolveOutgoingTransferOffers,
  seedClubFinances,
  simulateAiTransfers,
} from "./transfers";
import { snapshotSeasonStartValues } from "./valueHistory";
import { applyMatchdayIncome } from "./finances";
import { rollMatchAtmosphere } from "./weather";
import { isEuroTournament } from "./calendar";
import {
  applyUefaMatchPoints,
  ensureUefaState,
  registerEuroParticipants,
  seedUefaState,
} from "./uefa";
import {
  enrichDramaNewsPlayerIds,
  normalizeSquadDramas,
  noteSquadDramaMatchStarts,
  tickSquadDramas,
} from "./squadDrama";
import type {
  CareerSave,
  Club,
  DayAdvanceResult,
  Fixture,
  LeagueTableRow,
  LiveMatchState,
  MatchResult,
  Player,
  TeamTactics,
  WorldPack,
} from "./types";

export type { SeasonAwards };

/** Inject legionnaires + refresh names/faces when nationality mix rules change. */
export const NATIONALITY_SCHEMA = 1;

function emptyRow(clubId: string): LeagueTableRow {
  return { clubId, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 };
}

function applyResult(
  table: LeagueTableRow[],
  homeId: string,
  awayId: string,
  hg: number,
  ag: number
): void {
  const home = table.find((r) => r.clubId === homeId)!;
  const away = table.find((r) => r.clubId === awayId)!;
  home.played++;
  away.played++;
  home.gf += hg;
  home.ga += ag;
  away.gf += ag;
  away.ga += hg;
  if (hg > ag) {
    home.won++;
    away.lost++;
    home.points += 3;
  } else if (hg < ag) {
    away.won++;
    home.lost++;
    away.points += 3;
  } else {
    home.drawn++;
    away.drawn++;
    home.points += 1;
    away.points += 1;
  }
}

export function createCareer(
  pack: WorldPack,
  clubId: string,
  managerName: string,
  seed = 42
): CareerSave {
  const players = generateWorldPlayers(pack, seed);
  const seasonStart = `${pack.season.slice(0, 4)}-08-01`;
  const uefa = seedUefaState(pack);
  const fixtures = [
    ...pack.leagues.flatMap((l) =>
      buildLeagueFixtures(l.id, [...new Set(l.clubIds)], seasonStart, 7)
    ),
    ...ensureContinentalFixtures([], pack, seasonStart, uefa),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  registerEuroParticipants(uefa, pack, fixtures);
  const table: CareerSave["table"] = {};
  for (const league of pack.leagues) {
    const uniqueIds = [...new Set(league.clubIds)];
    table[league.id] = uniqueIds.map(emptyRow);
  }

  const club = pack.clubs.find((c) => c.id === clubId)!;
  const access = hasContinentalAccess(pack, club.federationId)
    ? "Еврокубки для федерации открыты."
    : "Еврокубки для федерации сейчас закрыты (правило из world pack).";

  for (const p of players) ensureRetirementAge(p);

  const startDate = `${pack.season.slice(0, 4)}-08-01`;
  const news: CareerSave["news"] = [
    {
      id: "news-welcome",
      date: startDate,
      category: "insight",
      headline: `${managerName} возглавил «${club.name}»`,
      body: `Новый наставник приступил к работе в ${club.city}. ${access}`,
      relatedClubIds: [clubId],
    },
  ];
  const lastWarn = lastSeasonWarningNews(startDate, players, clubId);
  if (lastWarn) news.unshift(lastWarn);

  const save: CareerSave = {
    id: `save-${seed}-${clubId}`,
    managerName,
    clubId,
    season: pack.season,
    currentDate: startDate,
    players,
    fixtures,
    news,
    table,
    playerStats: {},
    userTactics: defaultTactics(players, clubId, "4-3-3"),
    clubFinances: seedClubFinances(pack),
    transferWindows: buildTransferWindows(pack.season),
    suspensions: {},
    squadDramas: [],
    pendingAcademy: [],
    transferLog: [],
    incomingTransferOffers: [],
    portraitSchema: PORTRAIT_SCHEMA,
    nationalitySchema: NATIONALITY_SCHEMA,
    seasonStartMarketValues: {},
    uefa,
  };
  save.seasonStartMarketValues = snapshotSeasonStartValues(save);
  return save;
}

function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function atmosphereForFixture(
  pack: WorldPack,
  save: CareerSave,
  fixture: Fixture,
  home: Club,
  away: Club,
  rng: Rng
) {
  const homeLeague = pack.leagues.find((l) => l.clubIds.includes(home.id));
  const place =
    homeLeague && save.table[homeLeague.id]
      ? (save.table[homeLeague.id].findIndex((r) => r.clubId === home.id) + 1) || 8
      : 8;
  const fed = pack.federations.find((f) => f.id === home.federationId);
  const euro = isEuroTournament(fixture.tournamentId);
  return rollMatchAtmosphere(home, away, fixture.date, rng, {
    federation: fed,
    league: homeLeague,
    place,
    euro,
  });
}

function migratePlayer(raw: Partial<Player>, stats: CareerSave["playerStats"]): Player | null {
  if (!raw?.id || !raw.firstName || !raw.lastName || !raw.attributes || !Array.isArray(raw.positions)) {
    return null;
  }
  const positions = raw.positions.length ? raw.positions : (["MF"] as Player["positions"]);
  const rng = new Rng(seedFromId(raw.id));
  const rolled =
    raw.preferredRole && Array.isArray(raw.roles) && raw.roles.length
      ? {
          preferredRole: raw.preferredRole,
          roles: raw.roles as Player["roles"],
          preferredFoot: raw.preferredFoot ?? rollRolesAndFoot(positions[0] ?? "MF", rng).preferredFoot,
        }
      : rollRolesAndFoot(positions[0] ?? "MF", rng);
  const nationalityId = raw.nationalityId ?? "RUS";
  let firstName = raw.firstName;
  let lastName = raw.lastName;
  if (hasLatinLetters(firstName) || hasLatinLetters(lastName)) {
    const rolledNames = rollCyrillicName(nationalityId, raw.id);
    firstName = rolledNames.firstName;
    lastName = rolledNames.lastName;
  }
  const base: Player = {
    id: raw.id,
    firstName,
    lastName,
    age: raw.age ?? 24,
    nationalityId,
    clubId: raw.clubId ?? null,
    positions,
    roles: rolled.roles,
    preferredRole: rolled.preferredRole,
    preferredFoot: rolled.preferredFoot,
    attributes: raw.attributes,
    traits: Array.isArray(raw.traits) ? raw.traits : [],
    overall: raw.overall ?? 60,
    potential: raw.potential ?? raw.overall ?? 65,
    height: raw.height ?? 0,
    weight: raw.weight ?? 0,
    marketValue: raw.marketValue ?? 0,
    wage: typeof raw.wage === "number" && Number.isFinite(raw.wage) ? raw.wage : 0,
    portraitId: isValidPortraitId(raw.portraitId)
      ? raw.portraitId
      : portraitIdForPlayer(nationalityId, raw.id),
    retirementAge: raw.retirementAge,
    loan: raw.loan,
    careerMoves: Array.isArray(raw.careerMoves) ? raw.careerMoves : undefined,
  };
  ensureRetirementAge(base);
  if (!base.height || !base.weight) {
    const body = rollBody(primaryPosition(base), new Rng(seedFromId(base.id)));
    base.height = base.height || body.height;
    base.weight = base.weight || body.weight;
  }
  if (!base.marketValue || !Number.isFinite(base.marketValue)) {
    base.marketValue = recomputeMarketValue(base, stats[base.id] ?? null);
  }
  return base;
}

/** Re-spread faces per club (nationality-aware tones, fewer clones in one squad). */
function rebalanceMissingPortraits(players: Player[]): void {
  const byClub = new Map<string, Player[]>();
  for (const p of players) {
    const key = p.clubId ?? `free:${p.nationalityId}`;
    let list = byClub.get(key);
    if (!list) {
      list = [];
      byClub.set(key, list);
    }
    list.push(p);
  }
  for (const [key, squad] of byClub) {
    const rng = new Rng(seedFromId(`portraits:${key}`));
    const ids = assignSquadPortraits(
      squad.map((p) => p.nationalityId),
      rng
    );
    for (let i = 0; i < squad.length; i++) {
      squad[i].portraitId = ids[i] ?? portraitIdForPlayer(squad[i].nationalityId, squad[i].id);
    }
  }
}

/** Re-roll nationalities for mono-national club squads (adds legionnaires). */
function remigrateSquadNationalities(players: Player[], pack: WorldPack): void {
  const clubs = new Map(pack.clubs.map((c) => [c.id, c]));
  const byClub = new Map<string, Player[]>();
  for (const p of players) {
    if (!p.clubId) continue;
    let list = byClub.get(p.clubId);
    if (!list) {
      list = [];
      byClub.set(p.clubId, list);
    }
    list.push(p);
  }
  for (const [clubId, squad] of byClub) {
    const club = clubs.get(clubId);
    if (!club) continue;
    const rng = new Rng(seedFromId(`nationality:${clubId}:v${NATIONALITY_SCHEMA}`));
    for (const p of squad) {
      const nextNat = rollNationality(club.federationId, rng);
      if (nextNat === p.nationalityId) continue;
      p.nationalityId = nextNat;
      const names = rollCyrillicName(nextNat, `${p.id}:nat${NATIONALITY_SCHEMA}`);
      p.firstName = names.firstName;
      p.lastName = names.lastName;
      p.portraitId = portraitIdForPlayer(nextNat, p.id);
    }
  }
  rebalanceMissingPortraits(players);
}

/**
 * Validate + migrate a parsed save (v2 / partial v3).
 * Returns null when the save is unusable — caller should wipe storage.
 */
export function normalizeCareerSave(pack: WorldPack, raw: unknown): CareerSave | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<CareerSave>;
  if (typeof s.clubId !== "string" || !pack.clubs.some((c) => c.id === s.clubId)) return null;
  if (!Array.isArray(s.fixtures) || !s.table || typeof s.table !== "object") return null;

  const playerStats =
    s.playerStats && typeof s.playerStats === "object" && !Array.isArray(s.playerStats)
      ? s.playerStats
      : {};

  const recoverSeed = seedFromId(typeof s.id === "string" ? s.id : s.clubId) + 2026;
  const players: Player[] = [];
  const portraitSchemaOk = s.portraitSchema === PORTRAIT_SCHEMA;
  const nationalitySchemaOk = s.nationalitySchema === NATIONALITY_SCHEMA;
  let portraitsNeedRespread = !portraitSchemaOk;
  const rawPlayers = Array.isArray(s.players) ? s.players : [];
  let squadsRebuilt = false;

  if (rawPlayers.length === 0) {
    // Recover careers wiped by the empty-squad bug: rebuild world squads, keep calendar/table.
    players.push(...generateWorldPlayers(pack, recoverSeed));
    portraitsNeedRespread = false;
    squadsRebuilt = true;
  } else {
    for (const p of rawPlayers) {
      const rawPlayer = p as Partial<Player>;
      if (!isValidPortraitId(rawPlayer.portraitId)) portraitsNeedRespread = true;
      const migrated = migratePlayer(rawPlayer, playerStats);
      if (!migrated) return null;
      players.push(migrated);
    }
    if (!nationalitySchemaOk) {
      remigrateSquadNationalities(players, pack);
    } else if (portraitsNeedRespread) {
      rebalanceMissingPortraits(players);
    }
  }

  const withGuests = ensureMissingClubSquads(pack, players, recoverSeed);
  // Always copy — ensureMissingClubSquads may return the same array reference
  const allPlayers = [...withGuests];

  // Backfill wages for old saves (and any zero placeholders from migrate).
  const clubById = new Map(pack.clubs.map((c) => [c.id, c]));
  const leagueByClub = new Map<string, string>();
  for (const league of pack.leagues) {
    for (const id of league.clubIds) leagueByClub.set(id, league.id);
  }
  for (const p of allPlayers) {
    if (typeof p.wage === "number" && Number.isFinite(p.wage) && p.wage > 0) continue;
    const club = p.clubId ? clubById.get(p.clubId) : undefined;
    p.wage = computePlayerWage(p, club, p.clubId ? leagueByClub.get(p.clubId) : undefined);
  }

  const season = typeof s.season === "string" ? s.season : pack.season;
  const uefa = ensureUefaState(pack, {
    uefa: s.uefa,
  } as CareerSave);
  let fixtures = ensureFullLeagueFixtures(
    s.fixtures as CareerSave["fixtures"],
    pack.leagues,
    seasonStartFromPack(pack, season)
  );
  fixtures = ensureContinentalFixtures(fixtures, pack, seasonStartFromPack(pack, season), uefa);
  registerEuroParticipants(uefa, pack, fixtures);
  let currentDate =
    typeof s.currentDate === "string" ? s.currentDate : `${season.slice(0, 4)}-08-01`;
  const nextUserMatch = fixtures
    .filter(
      (f) =>
        !f.result &&
        (f.homeClubId === s.clubId || f.awayClubId === s.clubId)
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (nextUserMatch && currentDate > nextUserMatch.date) {
    currentDate = nextUserMatch.date;
  }

  const clubFinances =
    s.clubFinances && typeof s.clubFinances === "object" && !Array.isArray(s.clubFinances)
      ? { ...seedClubFinances(pack), ...s.clubFinances }
      : seedClubFinances(pack);

  const transferWindows =
    Array.isArray(s.transferWindows) && s.transferWindows.length > 0
      ? s.transferWindows
      : buildTransferWindows(season);

  const lineupIdsOk =
    !squadsRebuilt &&
    s.userTactics &&
    typeof s.userTactics === "object" &&
    Array.isArray(s.userTactics.lineup) &&
    s.userTactics.lineup.length >= 11 &&
    s.userTactics.lineup.every((id) => allPlayers.some((p) => p.id === id));
  const userTactics: TeamTactics = lineupIdsOk
    ? (s.userTactics as TeamTactics)
    : defaultTactics(allPlayers, s.clubId, s.userTactics?.formation ?? "4-3-3", {
        stats: playerStats,
        suspensions:
          s.suspensions && typeof s.suspensions === "object" ? s.suspensions : {},
      });

  const suspensions =
    s.suspensions && typeof s.suspensions === "object" && !Array.isArray(s.suspensions)
      ? { ...s.suspensions }
      : {};

  for (const p of allPlayers) ensureRetirementAge(p);

  const news = Array.isArray(s.news) ? [...s.news] : [];
  if (!s.seasonResolved) {
    const hasLastWarn = news.some((n) => n.id?.startsWith("news-last-season-"));
    if (!hasLastWarn) {
      const warn = lastSeasonWarningNews(currentDate, allPlayers, s.clubId);
      if (warn) news.unshift(warn);
    }
  }

  const squadDramas = normalizeSquadDramas(s.squadDramas);
  const draft: CareerSave = {
    id: typeof s.id === "string" ? s.id : `save-migrated-${s.clubId}`,
    managerName: typeof s.managerName === "string" ? s.managerName : "Менеджер",
    clubId: s.clubId,
    season,
    currentDate,
    players: allPlayers,
    fixtures,
    news,
    table: s.table,
    playerStats,
    userTactics,
    clubFinances,
    transferWindows,
    suspensions,
    squadDramas,
    seasonResolved: s.seasonResolved === true,
    pendingAcademy: Array.isArray(s.pendingAcademy) ? (s.pendingAcademy as Player[]) : [],
    transferLog: Array.isArray(s.transferLog) ? s.transferLog : [],
    incomingTransferOffers: Array.isArray(s.incomingTransferOffers)
      ? s.incomingTransferOffers.filter(
          (o) =>
            o &&
            typeof o === "object" &&
            typeof (o as { id?: unknown }).id === "string" &&
            typeof (o as { playerId?: unknown }).playerId === "string" &&
            typeof (o as { buyingClubId?: unknown }).buyingClubId === "string" &&
            typeof (o as { fee?: unknown }).fee === "number"
        )
      : [],
    outgoingTransferOffers: Array.isArray(s.outgoingTransferOffers)
      ? s.outgoingTransferOffers.filter(
          (o) =>
            o &&
            typeof o === "object" &&
            typeof (o as { id?: unknown }).id === "string" &&
            typeof (o as { playerId?: unknown }).playerId === "string" &&
            typeof (o as { sellingClubId?: unknown }).sellingClubId === "string" &&
            typeof (o as { fee?: unknown }).fee === "number" &&
            ((o as { kind?: unknown }).kind === "buy" ||
              (o as { kind?: unknown }).kind === "loan")
        )
      : [],
    pendingWindowReport: s.pendingWindowReport ?? null,
    portraitSchema: PORTRAIT_SCHEMA,
    nationalitySchema: NATIONALITY_SCHEMA,
    seasonStartMarketValues: (() => {
      const base =
        s.seasonStartMarketValues && typeof s.seasonStartMarketValues === "object"
          ? { ...(s.seasonStartMarketValues as Record<string, number>) }
          : snapshotSeasonStartValues({ players: allPlayers } as CareerSave);
      for (const p of allPlayers) {
        if (base[p.id] == null || !Number.isFinite(base[p.id])) {
          base[p.id] = Math.max(0.1, Math.round((p.marketValue ?? 0.1) * 10) / 10);
        }
      }
      return base;
    })(),
    uefa,
  };
  enrichDramaNewsPlayerIds(draft);
  return draft;
}

function clubMap(pack: WorldPack): Map<string, Club> {
  return new Map(pack.clubs.map((c) => [c.id, c]));
}

function commitFixture(
  next: CareerSave,
  pack: WorldPack,
  fixture: Fixture,
  result: MatchResult,
  rng: Rng
): void {
  const clubs = clubMap(pack);
  const home = clubs.get(fixture.homeClubId)!;
  const away = clubs.get(fixture.awayClubId)!;
  fixture.result = result;
  const leagueTable = next.table[fixture.tournamentId];
  if (leagueTable) {
    applyResult(leagueTable, home.id, away.id, result.homeGoals, result.awayGoals);
    leagueTable.sort((a, b) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga));
  }

  const homeLineup = result.homeLineup ?? optimalTactics(next.players, home.id).lineup;
  const awayLineup = result.awayLineup ?? optimalTactics(next.players, away.id).lineup;
  const ratings = result.ratings ?? {};
  if (!next.playerStats) next.playerStats = {};
  applyMatchToSeasonStats(
    next.playerStats,
    result,
    home.id,
    away.id,
    homeLineup,
    awayLineup,
    ratings,
    next.players
  );

  const touched = new Set<string>([
    ...homeLineup,
    ...awayLineup,
    ...result.events.filter((e) => e.playerId).map((e) => e.playerId!),
  ]);
  refreshMarketValues(next.players, next.playerStats, [...touched]);
  applyMatchDevelopment(
    next.players,
    ratings,
    [...touched],
    next.playerStats,
    (p) => rng.chance(p)
  );

  const income = applyMatchdayIncome(next, pack, fixture, result);
  const uefa = ensureUefaState(pack, next);
  applyUefaMatchPoints(uefa, pack, fixture, result);
  if (
    (fixture.homeClubId === next.clubId || fixture.awayClubId === next.clubId) &&
    (income.homeIncome > 0.15 || income.awayIncome > 0.15)
  ) {
    const mineHome = fixture.homeClubId === next.clubId;
    const earned = mineHome ? income.homeIncome : income.awayIncome;
    if (earned >= 0.3 && rng.chance(0.45)) {
      next.news.unshift({
        id: `news-gate-${fixture.id}`,
        date: next.currentDate,
        category: "insight",
        headline: mineHome ? "Касса матча" : "Выездные поступления",
        body: mineHome
          ? `Билеты, атрибутика и спонсоры принесли клубу около ${formatMarketValue(earned)} после домашнего матча.`
          : `Клуб получил около ${formatMarketValue(earned)} (доля от матча, ТВ и бонусы).`,
        relatedClubIds: [next.clubId],
      });
    }
  }

  if (!next.suspensions) next.suspensions = {};
  // Existing bans are served by this matchday
  for (const p of next.players) {
    if (p.clubId !== home.id && p.clubId !== away.id) continue;
    const left = next.suspensions[p.id] ?? 0;
    if (left > 0) {
      next.suspensions[p.id] = left - 1;
      if (next.suspensions[p.id] <= 0) delete next.suspensions[p.id];
    }
  }
  for (const e of result.events) {
    if (e.type === "card" && e.detail === "red" && e.playerId) {
      next.suspensions[e.playerId] = Math.max(next.suspensions[e.playerId] ?? 0, 1);
    }
  }
  for (const e of result.events) {
    if (e.type !== "card" || e.detail !== "yellow" || !e.playerId) continue;
    const y = next.playerStats[e.playerId]?.yellowCards ?? 0;
    if (y > 0 && y % 5 === 0) {
      next.suspensions[e.playerId] = Math.max(next.suspensions[e.playerId] ?? 0, 1);
    }
  }
  for (const e of result.events) {
    if (e.type !== "injury" || !e.playerId) continue;
    const days = e.detail === "serious" ? 3 : e.detail === "muscle" ? 2 : 1;
    next.suspensions[e.playerId] = Math.max(next.suspensions[e.playerId] ?? 0, days);
  }

  next.news.unshift(...newsFromMatch(fixture, result, home, away, next.players, rng));

  const userInMatch = fixture.homeClubId === next.clubId || fixture.awayClubId === next.clubId;
  if (userInMatch) {
    const userLineup =
      fixture.homeClubId === next.clubId ? homeLineup : awayLineup;
    noteSquadDramaMatchStarts(next, userLineup, next.clubId);
  }
}

function bumpDate(save: CareerSave, pack?: WorldPack): void {
  const previous = save.currentDate;
  const d = new Date(save.currentDate);
  d.setDate(d.getDate() + 1);
  save.currentDate = d.toISOString().slice(0, 10);
  save.news = save.news.slice(0, 100);
  detectClosedTransferWindow(save, previous);
  if (pack) {
    resolveOutgoingTransferOffers(pack, save);
    resolveExpiredLoans(pack, save);
  }
}

export function findUserFixtureOnDate(save: CareerSave, date: string): Fixture | undefined {
  return save.fixtures.find(
    (f) =>
      f.date === date &&
      !f.result &&
      (f.homeClubId === save.clubId || f.awayClubId === save.clubId)
  );
}

/**
 * Advance one calendar day.
 * On user matchday: simulate all OTHER fixtures that day, return pending user fixture.
 */
export function advanceDay(pack: WorldPack, save: CareerSave, seed: number): DayAdvanceResult {
  const rng = new Rng(seed + Number(save.currentDate.split("-").join("")) % 100000);
  const clubs = clubMap(pack);
  const next = structuredClone(save) as CareerSave;
  const due = next.fixtures.filter((f) => f.date === next.currentDate && !f.result);
  const userFixture = due.find(
    (f) => f.homeClubId === next.clubId || f.awayClubId === next.clubId
  );

  for (const fixture of due) {
    if (userFixture && fixture.id === userFixture.id) continue;
    const home = clubs.get(fixture.homeClubId)!;
    const away = clubs.get(fixture.awayClubId)!;
    const matchRng = new Rng(rng.int(1, 1_000_000_000));
    const atmosphere = atmosphereForFixture(pack, next, fixture, home, away, matchRng);
    const result = simulateMatch(home, away, next.players, matchRng, undefined, undefined, atmosphere);
    commitFixture(next, pack, fixture, result, rng);
  }

  if (next.currentDate.endsWith("-01") && rng.chance(0.8)) {
    const fed = rng.pick(pack.federations);
    const opp = rng.pick(pack.federations.filter((f) => f.id !== fed.id));
    const score = `${rng.int(0, 3)}:${rng.int(0, 3)}`;
    next.news.unshift(newsNationalTeam(next.currentDate, fed.name, opp.name, score, rng));
  }

  if (isTransferWindowOpen(next)) {
    simulateAiTransfers(pack, next, rng);
    generateIncomingTransferOffers(pack, next, rng);
    next.news.unshift(
      ...generateWindowRumours(pack, next.players, next.clubId, next.currentDate, next.news, rng)
    );
  } else {
    expireStaleIncomingOffers(next);
    expireStaleOutgoingOffers(next);
  }

  tickSquadDramas(pack, next, rng);

  if (userFixture) {
    return {
      save: next,
      pendingUserMatch: { fixture: userFixture },
    };
  }

  bumpDate(next, pack);
  return { save: next };
}

export function beginUserMatch(
  pack: WorldPack,
  save: CareerSave,
  fixtureId: string,
  userTactics?: TeamTactics
): LiveMatchState | null {
  const fixture = save.fixtures.find((f) => f.id === fixtureId);
  if (!fixture || fixture.result) return null;
  const clubs = clubMap(pack);
  const home = clubs.get(fixture.homeClubId);
  const away = clubs.get(fixture.awayClubId);
  if (!home || !away) return null;
  const tactics = userTactics ?? save.userTactics;
  const lineupCtx = {
    stats: save.playerStats,
    suspensions: save.suspensions ?? {},
  };
  // Drop suspended players from user lineup if any slipped in
  const cleanUserLineup = (tactics.lineup ?? []).filter(
    (id: string) => (save.suspensions?.[id] ?? 0) <= 0
  );
  let userTacticsFinal = tactics;
  if (cleanUserLineup.length < 11) {
    userTacticsFinal = {
      ...tactics,
      lineup: autoSelectLineup(save.players, save.clubId, tactics.formation, lineupCtx),
    };
  } else if (cleanUserLineup.length !== tactics.lineup.length) {
    userTacticsFinal = {
      ...tactics,
      lineup: autoSelectLineup(save.players, save.clubId, tactics.formation, {
        ...lineupCtx,
        exclude: new Set(
          tactics.lineup.filter((id: string) => (save.suspensions?.[id] ?? 0) > 0)
        ),
      }),
    };
  }
  const homeTactics =
    fixture.homeClubId === save.clubId
      ? userTacticsFinal
      : optimalTactics(save.players, home.id, lineupCtx);
  const awayTactics =
    fixture.awayClubId === save.clubId
      ? userTacticsFinal
      : optimalTactics(save.players, away.id, lineupCtx);
  const atmRng = new Rng(seedFromId(fixture.id) + seedFromId(fixture.date));
  const atmosphere = atmosphereForFixture(pack, save, fixture, home, away, atmRng);
  return createLiveMatch(fixture.id, home, away, save.players, homeTactics, awayTactics, atmosphere);
}

export function finishUserMatch(
  pack: WorldPack,
  save: CareerSave,
  fixtureId: string,
  result: MatchResult,
  seed: number,
  updatedUserTactics?: TeamTactics
): CareerSave {
  const rng = new Rng(seed + 99);
  const next = structuredClone(save) as CareerSave;
  if (updatedUserTactics) next.userTactics = updatedUserTactics;
  const fixture = next.fixtures.find((f) => f.id === fixtureId);
  if (!fixture || fixture.result) return next;
  commitFixture(next, pack, fixture, result, rng);
  bumpDate(next, pack);
  return next;
}

export function updateUserTactics(save: CareerSave, tactics: TeamTactics): CareerSave {
  return { ...save, userTactics: tactics };
}

export function clubPlayers(save: CareerSave, clubId: string) {
  return save.players.filter((p) => p.clubId === clubId);
}

export function advanceUntilMatchday(pack: WorldPack, save: CareerSave, seed: number): DayAdvanceResult {
  let current = save;
  for (let i = 0; i < 60; i++) {
    const result = advanceDay(pack, current, seed + i);
    if (result.pendingUserMatch) return result;
    current = result.save;
  }
  return { save: current };
}

/**
 * Simulate remaining fixtures, apply end-of-season development, aging/retirements,
 * academy intake and awards (once).
 */
export function completeSeason(
  pack: WorldPack,
  save: CareerSave,
  seed: number
): { save: CareerSave; awards: SeasonAwards | null } {
  const next = structuredClone(save) as CareerSave;
  if (next.seasonResolved) {
    return { save: next, awards: buildSeasonAwards(pack, next) };
  }

  const rng = new Rng(seed + 7777);
  const clubs = clubMap(pack);
  const unfinished = next.fixtures
    .filter((f) => !f.result)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  for (const fixture of unfinished) {
    const home = clubs.get(fixture.homeClubId);
    const away = clubs.get(fixture.awayClubId);
    if (!home || !away) continue;
    const matchRng = new Rng(rng.int(1, 1_000_000_000));
    const atmosphere = atmosphereForFixture(pack, next, fixture, home, away, matchRng);
    const result = simulateMatch(home, away, next.players, matchRng, undefined, undefined, atmosphere);
    commitFixture(next, pack, fixture, result, rng);
  }

  applySeasonDevelopment(next);

  const aging = applySeasonAging(next);
  next.news.unshift(...retirementNews(next.currentDate, aging.retired, pack));

  next.pendingAcademy = generateAcademyProspects(pack, next, next.clubId, rng, rng.int(2, 4));
  if (next.pendingAcademy.length) {
    next.news.unshift({
      id: `news-academy-ready-${next.season}`,
      date: next.currentDate,
      category: "insight",
      headline: "Выпуск спортивной школы",
      body: `Академия «${pack.clubs.find((c) => c.id === next.clubId)?.shortName ?? "клуба"}» предлагает ${next.pendingAcademy.length} воспитанников в основу. Решите, кого взять.`,
      relatedClubIds: [next.clubId],
    });
  }

  const awards = buildSeasonAwards(pack, next);
  if (awards) {
    const item = seasonAwardsNews(awards);
    item.date = next.currentDate;
    next.news.unshift(item);
  }
  next.seasonResolved = true;
  return { save: next, awards };
}

/** "2025/26" → "2026/27" */
export function bumpSeasonLabel(season: string): string {
  const m = season.match(/^(\d{4})\s*[/\-]\s*(\d{2,4})$/);
  if (m) {
    const y1 = Number(m[1]) + 1;
    const y2raw = m[2]!;
    if (y2raw.length === 2) {
      const y2 = (Number(y2raw) + 1) % 100;
      return `${y1}/${String(y2).padStart(2, "0")}`;
    }
    return `${y1}/${Number(y2raw) + 1}`;
  }
  const y = Number(season.slice(0, 4));
  if (Number.isFinite(y) && y > 1900) {
    return `${y + 1}/${String((y + 2) % 100).padStart(2, "0")}`;
  }
  return season;
}

function finalizeUefaSeason(state: ReturnType<typeof ensureUefaState>): void {
  for (const fedId of Object.keys(state.history)) {
    const cur = state.current[fedId];
    const score =
      cur && cur.clubs > 0 ? Math.round((cur.points / cur.clubs) * 1000) / 1000 : 0;
    const hist = [...(state.history[fedId] ?? []), score].slice(-5);
    state.history[fedId] = hist;
    state.current[fedId] = { points: 0, clubs: 0 };
  }
}

/**
 * After awards / academy: roll calendar, empty tables, fresh fixtures for the next campaign.
 */
export function startNextSeason(pack: WorldPack, save: CareerSave): CareerSave {
  if (!save.seasonResolved) return save;

  const nextSeason = bumpSeasonLabel(save.season);
  const seasonStart = seasonStartFromPack(pack, nextSeason);

  const uefa = structuredClone(ensureUefaState(pack, save));
  finalizeUefaSeason(uefa);

  let fixtures = pack.leagues.flatMap((l) =>
    buildLeagueFixtures(l.id, [...new Set(l.clubIds)], seasonStart, 7)
  );
  fixtures = ensureContinentalFixtures(fixtures, pack, seasonStart, uefa);
  fixtures.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  registerEuroParticipants(uefa, pack, fixtures);

  const table: CareerSave["table"] = {};
  for (const league of pack.leagues) {
    table[league.id] = [...new Set(league.clubIds)].map(emptyRow);
  }

  const club = pack.clubs.find((c) => c.id === save.clubId);
  const news: CareerSave["news"] = [
    {
      id: `news-new-season-${nextSeason}`,
      date: seasonStart,
      category: "insight",
      headline: `Новый сезон ${nextSeason}`,
      body: `Чемпионат стартует. «${club?.name ?? "Клуб"}» готовится к первой игре — таблица обнулена.`,
      relatedClubIds: [save.clubId],
    },
    ...save.news.slice(0, 60),
  ];
  const lastWarn = lastSeasonWarningNews(seasonStart, save.players, save.clubId);
  if (lastWarn) news.unshift(lastWarn);

  const next: CareerSave = {
    ...save,
    season: nextSeason,
    currentDate: seasonStart,
    fixtures,
    table,
    news,
    playerStats: {},
    suspensions: {},
    transferWindows: buildTransferWindows(nextSeason),
    transferLog: [],
    incomingTransferOffers: [],
    outgoingTransferOffers: [],
    pendingWindowReport: null,
    pendingAcademy: [],
    seasonResolved: false,
    uefa,
    userTactics: defaultTactics(save.players, save.clubId, save.userTactics?.formation ?? "4-3-3", {
      suspensions: {},
    }),
    seasonStartMarketValues: {},
  };

  resolveExpiredLoans(pack, next);
  next.seasonStartMarketValues = snapshotSeasonStartValues(next);
  return next;
}

export function seasonIsReadyToAward(pack: WorldPack, save: CareerSave): boolean {
  if (save.seasonResolved) return false;
  const userDone = !save.fixtures.some(
    (f) =>
      !f.result && (f.homeClubId === save.clubId || f.awayClubId === save.clubId)
  );
  return userDone || isUserLeagueComplete(pack, save);
}

/** Unique sorted matchday dates for a tournament (typically the user league). */
export function leagueMatchdayDates(save: CareerSave, leagueId: string): string[] {
  const dates = new Set<string>();
  for (const f of save.fixtures) {
    if (f.tournamentId === leagueId) dates.add(f.date);
  }
  return [...dates].sort();
}

/**
 * How many user-league matchdays still have at least one unfinished fixture.
 */
export function unfinishedLeagueMatchdaysLeft(pack: WorldPack, save: CareerSave): number {
  const leagueId = userLeagueId(pack, save.clubId);
  if (!leagueId) return 0;
  const dates = leagueMatchdayDates(save, leagueId);
  let left = 0;
  for (const date of dates) {
    const open = save.fixtures.some(
      (f) => f.tournamentId === leagueId && f.date === date && !f.result
    );
    if (open) left += 1;
  }
  return left;
}

/**
 * Bulk-simulate everything before the last `remaining` user-league matchdays
 * so the calendar sits ~3 rounds from the title race / season awards flow.
 * Does not run end-of-season aging or awards (`seasonResolved` stays false).
 *
 * Uses a lightweight score model (no live minute sim) so debug jumps stay responsive.
 */
export function fastForwardToLeagueMatchdaysLeft(
  pack: WorldPack,
  save: CareerSave,
  remaining = 3,
  seed = 1000
): CareerSave {
  return runNearSeasonEnd(pack, save, remaining, seed);
}

/**
 * Yields once so the UI can paint a busy state, then runs the lightweight jump.
 */
export async function fastForwardToLeagueMatchdaysLeftAsync(
  pack: WorldPack,
  save: CareerSave,
  remaining = 3,
  seed = 1000
): Promise<CareerSave> {
  await new Promise<void>((r) => setTimeout(r, 0));
  return runNearSeasonEnd(pack, save, remaining, seed);
}

function poissonSample(lambda: number, rng: Rng): number {
  const L = Math.exp(-Math.max(0.05, lambda));
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng.next();
  } while (p > L && k < 12);
  return k - 1;
}

/** Cheap AI result for bulk calendar jumps — standings only, no live engine. */
function simulateMatchQuick(home: Club, away: Club, rng: Rng): MatchResult {
  const edge = (home.reputation - away.reputation) / 45;
  const homeGoals = poissonSample(1.25 + edge + 0.12, rng);
  const awayGoals = poissonSample(1.1 - edge, rng);
  return {
    homeGoals,
    awayGoals,
    homeShots: homeGoals + rng.int(4, 11),
    awayShots: awayGoals + rng.int(3, 10),
    events: [],
  };
}

function commitFixtureStandingsOnly(
  next: CareerSave,
  fixture: Fixture,
  result: MatchResult
): void {
  fixture.result = result;
  const leagueTable = next.table[fixture.tournamentId];
  if (!leagueTable) return;
  applyResult(leagueTable, fixture.homeClubId, fixture.awayClubId, result.homeGoals, result.awayGoals);
  leagueTable.sort((a, b) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga));
}

function runNearSeasonEnd(
  pack: WorldPack,
  save: CareerSave,
  remaining: number,
  seed: number
): CareerSave {
  const leagueId = userLeagueId(pack, save.clubId);
  if (!leagueId || remaining < 1) {
    return { ...save, fixtures: save.fixtures.slice(), news: save.news.slice() };
  }

  const leagueDates = leagueMatchdayDates(save, leagueId);
  if (leagueDates.length === 0) {
    return { ...save, fixtures: save.fixtures.slice(), news: save.news.slice() };
  }

  const keep = Math.min(remaining, leagueDates.length);
  const cutoff = leagueDates[leagueDates.length - keep]!;

  const alreadyLeft = unfinishedLeagueMatchdaysLeft(pack, save);
  if (alreadyLeft <= keep) {
    return {
      ...save,
      seasonResolved: false,
      currentDate: save.currentDate > cutoff ? cutoff : save.currentDate,
      fixtures: save.fixtures.slice(),
      news: save.news.slice(),
    };
  }

  // Avoid structuredClone of ~3k players — only copy fixtures we mutate + standings.
  const next: CareerSave = {
    ...save,
    seasonResolved: false,
    fixtures: save.fixtures.map((f) =>
      !f.result && f.date < cutoff ? { ...f } : f
    ),
    table: structuredClone(save.table),
    news: save.news.slice(),
  };

  const rng = new Rng(seed + 4242);
  const clubs = clubMap(pack);

  for (const fixture of next.fixtures) {
    if (fixture.result || fixture.date >= cutoff) continue;
    const home = clubs.get(fixture.homeClubId);
    const away = clubs.get(fixture.awayClubId);
    if (!home || !away) continue;
    commitFixtureStandingsOnly(next, fixture, simulateMatchQuick(home, away, rng));
  }

  next.currentDate = cutoff;
  next.news = [
    {
      id: `news-debug-near-end-${next.season}-${cutoff}`,
      date: cutoff,
      category: "insight",
      headline: `Тест: до конца чемпионата ${keep} тура`,
      body: `Календарь перемотан к дате ${cutoff}. Сыграйте оставшиеся матчи и проверьте переход в новый сезон.`,
      relatedClubIds: [next.clubId],
    },
    ...next.news,
  ];

  return next;
}

export { liveMatchToResult };
