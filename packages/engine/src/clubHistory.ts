import { rollCyrillicName } from "./players";
import { primaryPosition, POSITION_LABEL } from "./labels";
import type { CareerSave, Club, Fixture, Player, Position, WorldPack } from "./types";
import { Rng } from "./rng";

export interface ClubLegend {
  id: string;
  firstName: string;
  lastName: string;
  years: string;
  position: Position;
  positionLabel: string;
  peakOverall: number;
  capsNote: string;
}

export interface ClassicMatch {
  id: string;
  season: string;
  competition: string;
  homeName: string;
  awayName: string;
  score: string;
  note: string;
}

export interface ClubHistory {
  clubId: string;
  founded: number;
  motto: string;
  honours: string[];
  legends: ClubLegend[];
  classicMatches: ClassicMatch[];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

const MOTTOS = [
  "Сила в характере",
  "Город и клуб — одно целое",
  "Через борьбу к славе",
  "Традиции сильнее моды",
  "Играть до конца",
];

/** Competitions that must be unique per year within a federation. */
const FED_HONOURS = ["Чемпион страны", "Обладатель кубка", "Суперкубок"] as const;
/** Continental trophies — unique per confederation per year. */
const EURO_HONOURS = ["Победитель еврокубка", "Финал еврокубка"] as const;
/** Lower-tier title — still unique per federation/year, aimed at mid clubs. */
const SECOND_HONOUR = "Чемпион второй лиги";

const LEGEND_NOTES = [
  "Символ эпохи и капитан команды",
  "Лучший бомбардир в истории клуба своего поколения",
  "Легенда обороны, кумир трибун",
  "Воспитанник, ставший лицом клуба",
  "Лидер раздевалки и образец профессионализма",
  "Герой решающих матчей",
];

const CLASSIC_NOTES = [
  "Матч, который до сих пор вспоминают болельщики",
  "Драматичная развязка в концовке",
  "При полном стадионе и яростном прессинге",
  "Переломный вечер в истории клуба",
  "Классика дерби на века",
];

function pickOpponents(pack: WorldPack, club: Club, rng: Rng, n: number): Club[] {
  const sameFed = pack.clubs.filter((c) => c.federationId === club.federationId && c.id !== club.id);
  const pool = sameFed.length >= n ? sameFed : pack.clubs.filter((c) => c.id !== club.id);
  const shuffled = [...pool].sort(() => rng.next() - 0.5);
  return shuffled.slice(0, n);
}

function confederationOf(pack: WorldPack, federationId: string): string {
  return pack.federations.find((f) => f.id === federationId)?.confederation ?? "UEFA";
}

/** How many major domestic trophies a club "deserves" from reputation alone. */
function domesticTrophyBudget(rep: number): number {
  if (rep >= 92) return 6;
  if (rep >= 88) return 5;
  if (rep >= 84) return 4;
  if (rep >= 80) return 3;
  if (rep >= 76) return 2;
  if (rep >= 72) return 1;
  return 0;
}

function euroTrophyBudget(rep: number): number {
  if (rep >= 93) return 3;
  if (rep >= 88) return 2;
  if (rep >= 84) return 1;
  return 0;
}

function secondDivBudget(rep: number): number {
  if (rep >= 80) return 0;
  if (rep >= 68) return 1;
  if (rep >= 60) return 1;
  return 0;
}

type HonourSlot = { competition: string; year: number; clubId: string };

/**
 * Global honour ledger: at most one club per (competition scope, year).
 * Top clubs soak up domestic/euro titles; mid/low clubs stay sparse or empty.
 */
function assignWorldHonours(pack: WorldPack, latestCompletedYear: number): Map<string, string[]> {
  const rng = new Rng(hash(`world-honours:${pack.season}:${pack.clubs.length}`));
  const byClub = new Map<string, string[]>();
  for (const c of pack.clubs) byClub.set(c.id, []);

  const earliest = Math.min(latestCompletedYear - 35, latestCompletedYear - 10);

  const feds = [...new Set(pack.clubs.map((c) => c.federationId))];
  for (const fed of feds) {
    const clubs = pack.clubs
      .filter((c) => c.federationId === fed && !c.guest)
      .sort((a, b) => b.reputation - a.reputation);
    if (!clubs.length) continue;

    for (const competition of FED_HONOURS) {
      const years = yearsRange(earliest, latestCompletedYear);
      const usedYears = new Set<number>();
      // Only top clubs compete for major domestic silverware
      const topCut = competition === "Суперкубок" ? Math.min(4, clubs.length) : Math.min(6, clubs.length);
      const pool = clubs.filter((c, i) => i < topCut || c.reputation >= 78);

      for (const club of pool) {
        let n = domesticTrophyBudget(club.reputation);
        if (competition === "Суперкубок") n = Math.min(n, Math.max(0, n - 1));
        if (competition === "Обладатель кубка") n = Math.max(0, Math.ceil(n * 0.85));
        for (let i = 0; i < n; i++) {
          const available = years.filter((y) => !usedYears.has(y));
          if (!available.length) break;
          const year = pickYear(available, rng, club.reputation);
          usedYears.add(year);
          pushHonour(byClub, club.id, competition, year);
        }
      }
    }

    // Second division — sparse, unique years, mid/low clubs only
    const secondPool = clubs.filter((c) => c.reputation < 78);
    const secondYears = yearsRange(earliest, latestCompletedYear);
    const usedSecond = new Set<number>();
    for (const club of [...secondPool].sort((a, b) => a.reputation - b.reputation)) {
      const n = secondDivBudget(club.reputation);
      for (let i = 0; i < n; i++) {
        const available = secondYears.filter((y) => !usedSecond.has(y));
        if (!available.length) break;
        const year = pickYear(available, rng, 60);
        usedSecond.add(year);
        pushHonour(byClub, club.id, SECOND_HONOUR, year);
      }
    }
  }

  // Continental: unique per confederation + competition + year
  const confeds = [...new Set(pack.federations.map((f) => f.confederation))];
  for (const conf of confeds) {
    const clubs = pack.clubs
      .filter((c) => confederationOf(pack, c.federationId) === conf)
      .sort((a, b) => b.reputation - a.reputation);
    if (!clubs.length) continue;
    const elite = clubs.filter((c) => c.reputation >= 84).slice(0, 12);
    const pool = elite.length >= 3 ? elite : clubs.slice(0, Math.min(8, clubs.length));

    for (const competition of EURO_HONOURS) {
      const years = yearsRange(Math.max(earliest, latestCompletedYear - 28), latestCompletedYear);
      const usedYears = new Set<number>();
      for (const club of pool) {
        let n = euroTrophyBudget(club.reputation);
        if (competition === "Финал еврокубка") n = Math.min(4, n + (club.reputation >= 88 ? 1 : 0));
        for (let i = 0; i < n; i++) {
          const available = years.filter((y) => !usedYears.has(y));
          if (!available.length) break;
          const year = pickYear(available, rng, club.reputation);
          usedYears.add(year);
          pushHonour(byClub, club.id, competition, year);
        }
      }
    }
  }

  // Sort each club's list by year desc for display
  for (const [id, list] of byClub) {
    list.sort((a, b) => {
      const ya = Number(a.match(/\((\d{4})\)\s*$/)?.[1] ?? 0);
      const yb = Number(b.match(/\((\d{4})\)\s*$/)?.[1] ?? 0);
      return yb - ya || a.localeCompare(b);
    });
    byClub.set(id, list);
  }

  return byClub;
}

function yearsRange(from: number, to: number): number[] {
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out;
}

/** Prefer recent years for high-rep clubs. */
function pickYear(available: number[], rng: Rng, reputation: number): number {
  if (available.length === 1) return available[0]!;
  const sorted = [...available].sort((a, b) => b - a);
  const recentBias = reputation >= 88 ? 0.55 : reputation >= 80 ? 0.4 : 0.25;
  if (rng.next() < recentBias) {
    const top = sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.35)));
    return rng.pick(top);
  }
  return rng.pick(sorted);
}

