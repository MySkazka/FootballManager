import type { Fixture, League, WorldPack } from "./types";

/**
 * Circle method double round-robin: each pair meets twice (home and away).
 * Each round has n/2 matches on the same date.
 */
export function buildLeagueFixtures(
  leagueId: string,
  clubIds: string[],
  seasonStart: string,
  daysBetweenRounds = 7
): Fixture[] {
  const teams = [...clubIds];
  if (teams.length % 2 === 1) teams.push("__BYE__");
  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  const fixtures: Fixture[] = [];
  const start = new Date(seasonStart);

  const pushLeg = (legOffset: number, swapHome: boolean) => {
    const rotation = teams.slice(1);
    for (let round = 0; round < rounds; round++) {
      const d = new Date(start);
      d.setDate(start.getDate() + (legOffset + round) * daysBetweenRounds);
      const date = d.toISOString().slice(0, 10);
      const order = [teams[0], ...rotation];

      for (let i = 0; i < half; i++) {
        const a = order[i];
        const b = order[n - 1 - i];
        if (a === "__BYE__" || b === "__BYE__") continue;
        const homeFirst = round % 2 === 0 ? i % 2 === 0 : i % 2 === 1;
        const home = homeFirst ? a : b;
        const away = homeFirst ? b : a;
        fixtures.push({
          id: `${leagueId}-r${legOffset + round + 1}-${a}-${b}`,
          tournamentId: leagueId,
          date,
          homeClubId: swapHome ? away : home,
          awayClubId: swapHome ? home : away,
        });
      }

      rotation.unshift(rotation.pop()!);
    }
  };

  pushLeg(0, false);
  pushLeg(rounds, true);

  return fixtures.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Expected fixtures in a double round-robin (each team plays every other twice). */
export function expectedLeagueFixtureCount(clubIds: string[]): number {
  const n = new Set(clubIds).size;
  return n * (n - 1);
}

/**
 * Upgrades single-round-robin careers to a full double calendar,
 * keeping played results and filling in missing home/away legs.
 */
export function ensureFullLeagueFixtures(
  fixtures: Fixture[],
  leagues: League[],
  seasonStart: string
): Fixture[] {
  const byLeague = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const list = byLeague.get(f.tournamentId);
    if (list) list.push(f);
    else byLeague.set(f.tournamentId, [f]);
  }

  const out: Fixture[] = [];
  const leagueIds = new Set(leagues.map((l) => l.id));

  for (const league of leagues) {
    const clubs = [...new Set(league.clubIds)];
    const expected = expectedLeagueFixtureCount(clubs);
    const existing = byLeague.get(league.id) ?? [];
    if (existing.length >= expected) {
      out.push(...existing);
      continue;
    }

    const full = buildLeagueFixtures(league.id, clubs, seasonStart, 7);
    const played = existing.filter((f) => f.result);
    const playedKeys = new Set(played.map((f) => `${f.homeClubId}>${f.awayClubId}`));
    const additions = full.filter((f) => !playedKeys.has(`${f.homeClubId}>${f.awayClubId}`));
    out.push(...played, ...additions);
  }

  for (const [tid, list] of byLeague) {
    if (!leagueIds.has(tid)) out.push(...list);
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function seasonStartFromPack(pack: WorldPack, season?: string): string {
  const year = (season ?? pack.season).slice(0, 4);
  return `${year}-08-01`;
}
