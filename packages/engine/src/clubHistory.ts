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

const HONOUR_POOL = [
  "Чемпион страны",
  "Обладатель кубка",
  "Суперкубок",
  "Победитель еврокубка",
  "Финал еврокубка",
  "Чемпион второй лиги",
];

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

/** Stable procedural lore for a club (legends + classic results). */
export function buildClubHistory(pack: WorldPack, clubId: string): ClubHistory | null {
  const club = pack.clubs.find((c) => c.id === clubId);
  if (!club) return null;
  const rng = new Rng(hash(clubId + ":history"));
  const founded = 1895 + (hash(clubId) % 90);
  const seasonYear = parseInt(pack.season.slice(0, 4), 10) || 2025;

  const honourCount = 2 + (club.reputation >= 85 ? 3 : club.reputation >= 75 ? 2 : 1);
  const honours: string[] = [];
  const honourBag = [...HONOUR_POOL].sort(() => rng.next() - 0.5);
  for (let i = 0; i < honourCount && i < honourBag.length; i++) {
    const year = founded + 20 + rng.int(5, Math.max(6, seasonYear - founded - 5));
    honours.push(`${honourBag[i]} (${year})`);
  }

  const positions: Position[] = ["GK", "DF", "MF", "FW", "MF", "DF"];
  const legends: ClubLegend[] = [];
  for (let i = 0; i < 5; i++) {
    const pos = positions[i]!;
    const nat = club.federationId;
    const names = rollCyrillicName(nat, `${clubId}:legend:${i}`);
    const end = seasonYear - rng.int(3, 18);
    const start = end - rng.int(5, 12);
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
    const year = seasonYear - rng.int(2, 25);
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
