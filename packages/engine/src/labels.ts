import type { Club, Player, PlayerAttributes, PlayerTrait, Position, PreferredFoot, RoleId } from "./types";

export const POSITION_LABEL: Record<Position, string> = {
  GK: "ВР",
  DF: "ЗЩ",
  MF: "ПЗ",
  FW: "НАП",
};

export const ROLE_LABEL: Record<RoleId, string> = {
  GK: "ВР",
  LB: "ЛЗ",
  CB: "ЦЗ",
  RB: "ПрЗ",
  LWB: "ЛФБ",
  RWB: "ПФБ",
  CDM: "ОПЗ",
  CM: "ЦПЗ",
  CAM: "АП",
  LM: "ЛПЗ",
  RM: "ППЗ",
  LW: "ЛН",
  RW: "ПН",
  ST: "НАП",
  CF: "ЦФ",
};

export const FOOT_LABEL: Record<PreferredFoot, string> = {
  L: "Левая",
  R: "Правая",
  B: "Обе",
};

export const ATTRIBUTE_LABEL: Record<keyof PlayerAttributes, string> = {
  pace: "Скорость",
  shooting: "Удар",
  passing: "Пас",
  dribbling: "Дриблинг",
  defending: "Оборона",
  physical: "Физика",
  goalkeeping: "Вратарский",
};

export const TRAIT_LABEL: Record<PlayerTrait, string> = {
  finisher: "Завершитель",
  playmaker: "Плеймейкер",
  speedster: "Спринтер",
  tank: "Танк",
  wall: "Стена",
  leader: "Лидер",
  engine: "Мотор",
  poacher: "Пенальти-бокс",
  sweeper_keeper: "Свипер-кипер",
  dribbler: "Дриблёр",
};

export const NATIONALITY_LABEL: Record<string, string> = {
  RUS: "Россия",
  ENG: "Англия",
  ESP: "Испания",
  GER: "Германия",
  ITA: "Италия",
  FRA: "Франция",
  BRA: "Бразилия",
  ARG: "Аргентина",
  SRB: "Сербия",
  CRO: "Хорватия",
  NED: "Нидерланды",
  POR: "Португалия",
  UKR: "Украина",
  BLR: "Беларусь",
  KAZ: "Казахстан",
  SEN: "Сенегал",
  NGA: "Нигерия",
  COL: "Колумбия",
  BEL: "Бельгия",
  TUR: "Турция",
  AUT: "Австрия",
  SCO: "Шотландия",
  CZE: "Чехия",
  GRE: "Греция",
  SUI: "Швейцария",
  DEN: "Дания",
  NOR: "Норвегия",
};

/** FIFA-style 3-letter code (English letters). */
export function nationalityCode(nationalityId: string): string {
  const id = (nationalityId || "").toUpperCase();
  if (id.length === 3) return id;
  return (NATIONALITY_LABEL[id] ? id : id.slice(0, 3).padEnd(3, "X")) || "UNK";
}

/** ISO 3166-1 alpha-2 used for regional-indicator flag emojis. */
const FLAG_ISO2: Record<string, string> = {
  RUS: "RU",
  ENG: "GB", // England sides commonly shown with GB in UI packs
  ESP: "ES",
  GER: "DE",
  ITA: "IT",
  FRA: "FR",
  BRA: "BR",
  ARG: "AR",
  SRB: "RS",
  CRO: "HR",
  NED: "NL",
  POR: "PT",
  UKR: "UA",
  BLR: "BY",
  KAZ: "KZ",
  SEN: "SN",
  NGA: "NG",
  COL: "CO",
  BEL: "BE",
  TUR: "TR",
  AUT: "AT",
  SCO: "GB",
  CZE: "CZ",
  GRE: "GR",
  SUI: "CH",
  DEN: "DK",
  NOR: "NO",
};

function flagEmojiFromIso2(iso2: string): string {
  const cc = iso2.toUpperCase();
  if (cc.length !== 2) return "🏳️";
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + (cc.charCodeAt(0) - 65),
    A + (cc.charCodeAt(1) - 65)
  );
}

export function nationalityFlag(nationalityId: string): string {
  const code = nationalityCode(nationalityId);
  if (code === "ENG") {
    // England flag (black flag + tag sequence); falls back gracefully where unsupported
    return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  }
  const iso2 = FLAG_ISO2[code];
  return iso2 ? flagEmojiFromIso2(iso2) : "🏳️";
}

/** Full country name in Russian (tooltips / long copy). */
export function nationalityLabel(nationalityId: string): string {
  return NATIONALITY_LABEL[nationalityCode(nationalityId)] ?? nationalityCode(nationalityId);
}

