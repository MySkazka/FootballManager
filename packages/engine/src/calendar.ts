import type { CareerSave, Fixture, WorldPack } from "./types";

const EURO_IDS = new Set(["ucl", "uel", "uecl"]);

export function isEuroTournament(tournamentId: string): boolean {
  return EURO_IDS.has(tournamentId);
}

/** All fixtures for a domestic league (championship), sorted by date. */
export function listLeagueCalendar(
  save: CareerSave,
  leagueId: string,
  opts?: { clubId?: string; upcomingOnly?: boolean }
): Fixture[] {
  return save.fixtures
    .filter((f) => {
      if (f.tournamentId !== leagueId) return false;
      if (opts?.upcomingOnly && f.result) return false;
      if (
        opts?.clubId &&
        f.homeClubId !== opts.clubId &&
        f.awayClubId !== opts.clubId
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Continental cup fixtures (UCL / UEL / UECL), sorted by date. */
export function listEuroCalendar(
  save: CareerSave,
  opts?: {
    tournamentId?: "ucl" | "uel" | "uecl" | "all";
    clubId?: string;
    upcomingOnly?: boolean;
  }
): Fixture[] {
  const tid = opts?.tournamentId ?? "all";
  return save.fixtures
    .filter((f) => {
      if (tid === "all" ? !isEuroTournament(f.tournamentId) : f.tournamentId !== tid) {
        return false;
      }
      if (opts?.upcomingOnly && f.result) return false;
      if (
        opts?.clubId &&
        f.homeClubId !== opts.clubId &&
        f.awayClubId !== opts.clubId
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export type CalendarMatchday = {
  date: string;
  fixtures: Fixture[];
};

/** Group fixtures into matchdays (same date). */
export function groupFixturesByDate(fixtures: Fixture[]): CalendarMatchday[] {
  const map = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const list = map.get(f.date);
    if (list) list.push(f);
    else map.set(f.date, [f]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      fixtures: list.sort((a, b) => a.id.localeCompare(b.id)),
    }));
}

export function tournamentDisplayName(pack: WorldPack, tournamentId: string): string {
  const league = pack.leagues.find((l) => l.id === tournamentId);
  if (league) return league.name;
  const cup = pack.tournaments.find((t) => t.id === tournamentId);
  return cup?.name ?? tournamentId;
}
