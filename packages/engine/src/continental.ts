import type { Club, Fixture, TournamentFormat, WorldPack } from "./types";
import type { UefaState } from "./uefa";
import { hasContinentalAccess } from "./access";
import { slotsMapForTournament } from "./uefa";

function seasonUnit(season: string, salt: string): number {
  let h = 2166136261;
  const s = `${season}::${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

/**
 * From a guest federation pool, pick `n` clubs for this season.
 * Order changes every season so the same nicknames don't always qualify.
 */
export function pickSeasonGuests(
  pool: Club[],
  season: string,
  federationId: string,
  n: number
): Club[] {
  if (n <= 0 || pool.length === 0) return [];
  const scored = pool.map((c) => {
    const rotate = seasonUnit(season, `${federationId}:${c.id}`);
    const score = rotate * 0.72 + (c.reputation / 100) * 0.28;
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score || b.c.reputation - a.c.reputation);
  return scored.slice(0, n).map((x) => x.c);
}

function hasPlayableLeague(pack: WorldPack, federationId: string): boolean {
  return pack.leagues.some((l) => l.federationId === federationId && l.tier === 1);
}

/** Clubs entered into a continental tournament by UEFA ranking slots + reputation / rotation. */
export function selectContinentalEntrants(
  pack: WorldPack,
  tournament: TournamentFormat,
  season = pack.season,
  uefa?: UefaState
): Club[] {
  if (tournament.kind !== "continental") return [];
  const tid = tournament.id as "ucl" | "uel" | "uecl";
  if (tid !== "ucl" && tid !== "uel" && tid !== "uecl") return [];

  const dynamic = uefa != null ? slotsMapForTournament(pack, uefa, tid) : null;
  const slots = dynamic ?? tournament.slotsByFederation ?? {};
  const picked: Club[] = [];
  const used = new Set<string>();

  const federations = pack.federations
    .filter((f) => f.confederation === tournament.confederation)
    .filter((f) => hasContinentalAccess(pack, f.id, season))
    .sort((a, b) => b.coefficient - a.coefficient);

  for (const fed of federations) {
    const n = slots[fed.id] ?? 0;
    if (n <= 0) continue;

    const league = pack.leagues.find((l) => l.federationId === fed.id && l.tier === 1);
    let chosen: Club[] = [];

    if (league) {
      chosen = league.clubIds
        .map((id) => pack.clubs.find((c) => c.id === id))
        .filter((c): c is Club => !!c)
        .sort((a, b) => b.reputation - a.reputation || a.name.localeCompare(b.name))
        .slice(0, n);
    } else {
      const pool = pack.clubs.filter(
        (c) => c.federationId === fed.id && (c.guest || !hasPlayableLeague(pack, fed.id))
      );
      chosen = pickSeasonGuests(pool, season, fed.id, n);
    }

    for (const c of chosen) {
      if (used.has(c.id)) continue;
      used.add(c.id);
      picked.push(c);
    }
  }

  const softCap = tid === "ucl" ? 24 : tid === "uel" ? 20 : 16;
  let target = Math.floor(picked.length / 4) * 4;

  if (picked.length < softCap || picked.length % 4 !== 0) {
    const guestExtras = pack.clubs
      .filter(
        (c) =>
          c.guest &&
          !used.has(c.id) &&
          pack.federations.find((f) => f.id === c.federationId)?.confederation ===
            tournament.confederation &&
          hasContinentalAccess(pack, c.federationId, season)
      )
      .map((c) => ({
        c,
        score:
          seasonUnit(season, `pad:${tournament.id}:${c.id}`) * 0.7 + (c.reputation / 100) * 0.3,
      }))
      .sort((a, b) => b.score - a.score);

    for (const { c } of guestExtras) {
      if (picked.length >= softCap && picked.length % 4 === 0) break;
      picked.push(c);
      used.add(c.id);
      if (picked.length % 4 === 0 && picked.length >= 8 && picked.length >= softCap) break;
    }
    target = Math.floor(picked.length / 4) * 4;
  }

  if (target < 4) {
    const extras = pack.clubs
      .filter(
        (c) =>
          !used.has(c.id) &&
          pack.federations.find((f) => f.id === c.federationId)?.confederation ===
            tournament.confederation &&
          hasContinentalAccess(pack, c.federationId, season)
      )
      .sort((a, b) => b.reputation - a.reputation);
    for (const c of extras) {
      picked.push(c);
      used.add(c.id);
      if (picked.length >= 8 && picked.length % 4 === 0) break;
    }
    target = Math.floor(picked.length / 4) * 4;
  }

  target = Math.min(softCap, Math.floor(picked.length / 4) * 4);
  if (target < 4) target = Math.min(softCap, Math.max(4, Math.floor(picked.length / 4) * 4));
  if (target < 4) return picked.slice(0, picked.length >= 4 ? 4 : 0);

  if (picked.length <= target) return picked.slice(0, target);

  const byFed = new Map<string, Club[]>();
  for (const c of picked) {
    const list = byFed.get(c.federationId) ?? [];
    list.push(c);
    byFed.set(c.federationId, list);
  }
  const removable = [...picked].sort((a, b) => a.reputation - b.reputation);
  const keep = new Set(picked.map((c) => c.id));
  for (const c of removable) {
    if (keep.size <= target) break;
    const fedList = byFed.get(c.federationId) ?? [];
    if (fedList.length <= 1) continue;
    keep.delete(c.id);
    byFed.set(
      c.federationId,
      fedList.filter((x) => x.id !== c.id)
    );
  }
  if (keep.size > target) {
    const rest = picked.filter((c) => keep.has(c.id)).sort((a, b) => a.reputation - b.reputation);
    for (const c of rest) {
      if (keep.size <= target) break;
      keep.delete(c.id);
    }
  }

  return picked.filter((c) => keep.has(c.id));
}

/**
 * Continental group stage: split into groups of 4, single round-robin per group.
 * Dates sit on midweeks between league rounds.
 */
export function buildContinentalGroupFixtures(
  tournamentId: string,
  clubIds: string[],
  seasonStart: string,
  daysBetween = 14
): Fixture[] {
  const teams = [...clubIds];
  while (teams.length % 4 !== 0 && teams.length > 4) teams.pop();
  if (teams.length < 4) return [];

  const groups: string[][] = [];
  const groupCount = teams.length / 4;
  for (let g = 0; g < groupCount; g++) {
    groups.push(teams.slice(g * 4, g * 4 + 4));
  }

  const fixtures: Fixture[] = [];
  const start = new Date(seasonStart);
  start.setDate(start.getDate() + 21);

  const pairs = [
    [0, 1, 2, 3],
    [0, 2, 1, 3],
    [0, 3, 1, 2],
  ] as const;

  for (let round = 0; round < 3; round++) {
    const d = new Date(start);
    d.setDate(start.getDate() + round * daysBetween);
    const date = d.toISOString().slice(0, 10);
    const [a, b, c, e] = pairs[round]!;

    groups.forEach((group, gi) => {
      const m1h = group[a]!;
      const m1a = group[b]!;
      const m2h = group[c]!;
      const m2a = group[e]!;
      fixtures.push({
        id: `${tournamentId}-g${gi + 1}-r${round + 1}-${m1h}-${m1a}`,
        tournamentId,
        date,
        homeClubId: m1h,
        awayClubId: m1a,
      });
      fixtures.push({
        id: `${tournamentId}-g${gi + 1}-r${round + 1}-${m2h}-${m2a}`,
        tournamentId,
        date,
        homeClubId: m2h,
        awayClubId: m2a,
      });
    });
  }

  return fixtures.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function buildUefaContinentalFixtures(
  pack: WorldPack,
  seasonStart: string,
  uefa?: UefaState
): Fixture[] {
  const out: Fixture[] = [];
  const season = pack.season;
  const schedule: { tid: "ucl" | "uel" | "uecl"; dayOffset: number; gap: number }[] = [
    { tid: "ucl", dayOffset: 0, gap: 14 },
    { tid: "uel", dayOffset: 7, gap: 21 },
    { tid: "uecl", dayOffset: 14, gap: 21 },
  ];
  for (const { tid, dayOffset, gap } of schedule) {
    const t = pack.tournaments.find((x) => x.id === tid);
    if (!t) continue;
    const entrants = selectContinentalEntrants(pack, t, season, uefa);
    if (entrants.length < 4) continue;
    const start = new Date(seasonStart);
    start.setDate(start.getDate() + dayOffset);
    const startStr = start.toISOString().slice(0, 10);
    out.push(
      ...buildContinentalGroupFixtures(
        t.id,
        entrants.map((c) => c.id),
        startStr,
        gap
      )
    );
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Merge continental fixtures; also inject missing UECL into older saves. */
export function ensureContinentalFixtures(
  fixtures: Fixture[],
  pack: WorldPack,
  seasonStart: string,
  uefa?: UefaState
): Fixture[] {
  const existing = new Set(fixtures.map((f) => f.id));
  const hasUcl = fixtures.some((f) => f.tournamentId === "ucl");
  const hasUel = fixtures.some((f) => f.tournamentId === "uel");
  const hasUecl = fixtures.some((f) => f.tournamentId === "uecl");

  if (!hasUcl && !hasUel && !hasUecl) {
    const extra = buildUefaContinentalFixtures(pack, seasonStart, uefa).filter(
      (f) => !existing.has(f.id)
    );
    return [...fixtures, ...extra].sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
    );
  }

  if (!hasUecl) {
    const t = pack.tournaments.find((x) => x.id === "uecl");
    if (t) {
      const entrants = selectContinentalEntrants(pack, t, pack.season, uefa);
      if (entrants.length >= 4) {
        const start = new Date(seasonStart);
        start.setDate(start.getDate() + 14);
        const extra = buildContinentalGroupFixtures(
          "uecl",
          entrants.map((c) => c.id),
          start.toISOString().slice(0, 10),
          21
        ).filter((f) => !existing.has(f.id));
        fixtures = [...fixtures, ...extra].sort(
          (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
        );
      }
    }
  }

  return fixtures;
}

/** Guest clubs that qualified for any UEFA competition this season. */
export function seasonEuroGuestIds(
  pack: WorldPack,
  season = pack.season,
  uefa?: UefaState
): string[] {
  const ids = new Set<string>();
  for (const tid of ["ucl", "uel", "uecl"] as const) {
    const t = pack.tournaments.find((x) => x.id === tid);
    if (!t) continue;
    for (const c of selectContinentalEntrants(pack, t, season, uefa)) {
      if (c.guest) ids.add(c.id);
    }
  }
  return [...ids];
}
