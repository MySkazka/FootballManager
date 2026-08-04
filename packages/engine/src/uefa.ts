import type { CareerSave, Fixture, MatchResult, WorldPack } from "./types";

/** How many domestic league places map to each UEFA competition (for table colours). */
export type EuroQualificationZones = {
  ucl: number;
  uel: number;
  uecl: number;
};

export type UefaAssociationRow = {
  federationId: string;
  name: string;
  rank: number;
  /** Sum of last 5 season coefficients. */
  total: number;
  /** Current season coefficient so far (points / clubs). */
  seasonScore: number;
  slots: EuroQualificationZones;
};

export type UefaState = {
  /** Last five finished season scores per federation (oldest → newest). */
  history: Record<string, number[]>;
  /** Live season: raw points and participating club count. */
  current: Record<string, { points: number; clubs: number }>;
};

/** Russia's last UEFA access layout before suspension (≈2021/22) — kept for reference only. */
export const RUS_LEGACY_SLOTS: EuroQualificationZones = { ucl: 2, uel: 1, uecl: 2 };

/**
 * Access-list style slots by association rank (simplified UEFA list).
 * Used both for entrant counts and league-table colour zones.
 */
export function slotsByAssociationRank(rank: number): EuroQualificationZones {
  if (rank <= 4) return { ucl: 4, uel: 2, uecl: 1 }; // ENG/ESP/GER/ITA — table uses 1–4 / 5 / 6
  if (rank === 5) return { ucl: 3, uel: 2, uecl: 1 }; // FRA
  if (rank <= 7) return { ucl: 2, uel: 2, uecl: 1 }; // POR/NED/BEL-ish
  if (rank <= 12) return { ucl: 2, uel: 1, uecl: 2 };
  if (rank <= 15) return { ucl: 1, uel: 1, uecl: 2 };
  if (rank <= 28) return { ucl: 1, uel: 1, uecl: 2 };
  if (rank <= 33) return { ucl: 1, uel: 0, uecl: 2 };
  if (rank <= 50) return { ucl: 1, uel: 0, uecl: 1 };
  return { ucl: 0, uel: 0, uecl: 1 };
}

/**
 * League table colour zones: which finishing places earn which cup.
 * Cup winners are folded into UEL/UECL counts as neighbouring league places.
 */
export function leagueTableEuroZones(
  _federationId: string,
  rank: number
): EuroQualificationZones {
  const slots = slotsByAssociationRank(rank);
  // Table legend shows league places only (cup folded into UEL/UECL band)
  if (rank <= 4) return { ucl: 4, uel: 1, uecl: 1 }; // 1–4 ЛЧ, 5 ЛЕ, 6 ЛК
  if (rank === 5) return { ucl: 3, uel: 1, uecl: 1 }; // 1–3 / 4 / 5
  if (rank <= 7) return { ucl: 2, uel: 1, uecl: 1 };
  return {
    ucl: slots.ucl,
    uel: slots.uel,
    uecl: slots.uecl,
  };
}