function pushHonour(
  byClub: Map<string, string[]>,
  clubId: string,
  competition: string,
  year: number
): void {
  const list = byClub.get(clubId) ?? [];
  list.push(`${competition} (${year})`);
  byClub.set(clubId, list);
}

/** Russian “N-кратный обладатель” for 2+ wins; empty for a single win. */
export function timesHolderPhrase(count: number): string {
  if (count <= 1) return "";
  return `${count}-кратный обладатель`;
}

/**
 * Collapse year-per-row honour strings into one line per competition.
 * 1 win: `"Чемпион страны (2001)"`
 * 2+: `"Чемпион страны. 3-кратный обладатель (2001, 2004, 2020)"`
 */
export function groupHonoursForDisplay(rawHonours: string[]): string[] {
  const byComp = new Map<string, number[]>();
  for (const h of rawHonours) {
    const m = h.match(/^(.*) \((\d{4})\)$/);
    if (!m) {
      // Preserve unexpected strings as-is
      if (!byComp.has(h)) byComp.set(h, []);
      continue;
    }
    const competition = m[1]!;
    const year = Number(m[2]);
    const years = byComp.get(competition) ?? [];
    if (!years.includes(year)) years.push(year);
    byComp.set(competition, years);
  }

  const lines: { competition: string; years: number[]; line: string }[] = [];
  for (const [competition, years] of byComp) {
    const sorted = [...years].sort((a, b) => a - b);
    let line = competition;
    if (sorted.length === 1) {
      line = `${competition} (${sorted[0]})`;
    } else if (sorted.length > 1) {
      line = `${competition}. ${timesHolderPhrase(sorted.length)} (${sorted.join(", ")})`;
    }
    lines.push({ competition, years: sorted, line });
  }

  // Most recent win first (same visual priority as the old year-desc list)
  lines.sort((a, b) => {
    const ya = a.years[a.years.length - 1] ?? 0;
    const yb = b.years[b.years.length - 1] ?? 0;
    return yb - ya || a.competition.localeCompare(b.competition);
  });
  return lines.map((l) => l.line);
}

