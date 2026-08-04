import { computeOverall, primaryPosition } from "./labels";
import {
  recomputeMarketValue,
  rollBody,
  rollCyrillicName,
  rollNationality,
  rollRolesAndFoot,
} from "./players";
import { assignSquadPortraits, portraitIdForPlayer } from "./portraits";
import { Rng } from "./rng";
import { defaultTactics } from "./tactics";
import type {
  CareerSave,
  NewsItem,
  Player,
  PlayerAttributes,
  Position,
  WorldPack,
} from "./types";

function clampAttr(v: number): number {
  return Math.max(25, Math.min(95, Math.round(v)));
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/** Age after which the player retires at season end (birthday / season tick). */
export function defaultRetirementAge(player: Pick<Player, "id" | "positions" | "preferredRole">): number {
  const pos = primaryPosition(player as Player);
  const rng = new Rng(hashSeed(player.id + ":retire"));
  if (pos === "GK") return rng.int(37, 40);
  if (pos === "DF") return rng.int(35, 38);
  if (pos === "MF") return rng.int(34, 37);
  return rng.int(33, 36); // FW often earlier
}

export function ensureRetirementAge(player: Player): number {
  if (player.retirementAge && player.retirementAge >= 30 && player.retirementAge <= 42) {
    return player.retirementAge;
  }
  player.retirementAge = defaultRetirementAge(player);
  return player.retirementAge;
}

/** This championship is the player's final season (then they retire). */
export function isLastCareerSeason(player: Player): boolean {
  const retireAt = ensureRetirementAge(player);
  return player.age >= retireAt - 1;
}

export function willRetireAfterSeason(player: Player): boolean {
  const retireAt = ensureRetirementAge(player);
  return player.age + 1 >= retireAt;
}

function bumpAttrs(player: Player, delta: number, keys: (keyof PlayerAttributes)[]): void {
  for (const k of keys) {
    player.attributes[k] = clampAttr(player.attributes[k] + delta);
  }
}

/** Age-related overall decline — sharper after 30, steep after 33. */
export function applyAgingDecline(player: Player): void {
  const age = player.age;
  const pos = primaryPosition(player);
  const physicalKeys: (keyof PlayerAttributes)[] =
    pos === "GK"
      ? ["goalkeeping", "physical", "pace"]
      : ["pace", "physical", "dribbling"];
  const skillKeys: (keyof PlayerAttributes)[] =
    pos === "GK"
      ? ["passing"]
      : pos === "DF"
        ? ["defending", "passing"]
        : pos === "MF"
          ? ["passing", "shooting"]
          : ["shooting", "passing"];

  let physDrop = 0;
  let skillDrop = 0;
  if (age >= 36) {
    physDrop = 3;
    skillDrop = 2;
  } else if (age >= 34) {
    physDrop = 2;
    skillDrop = 1;
  } else if (age >= 32) {
    physDrop = 2;
    skillDrop = age >= 33 ? 1 : 0;
  } else if (age >= 30) {
    physDrop = 1;
    skillDrop = 0;
  }

  if (physDrop) bumpAttrs(player, -physDrop, physicalKeys);
  if (skillDrop) bumpAttrs(player, -skillDrop, skillKeys);

  // Potential slowly closes with age
  if (age >= 30) {
    player.potential = Math.max(player.overall, player.potential - (age >= 33 ? 2 : 1));
  }

  const recomputed = computeOverall(pos, player.attributes);
  const floor = age >= 35 ? 48 : age >= 32 ? 52 : 55;
  const next = Math.max(floor, Math.min(player.potential, recomputed));
  // Cap seasonal drop
  player.overall = Math.max(player.overall - 4, Math.min(player.overall, next));
  if (age >= 32) {
    player.overall = Math.min(player.overall, next);
  }
}

export interface SeasonAgingResult {
  retired: Player[];
  lastSeasonWarnings: Player[];
}

/**
 * End of season: age +1, decline, retire those who hit retirement age (any club).
 */
export function applySeasonAging(save: CareerSave): SeasonAgingResult {
  const retired: Player[] = [];
  const remaining: Player[] = [];

  for (const p of save.players) {
    ensureRetirementAge(p);
    p.age += 1;
    applyAgingDecline(p);
    p.marketValue = recomputeMarketValue(p, save.playerStats?.[p.id] ?? null);

    if (p.age >= (p.retirementAge ?? 36)) {
      retired.push({ ...p });
      continue;
    }
    remaining.push(p);
  }

  const retiredIds = new Set(retired.map((p) => p.id));
  save.players = remaining;

  // Clean user lineup
  if (save.userTactics?.lineup?.length) {
    save.userTactics = {
      ...save.userTactics,
      lineup: save.userTactics.lineup.filter((id) => !retiredIds.has(id)),
    };
    if (save.userTactics.lineup.length < 11) {
      save.userTactics = defaultTactics(save.players, save.clubId, save.userTactics.formation);
    }
  }

  // Drop stats / suspensions for retirees
  for (const id of retiredIds) {
    delete save.playerStats[id];
    if (save.suspensions) delete save.suspensions[id];
  }

  const lastSeasonWarnings = save.players.filter(isLastCareerSeason);
  return { retired, lastSeasonWarnings };
}

export function retirementNews(date: string, retired: Player[], pack: WorldPack): NewsItem[] {
  return retired.slice(0, 12).map((p) => {
    const club = p.clubId ? pack.clubs.find((c) => c.id === p.clubId) : undefined;
    return {
      id: `news-retire-${p.id}-${date}`,
      date,
      category: "insight" as const,
      headline: `${p.firstName} ${p.lastName} завершил карьеру`,
      body: club
        ? `В возрасте ${p.age} лет футболист повесил бутсы на гвоздь. Последний клуб — «${club.name}».`
        : `В возрасте ${p.age} лет футболист завершил профессиональную карьеру.`,
      relatedClubIds: p.clubId ? [p.clubId] : undefined,
      relatedPlayerIds: [p.id],
    };
  });
}

export function lastSeasonWarningNews(
  date: string,
  players: Player[],
  userClubId: string
): NewsItem | null {
  const mine = players.filter((p) => p.clubId === userClubId && isLastCareerSeason(p));
  if (!mine.length) return null;
  const names = mine
    .slice(0, 5)
    .map((p) => `${p.firstName} ${p.lastName} (${p.age})`)
    .join(", ");
  const more = mine.length > 5 ? ` и ещё ${mine.length - 5}` : "";
  return {
    id: `news-last-season-${userClubId}-${date}`,
    date,
    category: "insight",
    headline: "Последний сезон в карьере",
    body: `Перед стартом чемпионата штаб отмечает: для ${names}${more} этот сезон — финальный. Даже при трансфере игрок завершит карьеру по его окончании.`,
    relatedClubIds: [userClubId],
    relatedPlayerIds: mine.map((p) => p.id),
  };
}

function rollYouthAttrs(position: Position, base: number, rng: Rng): PlayerAttributes {
  const spread = () => Math.max(35, Math.min(78, base + rng.int(-8, 6)));
  const attrs: PlayerAttributes = {
    pace: spread(),
    shooting: spread(),
    passing: spread(),
    dribbling: spread(),
    defending: spread(),
    physical: spread(),
    goalkeeping: position === "GK" ? Math.max(50, base + rng.int(-4, 8)) : rng.int(8, 22),
  };
  if (position === "GK") {
    attrs.pace = Math.max(30, attrs.pace - 12);
    attrs.shooting = Math.max(25, attrs.shooting - 18);
  }
  if (position === "FW") attrs.shooting = Math.min(82, attrs.shooting + 6);
  if (position === "DF") attrs.defending = Math.min(82, attrs.defending + 6);
  if (position === "MF") attrs.passing = Math.min(82, attrs.passing + 5);
  return attrs;
}

/**
 * Youth academy graduates offered to the first team after the season.
 */
export function generateAcademyProspects(
  pack: WorldPack,
  save: CareerSave,
  clubId: string,
  rng: Rng,
  count = 3
): Player[] {
  const club = pack.clubs.find((c) => c.id === clubId);
  if (!club) return [];

  const base = 48 + Math.floor(club.reputation / 4);
  const pool: Position[] = ["GK", "DF", "DF", "MF", "MF", "FW", "FW"];
  const needs: Position[] = [];
  const bag = [...pool];
  while (needs.length < count && bag.length) {
    const idx = rng.int(0, bag.length - 1);
    needs.push(bag.splice(idx, 1)[0]!);
  }
  const nationalities = needs.map(() =>
    rng.chance(0.75) ? club.federationId : rollNationality(club.federationId, rng)
  );
  const portraits = assignSquadPortraits(nationalities, rng);
  const out: Player[] = [];

  for (let i = 0; i < needs.length; i++) {
    const position = needs[i]!;
    const nationalityId = nationalities[i]!;
    const attributes = rollYouthAttrs(position, base, rng);
    const overall = computeOverall(position, attributes);
    const age = rng.int(16, 19);
    const potential = Math.min(92, overall + rng.int(8, 18));
    const { firstName, lastName } = rollCyrillicName(nationalityId, `${clubId}:academy:${save.season}:${i}`);
    const { height, weight } = rollBody(position, rng);
    const { roles, preferredRole, preferredFoot } = rollRolesAndFoot(position, rng);
    const id = `${clubId}-academy-${save.season.replace("/", "")}-${i + 1}-${rng.int(100, 999)}`;
    const draft: Player = {
      id,
      firstName,
      lastName,
      age,
      nationalityId,
      clubId: null,
      positions: [position],
      roles,
      preferredRole,
      preferredFoot,
      attributes,
      traits: [],
      overall,
      potential,
      height,
      weight,
      marketValue: 0,
      portraitId: portraits[i] ?? portraitIdForPlayer(nationalityId, id),
      retirementAge: defaultRetirementAge({ id, positions: [position], preferredRole }),
    };
    draft.marketValue = recomputeMarketValue(draft, null);
    out.push(draft);
  }
  return out;
}

export function acceptAcademyProspect(save: CareerSave, playerId: string): CareerSave {
  const next = structuredClone(save) as CareerSave;
  const pending = next.pendingAcademy ?? [];
  const idx = pending.findIndex((p) => p.id === playerId);
  if (idx < 0) return save;
  const [prospect] = pending.splice(idx, 1);
  if (!prospect) return save;
  prospect.clubId = next.clubId;
  next.players.push(prospect);
  next.pendingAcademy = pending;
  if (!next.seasonStartMarketValues) next.seasonStartMarketValues = {};
  next.seasonStartMarketValues[prospect.id] = Math.max(
    0.1,
    Math.round((prospect.marketValue ?? 0.1) * 10) / 10
  );
  next.news.unshift({
    id: `news-academy-${prospect.id}`,
    date: next.currentDate,
    category: "transfer",
    headline: `${prospect.firstName} ${prospect.lastName} из академии → основа`,
    body: `Воспитанник спортивной школы (${prospect.age} лет, OVR ${prospect.overall}, пот. ${prospect.potential}) переведён в первую команду.`,
    relatedClubIds: [next.clubId],
    relatedPlayerIds: [prospect.id],
  });
  return next;
}

export function rejectAcademyProspect(save: CareerSave, playerId: string): CareerSave {
  const next = structuredClone(save) as CareerSave;
  next.pendingAcademy = (next.pendingAcademy ?? []).filter((p) => p.id !== playerId);
  return next;
}

export function clearAcademyPending(save: CareerSave): CareerSave {
  const next = structuredClone(save) as CareerSave;
  next.pendingAcademy = [];
  return next;
}