export function zoneForPlace(
  place: number,
  zones: EuroQualificationZones
): "ucl" | "uel" | "uecl" | null {
  if (place <= 0) return null;
  if (place <= zones.ucl) return "ucl";
  if (place <= zones.ucl + zones.uel) return "uel";
  if (place <= zones.ucl + zones.uel + zones.uecl) return "uecl";
  return null;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Seed rolling coefficients from pack federation.coefficient totals. */
export function seedUefaState(pack: WorldPack): UefaState {
  const history: UefaState["history"] = {};
  const current: UefaState["current"] = {};
  for (const f of pack.federations) {
    if (f.confederation !== "UEFA") continue;
    const total = Math.max(1, f.coefficient);
    // Spread total across 5 fictional prior seasons (newer seasons slightly stronger)
    const weights = [0.14, 0.17, 0.2, 0.23, 0.26];
    history[f.id] = weights.map((w) => round3(total * w));
    current[f.id] = { points: 0, clubs: 0 };
  }
  return { history, current };
}

export function ensureUefaState(pack: WorldPack, save: CareerSave): UefaState {
  if (save.uefa?.history && save.uefa?.current) {
    // Fill any new federations from pack upgrades
    const seeded = seedUefaState(pack);
    for (const f of pack.federations) {
      if (f.confederation !== "UEFA") continue;
      if (!save.uefa.history[f.id]) save.uefa.history[f.id] = seeded.history[f.id]!;
      if (!save.uefa.current[f.id]) save.uefa.current[f.id] = { points: 0, clubs: 0 };
    }
    return save.uefa;
  }
  const state = seedUefaState(pack);
  save.uefa = state;
  return state;
}

export function associationTotal(state: UefaState, federationId: string): number {
  const hist = state.history[federationId] ?? [];
  const cur = state.current[federationId];
  const seasonLive =
    cur && cur.clubs > 0 ? round3(cur.points / cur.clubs) : 0;
  // Live season is preview only; ranking uses finished 5 seasons
  void seasonLive;
  return round3(hist.reduce((s, x) => s + x, 0));
}

export function currentSeasonCoefficient(state: UefaState, federationId: string): number {
  const cur = state.current[federationId];
  if (!cur || cur.clubs <= 0) return 0;
  return round3(cur.points / cur.clubs);
}

export function uefaRanking(pack: WorldPack, state: UefaState): UefaAssociationRow[] {
  const feds = pack.federations.filter((f) => f.confederation === "UEFA");
  const rows = feds.map((f) => {
    const total = associationTotal(state, f.id);
    return { federationId: f.id, name: f.name, total, seasonScore: currentSeasonCoefficient(state, f.id) };
  });
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return rows.map((r, i) => {
    const rank = i + 1;
    const slots = slotsByAssociationRank(rank);
    return { ...r, rank, slots };
  });
}

export function slotsMapForTournament(
  pack: WorldPack,
  state: UefaState,
  tournamentId: "ucl" | "uel" | "uecl"
): Record<string, number> {
  const ranking = uefaRanking(pack, state);
  const out: Record<string, number> = {};
  for (const row of ranking) {
    const n = row.slots[tournamentId];
    if (n > 0) out[row.federationId] = n;
  }
  return out;
}

/** Register how many clubs from each federation are in UEFA this season. */
export function registerEuroParticipants(
  state: UefaState,
  pack: WorldPack,
  fixtures: Fixture[]
): void {
  const clubs = new Set<string>();
  for (const f of fixtures) {
    if (f.tournamentId !== "ucl" && f.tournamentId !== "uel" && f.tournamentId !== "uecl") {
      continue;
    }
    clubs.add(f.homeClubId);
    clubs.add(f.awayClubId);
  }
  const byFed = new Map<string, number>();
  for (const id of clubs) {
    const club = pack.clubs.find((c) => c.id === id);
    if (!club) continue;
    byFed.set(club.federationId, (byFed.get(club.federationId) ?? 0) + 1);
  }
  for (const [fed, n] of byFed) {
    if (!state.current[fed]) state.current[fed] = { points: 0, clubs: 0 };
    state.current[fed]!.clubs = Math.max(state.current[fed]!.clubs, n);
  }
}

/**
 * Award association coefficient points after a UEFA match.
 * Win = 2, draw = 1 (each club), then season score = points / clubs.
 */
export function applyUefaMatchPoints(
  state: UefaState,
  pack: WorldPack,
  fixture: Fixture,
  result: MatchResult
): void {
  if (
    fixture.tournamentId !== "ucl" &&
    fixture.tournamentId !== "uel" &&
    fixture.tournamentId !== "uecl"
  ) {
    return;
  }
  const home = pack.clubs.find((c) => c.id === fixture.homeClubId);
  const away = pack.clubs.find((c) => c.id === fixture.awayClubId);
  if (!home || !away) return;

  const award = (fed: string, pts: number) => {
    if (!state.current[fed]) state.current[fed] = { points: 0, clubs: 0 };
    state.current[fed]!.points += pts;
  };

  if (result.homeGoals > result.awayGoals) {
    award(home.federationId, 2);
  } else if (result.awayGoals > result.homeGoals) {
    award(away.federationId, 2);
  } else {
    award(home.federationId, 1);
    award(away.federationId, 1);
  }

  // Small bonus for UCL nights
  if (fixture.tournamentId === "ucl") {
    if (result.homeGoals > result.awayGoals) award(home.federationId, 0.5);
    else if (result.awayGoals > result.homeGoals) award(away.federationId, 0.5);
  }
}

/** Roll current season into history (call at season end). */
export function finalizeUefaSeason(state: UefaState, pack: WorldPack): void {
  for (const f of pack.federations) {
    if (f.confederation !== "UEFA") continue;
    const score = currentSeasonCoefficient(state, f.id);
    const hist = state.history[f.id] ?? [0, 0, 0, 0, 0];
    const next = [...hist, score].slice(-5);
    while (next.length < 5) next.unshift(0);
    state.history[f.id] = next.map(round3);
    state.current[f.id] = { points: 0, clubs: 0 };
  }
}

export function federationRank(
  pack: WorldPack,
  state: UefaState,
  federationId: string
): number {
  return uefaRanking(pack, state).find((r) => r.federationId === federationId)?.rank ?? 99;
}

export function legendLabels(zones: EuroQualificationZones): {
  zone: "ucl" | "uel" | "uecl";
  label: string;
  places: string;
}[] {
  const out: { zone: "ucl" | "uel" | "uecl"; label: string; places: string }[] = [];
  let from = 1;
  if (zones.ucl > 0) {
    const to = from + zones.ucl - 1;
    out.push({
      zone: "ucl",
      label: "Лига чемпионов",
      places: from === to ? `${from}-е` : `${from}–${to}-е`,
    });
    from = to + 1;
  }
  if (zones.uel > 0) {
    const to = from + zones.uel - 1;
    out.push({
      zone: "uel",
      label: "Лига Европы",
      places: from === to ? `${from}-е` : `${from}–${to}-е`,
    });
    from = to + 1;
  }
  if (zones.uecl > 0) {
    const to = from + zones.uecl - 1;
    out.push({
      zone: "uecl",
      label: "Лига конференций",
      places: from === to ? `${from}-е` : `${from}–${to}-е`,
    });
  }
  return out;
}