/** Flag + FIFA code, e.g. "🇧🇷 BRA". */
export function nationalityShort(nationalityId: string): string {
  const code = nationalityCode(nationalityId);
  return `${nationalityFlag(code)} ${code}`;
}

export function roleToLine(role: RoleId): Position {
  if (role === "GK") return "GK";
  if (["LB", "CB", "RB", "LWB", "RWB"].includes(role)) return "DF";
  if (["CDM", "CM", "CAM", "LM", "RM"].includes(role)) return "MF";
  return "FW";
}

export function primaryPosition(player: Player): Position {
  if (player.preferredRole) return roleToLine(player.preferredRole);
  return player.positions[0] ?? "MF";
}

export function primaryRole(player: Player): RoleId {
  return player.preferredRole ?? player.roles?.[0] ?? "CM";
}

export function preferredRoleLabel(player: Player): string {
  return ROLE_LABEL[primaryRole(player)];
}

/** All known roles for lists / tactics (e.g. «ЦПЗ/ОПЗ»). */
export function rolesLabel(player: Player): string {
  const roles = player.roles?.length ? [...new Set(player.roles)] : [primaryRole(player)];
  return roles.map((r) => ROLE_LABEL[r] ?? r).join("/");
}

export function positionLabel(player: Player): string {
  return rolesLabel(player);
}

/** Plain first+last — for match commentary / news where age is noise. */
export function playerDisplayName(player: Player): string {
  return `${player.firstName} ${player.lastName}`;
}

/** Name with age — default for lists, cards, and profile headers. */
export function playerNameWithAge(player: Player): string {
  return `${player.firstName} ${player.lastName}, ${player.age}`;
}

/** Average overall of players currently at the club (squad strength). */
export function squadAverageOverall(players: Player[], clubId: string): number {
  const squad = players.filter((p) => p.clubId === clubId);
  if (!squad.length) return 0;
  return Math.round(squad.reduce((sum, p) => sum + p.overall, 0) / squad.length);
}

export function clubDisplayName(club: Club): string {
  return `${club.name} · ${club.city}`;
}

export function clubTitleLines(club: Club): { title: string; subtitle: string } {
  return { title: club.name, subtitle: club.city };
}

export function formatMarketValue(value: number | undefined | null): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const rounded = Math.round(n * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
  return `${text} млн`;
}

/** Seasonal wage in abstract millions (зарплата). */
export function formatWage(value: number | undefined | null): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const rounded = Math.round(n * 100) / 100;
  const text =
    Number.isInteger(rounded) || Math.abs(rounded * 10 - Math.round(rounded * 10)) < 1e-9
      ? (Math.round(rounded * 10) / 10).toFixed(1).replace(".", ",")
      : rounded.toFixed(2).replace(".", ",");
  return `${text} млн/сез`;
}

export function keyAttributes(player: Player): (keyof PlayerAttributes)[] {
  switch (primaryPosition(player)) {
    case "GK":
      return ["goalkeeping", "physical", "passing", "pace"];
    case "DF":
      return ["defending", "physical", "pace", "passing"];
    case "MF":
      return ["passing", "dribbling", "pace", "shooting"];
    case "FW":
      return ["shooting", "pace", "dribbling", "physical"];
  }
}

export function topStrengths(player: Player, limit = 2): { key: keyof PlayerAttributes; value: number }[] {
  const keys = keyAttributes(player);
  return keys
    .map((key) => ({ key, value: player.attributes[key] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function computeOverall(position: Position, attrs: PlayerAttributes): number {
  const weighted =
    position === "GK"
      ? attrs.goalkeeping * 0.55 + attrs.physical * 0.2 + attrs.passing * 0.15 + attrs.pace * 0.1
      : position === "DF"
        ? attrs.defending * 0.4 + attrs.physical * 0.25 + attrs.pace * 0.15 + attrs.passing * 0.2
        : position === "MF"
          ? attrs.passing * 0.3 + attrs.dribbling * 0.25 + attrs.pace * 0.2 + attrs.shooting * 0.15 + attrs.defending * 0.1
          : attrs.shooting * 0.35 + attrs.pace * 0.25 + attrs.dribbling * 0.25 + attrs.physical * 0.15;

  return Math.round(Math.min(95, Math.max(40, weighted)));
}

export function sortSquad(players: Player[]): Player[] {
  const order: Record<Position, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };
  return [...players].sort((a, b) => {
    const pa = order[primaryPosition(a)] - order[primaryPosition(b)];
    if (pa !== 0) return pa;
    return b.overall - a.overall;
  });
}