const honoursCache = new WeakMap<WorldPack, Map<string, string[]>>();

function honoursForPack(pack: WorldPack, latestCompletedYear: number): Map<string, string[]> {
  let cached = honoursCache.get(pack);
  if (!cached) {
    cached = assignWorldHonours(pack, latestCompletedYear);
    honoursCache.set(pack, cached);
  }
  return cached;
}

/** Expose for tests — uniqueness / sparsity checks. */
export function buildWorldHonoursLedger(
  pack: WorldPack
): { byClub: Map<string, string[]>; slots: HonourSlot[] } {
  const seasonYear = parseInt(pack.season.slice(0, 4), 10) || 2025;
  const latestCompletedYear = seasonYear - 1;
  const byClub = assignWorldHonours(pack, latestCompletedYear);
  const slots: HonourSlot[] = [];
  for (const [clubId, list] of byClub) {
    for (const h of list) {
      const m = h.match(/^(.*) \((\d{4})\)$/);
      if (m) slots.push({ competition: m[1]!, year: Number(m[2]), clubId });
    }
  }
  return { byClub, slots };
}

/** Stable procedural lore for a club (legends + classic results). */
export function buildClubHistory(pack: WorldPack, clubId: string): ClubHistory | null {
  const club = pack.clubs.find((c) => c.id === clubId);
  if (!club) return null;
  const rng = new Rng(hash(clubId + ":history"));
  const founded = 1895 + (hash(clubId) % 90);
  const seasonYear = parseInt(pack.season.slice(0, 4), 10) || 2025;
  /** Pack season e.g. 2025/26 is unfinished — trophies only through the prior year. */
  const latestCompletedYear = seasonYear - 1;

  const worldHonours = honoursForPack(pack, latestCompletedYear);
  const rawHonours = (worldHonours.get(clubId) ?? []).filter((h) => {
    const year = Number(h.match(/\((\d{4})\)\s*$/)?.[1] ?? 0);
    return year >= founded + 5 && year <= latestCompletedYear;
  });
  const honours = groupHonoursForDisplay(rawHonours);

  const positions: Position[] = ["GK", "DF", "MF", "FW", "MF", "DF"];
  const legends: ClubLegend[] = [];
  for (let i = 0; i < 5; i++) {
    const pos = positions[i]!;
    const nat = club.federationId;
    const names = rollCyrillicName(nat, `${clubId}:legend:${i}`);
    const end = Math.min(latestCompletedYear, seasonYear - rng.int(3, 18));
    const start = Math.max(founded, end - rng.int(5, 12));
    legends.push({
      id: `${clubId}-legend-${i}`,
      firstName: names.firstName,
      lastName: names.lastName,
      years: `${start}–${end}`,
      position: pos,
      positionLabel: POSITION_LABEL[pos],
      peakOverall: Math.min(94, 72 + Math.floor(club.reputation / 5) + rng.int(0, 8)),
      capsNote: rng.pick(LEGEND_NOTES),
    });
  }

  const opps = pickOpponents(pack, club, rng, 4);
  const comps = ["Чемпионат", "Кубок", "Еврокубок", "Суперкубок"];
  const classicMatches: ClassicMatch[] = opps.map((opp, i) => {
    const homeFirst = i % 2 === 0;
    const hg = rng.int(1, 4);
    const ag = rng.int(0, 3);
    const year = Math.min(latestCompletedYear - 1, seasonYear - rng.int(2, 25));
    return {
      id: `${clubId}-classic-${i}`,
      season: `${year}/${String(year + 1).slice(2)}`,
      competition: comps[i % comps.length]!,
      homeName: homeFirst ? club.name : opp.name,
      awayName: homeFirst ? opp.name : club.name,
      score: homeFirst ? `${hg}:${ag}` : `${ag}:${hg}`,
      note: rng.pick(CLASSIC_NOTES),
    };
  });

  return {
    clubId,
    founded,
    motto: rng.pick(MOTTOS),
    honours,
    legends,
    classicMatches,
  };
}

