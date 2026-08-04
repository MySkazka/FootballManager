import type { CareerSave, Club, Fixture, MatchResult, WorldPack } from "./types";

function roundMoney(n: number): number {
  return Math.round(n * 10) / 10;
}

function ensureFinances(save: CareerSave, clubId: string): void {
  if (!save.clubFinances) save.clubFinances = {};
  if (!save.clubFinances[clubId]) save.clubFinances[clubId] = { budget: 10 };
}

function leagueOfClub(pack: WorldPack, clubId: string) {
  return pack.leagues.find((l) => l.clubIds.includes(clubId));
}

function tablePlace(save: CareerSave, leagueId: string | undefined, clubId: string): number {
  if (!leagueId) return 10;
  const table = save.table[leagueId] ?? [];
  const idx = table.findIndex((r) => r.clubId === clubId);
  return idx >= 0 ? idx + 1 : Math.max(8, Math.ceil(table.length / 2));
}

function isEuro(tid: string): boolean {
  return tid === "ucl" || tid === "uel" || tid === "uecl";
}

/**
 * Matchday + performance income in abstract millions (roughly €M).
 * Home gate scales with reputation, league strength and table form;
 * wins and European nights add prize / broadcast bumps.
 */
export function applyMatchdayIncome(
  save: CareerSave,
  pack: WorldPack,
  fixture: Fixture,
  result: MatchResult
): { homeIncome: number; awayIncome: number } {
  const home = pack.clubs.find((c) => c.id === fixture.homeClubId);
  const away = pack.clubs.find((c) => c.id === fixture.awayClubId);
  if (!home || !away) return { homeIncome: 0, awayIncome: 0 };

  const homeLeague = leagueOfClub(pack, home.id);
  const awayLeague = leagueOfClub(pack, away.id);
  const homePlace = tablePlace(save, homeLeague?.id, home.id);
  const awayPlace = tablePlace(save, awayLeague?.id, away.id);

  const homeWon = result.homeGoals > result.awayGoals;
  const awayWon = result.awayGoals > result.homeGoals;
  const draw = result.homeGoals === result.awayGoals;

  const leagueTier: Record<string, number> = {
    epl: 1.35,
    laliga: 1.25,
    bundesliga: 1.2,
    seriea: 1.18,
    ligue1: 1.1,
    rpl: 0.72,
  };

  let homeIncome = 0;
  let awayIncome = 0;

  if (isEuro(fixture.tournamentId)) {
    // European nights must clearly beat a domestic matchday for the same club.
    // UCL ≫ UEL ≫ UECL, all still above a typical league fixture.
    const cup =
      fixture.tournamentId === "ucl"
        ? { gate: 1.55, prize: 2.1, win: 1.15, awayShare: 0.2 }
        : fixture.tournamentId === "uel"
          ? { gate: 1.28, prize: 1.45, win: 0.85, awayShare: 0.18 }
          : { gate: 1.12, prize: 1.1, win: 0.6, awayShare: 0.16 };

    const homeTier = leagueTier[homeLeague?.id ?? ""] ?? 0.9;
    const demand = Math.max(0.65, 1.28 - (homePlace - 1) * 0.028);
    const formBoost = homeWon ? 1.06 : draw ? 1.0 : 0.95;
    // Packed European gate (TV + tickets) — base already above domestic scale
    const gate =
      home.reputation * 0.013 * homeTier * demand * cup.gate * formBoost;
    homeIncome += gate;
    awayIncome += gate * cup.awayShare;

    // UEFA central prize / broadcast share (paid to both sides)
    homeIncome += (0.45 + home.reputation * 0.011) * cup.prize;
    awayIncome += (0.35 + away.reputation * 0.009) * cup.prize;

    if (homeWon) homeIncome += cup.win;
    if (awayWon) awayIncome += cup.win;
    if (draw) {
      homeIncome += cup.win * 0.35;
      awayIncome += cup.win * 0.35;
    }
  } else if (homeLeague) {
    const tier = leagueTier[homeLeague.id] ?? 0.85;
    // Gate receipts: top PL ~1.5–2.5M, mid ~0.6–1.0, RPL mid ~0.25–0.55
    const demand = Math.max(0.55, 1.25 - (homePlace - 1) * 0.035);
    const formBoost = homeWon ? 1.08 : draw ? 1.0 : 0.94;
    const gate = home.reputation * 0.011 * tier * demand * formBoost;
    homeIncome += gate;
    // Away share of commercial / travel guarantee
    awayIncome += gate * 0.12;

    // League prize / win bonus (broadcast)
    const winScale = 0.08 + home.reputation * 0.0015;
    if (homeWon) homeIncome += winScale * tier;
    if (awayWon) awayIncome += (0.08 + away.reputation * 0.0015) * (leagueTier[awayLeague?.id ?? ""] ?? 0.85);
    if (draw) {
      homeIncome += winScale * 0.35 * tier;
      awayIncome += 0.03 * tier;
    }

    // Sponsorship drip tied to league standing (per matchday)
    const sponsorHome =
      (0.12 + home.reputation * 0.0025) * tier * Math.max(0.5, 1.15 - homePlace * 0.04);
    const sponsorAway =
      (0.1 + away.reputation * 0.0022) *
      (leagueTier[awayLeague?.id ?? ""] ?? 0.85) *
      Math.max(0.5, 1.15 - awayPlace * 0.04);
    homeIncome += sponsorHome;
    awayIncome += sponsorAway;
  } else {
    // Guest clubs: only euro above; rare friendlies N/A
    homeIncome += home.reputation * 0.004;
    awayIncome += away.reputation * 0.003;
  }

  homeIncome = roundMoney(Math.max(0, homeIncome));
  awayIncome = roundMoney(Math.max(0, awayIncome));

  ensureFinances(save, home.id);
  ensureFinances(save, away.id);
  save.clubFinances[home.id].budget = roundMoney(
    save.clubFinances[home.id].budget + homeIncome
  );
  save.clubFinances[away.id].budget = roundMoney(
    save.clubFinances[away.id].budget + awayIncome
  );

  return { homeIncome, awayIncome };
}

/** Rough expected home gate for UI hints. */
export function estimateHomeGate(club: Club, place = 8, leagueId?: string): number {
  const tier: Record<string, number> = {
    epl: 1.35,
    laliga: 1.25,
    bundesliga: 1.2,
    seriea: 1.18,
    ligue1: 1.1,
    rpl: 0.72,
  };
  const t = leagueId ? tier[leagueId] ?? 0.85 : 0.85;
  const demand = Math.max(0.55, 1.25 - (place - 1) * 0.035);
  return roundMoney(club.reputation * 0.011 * t * demand);
}