/** Career-era legends: high-impact players who left or retired from this club. */
export function careerLegendsForClub(save: CareerSave, clubId: string): ClubLegend[] {
  const out: ClubLegend[] = [];
  // Current stars still at the club (living legends in the making)
  const stars = save.players
    .filter((p) => p.clubId === clubId && p.overall >= 82)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 3);
  for (const p of stars) {
    out.push(playerToLivingLegend(p, save.season));
  }
  return out;
}

function playerToLivingLegend(p: Player, season: string): ClubLegend {
  const pos = primaryPosition(p);
  return {
    id: `living-${p.id}`,
    firstName: p.firstName,
    lastName: p.lastName,
    years: `с ${season}`,
    position: pos,
    positionLabel: POSITION_LABEL[pos],
    peakOverall: Math.max(p.overall, p.potential - 2),
    capsNote: "Действующая звезда состава",
  };
}

export interface PlayedMatchRow {
  id: string;
  date: string;
  competition: string;
  homeName: string;
  awayName: string;
  score: string;
  isHome: boolean;
  won: boolean;
  drawn: boolean;
}

export function clubPlayedMatches(
  pack: WorldPack,
  save: CareerSave,
  clubId: string,
  limit = 40
): PlayedMatchRow[] {
  const nameOf = (id: string) => pack.clubs.find((c) => c.id === id)?.name ?? id;
  const compOf = (tid: string) => {
    const league = pack.leagues.find((l) => l.id === tid);
    if (league) return league.name;
    const cup = pack.tournaments.find((t) => t.id === tid);
    return cup?.name ?? tid;
  };

  return save.fixtures
    .filter(
      (f) =>
        f.result && (f.homeClubId === clubId || f.awayClubId === clubId)
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((f) => {
      const isHome = f.homeClubId === clubId;
      const hg = f.result!.homeGoals;
      const ag = f.result!.awayGoals;
      const gf = isHome ? hg : ag;
      const ga = isHome ? ag : hg;
      return {
        id: f.id,
        date: f.date,
        competition: compOf(f.tournamentId),
        homeName: nameOf(f.homeClubId),
        awayName: nameOf(f.awayClubId),
        score: `${hg}:${ag}`,
        isHome,
        won: gf > ga,
        drawn: gf === ga,
      };
    });
}

export function upcomingClubEuroFixtures(
  pack: WorldPack,
  save: CareerSave,
  clubId: string
): Fixture[] {
  return save.fixtures
    .filter(
      (f) =>
        !f.result &&
        (f.tournamentId === "ucl" || f.tournamentId === "uel" || f.tournamentId === "uecl") &&
        (f.homeClubId === clubId || f.awayClubId === clubId)
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}
