import { playerDisplayName, primaryPosition, roleToLine } from "./labels";
import { Rng } from "./rng";
import {
  optimalTactics,
  flankFootBonus,
  FORMATION_ROLES,
  roleFlank,
  suggestAutoSubstitutions,
  tacticsStretchPenalty,
} from "./tactics";
import type {
  Club,
  LiveMatchState,
  MatchAtmosphere,
  MatchEvent,
  MatchResult,
  MatchSideStats,
  Player,
  RoleId,
  TeamTactics,
} from "./types";
import { weatherEffects, type WeatherId } from "./weather";

export function emptySideStats(): MatchSideStats {
  return {
    shots: 0,
    shotsOnTarget: 0,
    corners: 0,
    offsides: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    possessionTicks: 0,
  };
}

function sideStats(state: LiveMatchState, homeTurn: boolean): MatchSideStats {
  if (!state.homeStats) state.homeStats = emptySideStats();
  if (!state.awayStats) state.awayStats = emptySideStats();
  return homeTurn ? state.homeStats : state.awayStats;
}

/** Build display stats from counters + events (events fill gaps). */
export function resolveSideStats(
  events: MatchEvent[],
  clubId: string,
  stored?: MatchSideStats | null,
  shotsFallback = 0
): MatchSideStats {
  const pair = resolveMatchStats({
    homeClubId: clubId,
    awayClubId: "__other__",
    events,
    homeStats: stored ?? undefined,
    awayStats: undefined,
    homeShots: shotsFallback,
    awayShots: 0,
  });
  return pair.home;
}

export function resolveMatchStats(state: {
  homeClubId: string;
  awayClubId: string;
  events: MatchEvent[];
  homeStats?: MatchSideStats;
  awayStats?: MatchSideStats;
  homeShots?: number;
  awayShots?: number;
}): { home: MatchSideStats; away: MatchSideStats } {
  const home = { ...(state.homeStats ?? emptySideStats()) };
  const away = { ...(state.awayStats ?? emptySideStats()) };
  const bump = (clubId: string | undefined, key: keyof MatchSideStats, n = 1) => {
    if (!clubId) return;
    const target = clubId === state.homeClubId ? home : clubId === state.awayClubId ? away : null;
    if (!target) return;
    target[key] += n;
  };

  // Reset event-derived fields then rebuild (keep possession from stored)
  const homePoss = home.possessionTicks;
  const awayPoss = away.possessionTicks;
  home.shots = 0;
  home.shotsOnTarget = 0;
  home.corners = 0;
  home.offsides = 0;
  home.fouls = 0;
  home.yellowCards = 0;
  home.redCards = 0;
  away.shots = 0;
  away.shotsOnTarget = 0;
  away.corners = 0;
  away.offsides = 0;
  away.fouls = 0;
  away.yellowCards = 0;
  away.redCards = 0;

  let lastShotClub: string | undefined;
  for (const e of state.events) {
    if (e.type === "shot" && e.clubId) {
      bump(e.clubId, "shots");
      lastShotClub = e.clubId;
    } else if (e.type === "goal" && e.clubId) {
      bump(e.clubId, "shots");
      bump(e.clubId, "shotsOnTarget");
      lastShotClub = undefined;
    } else if (e.type === "save") {
      if (lastShotClub) bump(lastShotClub, "shotsOnTarget");
      lastShotClub = undefined;
    } else if (e.type === "corner") {
      bump(e.clubId, "corners");
    } else if (e.type === "offsides") {
      bump(e.clubId, "offsides");
    } else if (e.type === "foul") {
      bump(e.clubId, "fouls");
    } else if (e.type === "card" && e.detail === "yellow") {
      bump(e.clubId, "yellowCards");
    } else if (e.type === "card" && e.detail === "red") {
      bump(e.clubId, "redCards");
    } else if (e.type === "miss" || e.type === "chance") {
      lastShotClub = undefined;
    }
  }

  home.shots = Math.max(home.shots, state.homeShots ?? 0, state.homeStats?.shots ?? 0);
  away.shots = Math.max(away.shots, state.awayShots ?? 0, state.awayStats?.shots ?? 0);
  home.shotsOnTarget = Math.max(home.shotsOnTarget, state.homeStats?.shotsOnTarget ?? 0);
  away.shotsOnTarget = Math.max(away.shotsOnTarget, state.awayStats?.shotsOnTarget ?? 0);
  home.corners = Math.max(home.corners, state.homeStats?.corners ?? 0);
  away.corners = Math.max(away.corners, state.awayStats?.corners ?? 0);
  home.offsides = Math.max(home.offsides, state.homeStats?.offsides ?? 0);
  away.offsides = Math.max(away.offsides, state.awayStats?.offsides ?? 0);
  home.fouls = Math.max(home.fouls, state.homeStats?.fouls ?? 0);
  away.fouls = Math.max(away.fouls, state.awayStats?.fouls ?? 0);
  home.yellowCards = Math.max(home.yellowCards, state.homeStats?.yellowCards ?? 0);
  away.yellowCards = Math.max(away.yellowCards, state.awayStats?.yellowCards ?? 0);
  home.redCards = Math.max(home.redCards, state.homeStats?.redCards ?? 0);
  away.redCards = Math.max(away.redCards, state.awayStats?.redCards ?? 0);
  home.possessionTicks = Math.max(homePoss, state.homeStats?.possessionTicks ?? 0);
  away.possessionTicks = Math.max(awayPoss, state.awayStats?.possessionTicks ?? 0);
  return { home, away };
}

function playersById(players: Player[]): Map<string, Player> {
  return new Map(players.map((p) => [p.id, p]));
}

function xiPlayers(ids: string[], map: Map<string, Player>): Player[] {
  return ids.map((id) => map.get(id)).filter(Boolean) as Player[];
}

function slotRole(tactics: TeamTactics, index: number, player: Player): RoleId {
  return FORMATION_ROLES[tactics.formation]?.[index] ?? player.preferredRole ?? "CM";
}

function playerFreshness(stamina: Record<string, number> | undefined, playerId: string): number {
  const s = stamina?.[playerId] ?? 100;
  return 0.55 + (0.45 * Math.max(0, Math.min(100, s))) / 100;
}

function ensureStamina(state: LiveMatchState, playerIds: string[]): void {
  if (!state.stamina) state.stamina = {};
  for (const id of playerIds) {
    if (state.stamina[id] == null) state.stamina[id] = 100;
  }
}

function drainFieldStamina(
  state: LiveMatchState,
  fieldIds: string[],
  tactics: TeamTactics,
  map: Map<string, Player>
): void {
  ensureStamina(state, fieldIds);
  const stretch = tacticsStretchPenalty(tactics);
  const intensity = (tactics.attack + tactics.defence) / 2;
  const base =
    0.22 + intensity / 320 + tactics.aggression / 500 + stretch * 0.28;
  for (const id of fieldIds) {
    const p = map.get(id);
    const phys = p?.attributes.physical ?? 60;
    const line = p ? primaryPosition(p) : "MF";
    let rate = base;
    if (line === "MF") rate *= 1.15;
    else if (line === "FW") rate *= 1.08;
    else if (line === "DF") rate *= 0.92;
    else rate *= 0.62; // GK
    rate *= 1.1 - phys / 500;
    state.stamina[id] = Math.max(0, (state.stamina[id] ?? 100) - rate);
  }
}

function sideAttack(
  xi: Player[],
  tactics: TeamTactics,
  stamina?: Record<string, number>
): number {
  if (!xi.length) return 50;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < xi.length; i++) {
    const p = xi[i];
    const role = slotRole(tactics, i, p);
    const line = roleToLine(role);
    if (line === "GK") continue;
    if (!["MF", "FW"].includes(line) && !["MF", "FW"].includes(primaryPosition(p))) continue;
    const a = p.attributes;
    const base = (a.shooting + a.pace + a.dribbling) / 3;
    sum +=
      (base + flankFootBonus(p.preferredFoot, roleFlank(role)) * 0.55) *
      playerFreshness(stamina, p.id);
    n++;
  }
  if (!n) {
    for (const p of xi) {
      const a = p.attributes;
      sum += ((a.shooting + a.pace + a.dribbling) / 3) * playerFreshness(stamina, p.id);
      n++;
    }
  }
  const stretch = tacticsStretchPenalty(tactics);
  // Attack slider helps, but stretch + fatigue cut both ends of the pitch.
  return (sum / Math.max(1, n)) * (0.78 + tactics.attack / 170) * (1 - stretch * 0.9);
}

function sideDefence(
  xi: Player[],
  tactics: TeamTactics,
  stamina?: Record<string, number>
): number {
  if (!xi.length) return 50;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < xi.length; i++) {
    const p = xi[i];
    const role = slotRole(tactics, i, p);
    const line = roleToLine(role);
    if (!["GK", "DF"].includes(line) && !["GK", "DF"].includes(primaryPosition(p))) continue;
    const a = p.attributes;
    const base =
      line === "GK" || primaryPosition(p) === "GK" ? a.goalkeeping : (a.defending + a.physical) / 2;
    sum +=
      (base + flankFootBonus(p.preferredFoot, roleFlank(role)) * 0.45) *
      playerFreshness(stamina, p.id);
    n++;
  }
  if (!n) {
    for (const p of xi) {
      const a = p.attributes;
      const base = primaryPosition(p) === "GK" ? a.goalkeeping : (a.defending + a.physical) / 2;
      sum += base * playerFreshness(stamina, p.id);
      n++;
    }
  }
  const stretch = tacticsStretchPenalty(tactics);
  // Aggression no longer inflates defending — it drives fouls/press separately.
  return (sum / Math.max(1, n)) * (0.78 + tactics.defence / 170) * (1 - stretch);
}

function bumpRating(state: LiveMatchState, playerId: string | undefined, delta: number) {
  if (!playerId) return;
  const cur = state.ratings[playerId] ?? 6.5;
  state.ratings[playerId] = Math.max(3, Math.min(10, Math.round((cur + delta) * 10) / 10));
}

function pickAttacker(xi: Player[], tactics: TeamTactics, rng: Rng): Player {
  const weights = xi.map((p, i) => {
    const line = primaryPosition(p);
    if (line === "GK") return 0;
    const role = slotRole(tactics, i, p);
    let w = p.overall + flankFootBonus(p.preferredFoot, roleFlank(role));
    if (line === "FW") w += 18;
    else if (line === "MF") w += 8;
    return Math.max(1, w);
  });
  return xi[rng.pickWeighted(weights)] ?? rng.pick(xi);
}

function pickCreator(xi: Player[], tactics: TeamTactics, rng: Rng): Player {
  const weights = xi.map((p, i) => {
    const line = primaryPosition(p);
    if (line === "GK") return 0;
    const role = slotRole(tactics, i, p);
    let w = p.attributes.passing + flankFootBonus(p.preferredFoot, roleFlank(role)) * 0.5;
    if (line === "MF") w += 20;
    if (role === "CAM" || role === "CM") w += 10;
    return Math.max(1, w);
  });
  return xi[rng.pickWeighted(weights)] ?? rng.pick(xi);
}

function pickDefender(xi: Player[], tactics: TeamTactics, rng: Rng): Player {
  const weights = xi.map((p, i) => {
    const line = primaryPosition(p);
    if (line === "GK") return 0;
    const role = slotRole(tactics, i, p);
    let w = p.attributes.defending + flankFootBonus(p.preferredFoot, roleFlank(role)) * 0.5;
    if (line === "DF") w += 20;
    return Math.max(1, w);
  });
  return xi[rng.pickWeighted(weights)] ?? rng.pick(xi);
}

function pickKeeper(xi: Player[]): Player | undefined {
  return xi.find((p) => primaryPosition(p) === "GK");
}

function line(rng: Rng, templates: string[], vars: Record<string, string>): string {
  let t = rng.pick(templates);
  for (const [k, v] of Object.entries(vars)) {
    t = t.split(`{${k}}`).join(v);
  }
  return t;
}

const CHANCE = [
  "{m}' {p} обостряет у ворот «{def}».",
  "{m}' Острая передача от {p} — «{def}» на растяжке.",
  "{m}' {p} разрезает оборону «{def}» пасом вразрез.",
  "{m}' Момент! {p} находит пространство у чужой штрафной.",
  "{m}' {p} ускоряется, защита «{def}» не успевает.",
  "{m}' Комбинация через {p} — опасно у ворот «{def}».",
];

const SHOT = [
  "{m}' Удар! {p} бьёт —",
  "{m}' {p} решается на удар с ходу —",
  "{m}' Прицельный выстрел {p} —",
  "{m}' {p} пробивает низом —",
  "{m}' Дальний удар {p} —",
  "{m}' {p} бьёт головой после навеса —",
];

const SAVE = [
  "…сейв! {p} выручает.",
  "…невероятный сейв {p}!",
  "…{p} кончиками пальцев переводит на угловой.",
  "…{p} бросается в ноги и закрывает удар.",
  "…штанга? Нет — рука {p}!",
  "…{p} спокойно забирает мяч.",
];

const MISS = [
  "…мимо / блок {p}.",
  "…выше ворот! {p} успел закрыть.",
  "…в штангу! {p} дышит свободно.",
  "…удар заблокирован, {p} в эпизоде.",
  "…чуть мимо стойки, {p} уже праздновал.",
  "…защита выносит, отличился {p}.",
];

const GOAL = [
  "{m}' ГОЛ! {p} ({club})! {score}",
  "{m}' В сетке! {p} для «{club}» — {score}",
  "{m}' ГОЛ! Красивый удар {p} («{club}»). {score}",
  "{m}' Есть! {p} открывает счёт атаки «{club}». {score}",
  "{m}' ГОЛ! {p} не оставил шансов. «{club}» ведёт эпизод — {score}",
  "{m}' Бомба! {p} ({club}) вколачивает мяч. {score}",
];

const ASSIST = [
  "{m}' Передача: {p}.",
  "{m}' Ассист на счету {p}.",
  "{m}' Голевая — {p} выдал идеальный пас.",
  "{m}' {p} отдал под удар.",
];

const FOUL = [
  "{m}' Фол. {p} жёстко вступает в отбор.",
  "{m}' Нарушение: {p} сносит соперника.",
  "{m}' Судья свистит — {p} опоздал в подкате.",
  "{m}' Грубо! {p} останавливает атаку ценой фола.",
  "{m}' Спорный эпизод, но фол на {p}.",
  "{m}' Задержка руками — фол {p}.",
  "{m}' Подкат сзади: нарушение {p}.",
];

const FREEKICK = [
  "{m}' Штрафной у ворот «{def}». Бьёт {p}.",
  "{m}' Свободный удар. {p} ставит мяч.",
  "{m}' Штрафной после фола — {p} у мяча.",
];

const HANDBALL = [
  "{m}' Игра рукой! Фиксируют у {p}.",
  "{m}' Рука! Судья указывает на нарушение {p}.",
  "{m}' Мяч попал в руку {p} — свисток.",
];

const PENALTY = [
  "{m}' ПЕНАЛЬТИ! Нарушение в штрафной — бьёт {p}.",
  "{m}' 11 метров! {p} подходит к точке.",
  "{m}' Судья указывает на точку. Пенальти — {p}.",
];

const PENALTY_GOAL = [
  "{m}' ГОЛ с пенальти! {p} ({club}) — {score}",
  "{m}' Точно в угол! {p} реализует 11-метровый. {score}",
];

const PENALTY_MISS = [
  "{m}' Не забил! {p} мажет с точки.",
  "{m}' Сейв с пенальти! Удар {p} отражён.",
  "{m}' Штанга! {p} не реализовал пенальти.",
];

const CARD_Y = [
  "{m}' Жёлтая: {p}.",
  "{m}' Предупреждение — {p}.",
  "{m}' Горчичник у {p}.",
  "{m}' Карточка. {p} перешёл грань.",
];

const CARD_R = [
  "{m}' Красная: {p}.",
  "{m}' Удаление! {p} покидает поле.",
  "{m}' Прямая красная — {p}.",
  "{m}' Вторая жёлтая → красная: {p} удалён.",
];

const CORNER = [
  "{m}' Угловой у ворот «{def}».",
  "{m}' Корнер. «{atk}» разыгрывают угловой.",
  "{m}' Мяч ушёл на угловой у «{def}».",
  "{m}' Навес с угла — шанс для «{atk}».",
];

const COMMENT = [
  "{m}' «{club}» держат темп (атк {att}/обр {def}).",
  "{m}' Контроль у «{club}» — прессинг {att}.",
  "{m}' «{club}» перестраиваются: атака {att}, блок {def}.",
  "{m}' Ритм матча задаёт «{club}».",
  "{m}' Пауза в атаках, мяч у «{club}».",
  "{m}' «{club}» ищут бреши в обороне соперника.",
];

export function createLiveMatch(
  fixtureId: string,
  home: Club,
  away: Club,
  players: Player[],
  homeTactics: TeamTactics,
  awayTactics: TeamTactics,
  atmosphere?: MatchAtmosphere
): LiveMatchState {
  const map = playersById(players);
  const homeSquad = players.filter((p) => p.clubId === home.id).map((p) => p.id);
  const awaySquad = players.filter((p) => p.clubId === away.id).map((p) => p.id);
  const homeOnField = homeTactics.lineup.slice(0, 11);
  const awayOnField = awayTactics.lineup.slice(0, 11);
  const ratings: Record<string, number> = {};
  const stamina: Record<string, number> = {};
  for (const id of [...homeOnField, ...awayOnField, ...homeSquad, ...awaySquad]) {
    ratings[id] = ratings[id] ?? 6.5;
    stamina[id] = 100;
  }

  const state: LiveMatchState = {
    fixtureId,
    homeClubId: home.id,
    awayClubId: away.id,
    minute: 0,
    homeGoals: 0,
    awayGoals: 0,
    homeShots: 0,
    awayShots: 0,
    homeStats: emptySideStats(),
    awayStats: emptySideStats(),
    events: [],
    homeOnField,
    awayOnField,
    homeBench: homeSquad.filter((id) => !homeOnField.includes(id)),
    awayBench: awaySquad.filter((id) => !awayOnField.includes(id)),
    homeTactics: { ...homeTactics, lineup: homeOnField },
    awayTactics: { ...awayTactics, lineup: awayOnField },
    ratings,
    stamina,
    matchYellows: {},
    homeSubsUsed: 0,
    awaySubsUsed: 0,
    maxSubs: 5,
    finished: false,
    atmosphere,
  };

  void map;
  return state;
}

function applyInjurySub(
  state: LiveMatchState,
  clubId: string,
  playerId: string,
  minute: number,
  players: Player[],
  rng: Rng,
  severity: "knock" | "muscle" | "serious"
): void {
  const map = playersById(players);
  const injured = map.get(playerId);
  const isHome = clubId === state.homeClubId;
  const field = isHome ? state.homeOnField : state.awayOnField;
  const bench = isHome ? state.homeBench : state.awayBench;
  const used = isHome ? state.homeSubsUsed : state.awaySubsUsed;
  const sevLabel =
    severity === "serious" ? "серьёзная травма" : severity === "muscle" ? "мышечная травма" : "ушиб";

  push(state, {
    minute,
    type: "injury",
    clubId,
    playerId,
    detail: severity,
    text: injured
      ? `${minute}' ${playerDisplayName(injured)} — ${sevLabel}, не может продолжать.`
      : `${minute}' Игрок получил травму и покидает поле.`,
    score: [state.homeGoals, state.awayGoals],
  });
  bumpRating(state, playerId, severity === "serious" ? -1.4 : -0.7);

  const idx = field.indexOf(playerId);
  if (idx < 0) return;

  const canSub = used < state.maxSubs && bench.length > 0;
  if (canSub) {
    const outPos = injured ? primaryPosition(injured) : "MF";
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < bench.length; i++) {
      const cand = map.get(bench[i]);
      if (!cand) continue;
      const same = primaryPosition(cand) === outPos ? 30 : 0;
      const score = same + cand.overall;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const inId = bench.splice(bestIdx, 1)[0];
    field[idx] = inId;
    if (isHome) {
      state.homeSubsUsed++;
      state.homeTactics.lineup = [...field];
    } else {
      state.awaySubsUsed++;
      state.awayTactics.lineup = [...field];
    }
    const incoming = map.get(inId);
    push(state, {
      minute,
      type: "sub_off",
      clubId,
      playerId,
      text: `${minute}' ${injured ? playerDisplayName(injured) : "Игрок"} уходит с поля.`,
      score: [state.homeGoals, state.awayGoals],
    });
    push(state, {
      minute,
      type: "sub_on",
      clubId,
      playerId: inId,
      text: incoming
        ? `${minute}' Вместо него — ${playerDisplayName(incoming)}.`
        : `${minute}' Замена по травме.`,
      score: [state.homeGoals, state.awayGoals],
    });
  } else {
    field.splice(idx, 1);
    if (isHome) state.homeTactics.lineup = [...field];
    else state.awayTactics.lineup = [...field];
    push(state, {
      minute,
      type: "comment",
      clubId,
      playerId,
      text: `${minute}' Замен не осталось — команда доигрывает в меньшинстве.`,
      score: [state.homeGoals, state.awayGoals],
    });
  }
}

function push(state: LiveMatchState, e: MatchEvent) {
  state.events.push(e);
}

/** Simulate from current minute exclusive through `toMinute` inclusive. */
export function advanceLiveMatch(
  state: LiveMatchState,
  home: Club,
  away: Club,
  players: Player[],
  toMinute: number,
  rng: Rng
): LiveMatchState {
  if (state.finished) return state;
  const next = structuredClone(state) as LiveMatchState;
  const map = playersById(players);
  const target = Math.min(90, Math.max(next.minute, toMinute));

  if (next.minute === 0 && next.events.length === 0) {
    const atm = next.atmosphere;
    const crowd =
      atm != null
        ? ` На «${atm.stadium}» ${atm.attendance.toLocaleString("ru-RU")} зрителей из ${atm.capacity.toLocaleString("ru-RU")}.`
        : "";
    const wx =
      atm != null ? ` Погода: ${atm.weatherLabel.toLowerCase()} — ${atm.weatherHint.toLowerCase()}.` : "";
    push(next, {
      minute: 1,
      type: "kickoff",
      text: rng.pick([
        `Стартовый свисток. ${home.shortName} — ${away.shortName}.${crowd}${wx}`,
        `Матч начался! ${home.name} принимают ${away.name}.${crowd}${wx}`,
        `Поехали: ${home.shortName} против ${away.shortName}.${crowd}${wx}`,
      ]),
      score: [0, 0],
    });
    next.minute = 1;
  }

  for (let minute = next.minute + 1; minute <= target; minute++) {
    if (minute === 46 && !next.events.some((e) => e.type === "halftime")) {
      push(next, {
        minute: 45,
        type: "halftime",
        text: rng.pick([
          `Перерыв. Счёт ${next.homeGoals}:${next.awayGoals}.`,
          `Первый тайм окончен — ${next.homeGoals}:${next.awayGoals}.`,
          `На перерыв при ${next.homeGoals}:${next.awayGoals}.`,
        ]),
        score: [next.homeGoals, next.awayGoals],
      });
      // Short rest at half-time
      ensureStamina(next, [...next.homeOnField, ...next.awayOnField]);
      for (const id of [...next.homeOnField, ...next.awayOnField]) {
        next.stamina[id] = Math.min(100, (next.stamina[id] ?? 100) + 10);
      }
      push(next, {
        minute: 46,
        type: "second_half",
        text: rng.pick(["Второй тайм.", "Команды выходят на второй тайм.", "Игра возобновлена."]),
        score: [next.homeGoals, next.awayGoals],
      });
    }

    const homeXI = xiPlayers(next.homeOnField, map);
    const awayXI = xiPlayers(next.awayOnField, map);
    ensureStamina(next, [...next.homeOnField, ...next.awayOnField]);

    const wxId = (next.atmosphere?.weather ?? "cloudy") as WeatherId;
    const wx = weatherEffects(wxId);

    // Weather slips / rare injuries outside open play
    if (rng.chance(wx.slipChance)) {
      const homeSide = rng.chance(0.5);
      const field = homeSide ? next.homeOnField : next.awayOnField;
      const club = homeSide ? home : away;
      if (field.length) {
        const pid = rng.pick(field);
        const pl = map.get(pid);
        if (pl) {
          push(next, {
            minute,
            type: "comment",
            clubId: club.id,
            playerId: pid,
            detail: "slip",
            text: rng.pick([
              `${minute}' ${playerDisplayName(pl)} поскользнулся на газоне!`,
              `${minute}' ${playerDisplayName(pl)} теряет равновесие — скользко.`,
              `${minute}' Подскок и падение: ${playerDisplayName(pl)} не удержал баланс.`,
            ]),
            score: [next.homeGoals, next.awayGoals],
          });
          bumpRating(next, pid, -0.08);
          if (rng.chance(wx.injuryChance * 0.55)) {
            const severity = rng.chance(0.12) ? "serious" : rng.chance(0.45) ? "muscle" : "knock";
            applyInjurySub(next, club.id, pid, minute, players, rng, severity);
          }
        }
      }
    }

    const homeAtt =
      sideAttack(homeXI, next.homeTactics, next.stamina) *
      (0.96 + home.reputation / 600) *
      wx.attackMod;
    const awayAtt =
      sideAttack(awayXI, next.awayTactics, next.stamina) *
      (0.96 + away.reputation / 600) *
      wx.attackMod;
    const homeDef = sideDefence(homeXI, next.homeTactics, next.stamina) * wx.defenceMod;
    const awayDef = sideDefence(awayXI, next.awayTactics, next.stamina) * wx.defenceMod;

    const homeChance = Math.max(0.1, Math.min(0.38, 0.18 + (homeAtt - awayDef) / 190));
    const awayChance = Math.max(0.09, Math.min(0.36, 0.16 + (awayAtt - homeDef) / 190));

    const homeBallShare = homeAtt / Math.max(1, homeAtt + awayAtt);
    const homeTurn = rng.chance(0.42 + homeBallShare * 0.2 + next.homeTactics.attack / 800);
    sideStats(next, homeTurn).possessionTicks++;
    const rate = homeTurn ? homeChance : awayChance;
    if (rng.chance(rate)) {
      const attackClub = homeTurn ? home : away;
      const defendClub = homeTurn ? away : home;
      const xi = homeTurn ? homeXI : awayXI;
      const oppXi = homeTurn ? awayXI : homeXI;
      const tactics = homeTurn ? next.homeTactics : next.awayTactics;
      const defTactics = homeTurn ? next.awayTactics : next.homeTactics;
      const attacker = pickAttacker(xi, tactics, rng);
      const creator = pickCreator(xi, tactics, rng);
      const defender = pickDefender(oppXi, defTactics, rng);
      const keeper = pickKeeper(oppXi);
      const m = String(minute);
      const scoreStr = `${next.homeGoals}:${next.awayGoals}`;
      const atkFresh = playerFreshness(next.stamina, attacker.id);
      const defFresh = playerFreshness(next.stamina, defender.id);

      const roll = rng.next();
      // Tuned down: ~2–4 fouls/cards per team was too high for a 90' sim tick model
      // Tired defenders foul more; high aggression presses harder.
      const foulChance =
        0.05 + defTactics.aggression / 420 + (1 - defFresh) * 0.04;
      const handballChance = foulChance + 0.018;
      const penaltyChance = handballChance + 0.015;

      const sendOff = (clubId: string, playerId: string) => {
        const isHomeSide = clubId === next.homeClubId;
        const field = isHomeSide ? next.homeOnField : next.awayOnField;
        const idx = field.indexOf(playerId);
        if (idx >= 0) {
          field.splice(idx, 1);
          if (isHomeSide) next.homeTactics.lineup = [...field];
          else next.awayTactics.lineup = [...field];
        }
      };

      if (roll < foulChance) {
        const inBox = rng.chance(0.18);
        sideStats(next, !homeTurn).fouls++;
        push(next, {
          minute,
          type: "foul",
          clubId: defendClub.id,
          playerId: defender.id,
          text: line(rng, FOUL, { m, p: playerDisplayName(defender) }),
          score: [next.homeGoals, next.awayGoals],
          detail: inBox ? "box" : "open",
        });
        bumpRating(next, defender.id, 0.05);
        if (rng.chance(wx.injuryChance * 0.35)) {
          const severity = rng.chance(0.15) ? "serious" : rng.chance(0.5) ? "muscle" : "knock";
          applyInjurySub(next, attackClub.id, attacker.id, minute, players, rng, severity);
        }

        if (inBox && rng.chance(0.55)) {
          // Foul in box → penalty
          push(next, {
            minute,
            type: "penalty",
            clubId: attackClub.id,
            playerId: attacker.id,
            text: line(rng, PENALTY, { m, p: playerDisplayName(attacker) }),
            score: [next.homeGoals, next.awayGoals],
          });
          const scored = rng.chance(0.72 + attacker.attributes.shooting / 400);
          if (scored) {
            if (homeTurn) next.homeGoals++;
            else next.awayGoals++;
            const newScore = `${next.homeGoals}:${next.awayGoals}`;
            push(next, {
              minute,
              type: "goal",
              clubId: attackClub.id,
              playerId: attacker.id,
              detail: "penalty",
              text: line(rng, PENALTY_GOAL, {
                m,
                p: playerDisplayName(attacker),
                club: attackClub.shortName,
                score: newScore,
              }),
              score: [next.homeGoals, next.awayGoals],
            });
            bumpRating(next, attacker.id, 0.8);
          } else {
            push(next, {
              minute,
              type: "miss",
              clubId: attackClub.id,
              playerId: attacker.id,
              detail: "penalty",
              text: line(rng, PENALTY_MISS, { m, p: playerDisplayName(attacker) }),
              score: [next.homeGoals, next.awayGoals],
            });
            bumpRating(next, attacker.id, -0.4);
            if (keeper) bumpRating(next, keeper.id, 0.5);
          }
        } else {
          // Free kick
          push(next, {
            minute,
            type: "freekick",
            clubId: attackClub.id,
            playerId: creator.id,
            text: line(rng, FREEKICK, {
              m,
              p: playerDisplayName(creator),
              def: defendClub.shortName,
            }),
            score: [next.homeGoals, next.awayGoals],
          });
          if (rng.chance(0.18)) {
            if (homeTurn) next.homeGoals++;
            else next.awayGoals++;
            push(next, {
              minute,
              type: "goal",
              clubId: attackClub.id,
              playerId: creator.id,
              detail: "freekick",
              text: line(rng, GOAL, {
                m,
                p: playerDisplayName(creator),
                club: attackClub.shortName,
                score: `${next.homeGoals}:${next.awayGoals}`,
              }),
              score: [next.homeGoals, next.awayGoals],
            });
            bumpRating(next, creator.id, 1.0);
          }
        }

        const cardChance = 0.2 + defTactics.aggression / 400;
        if (rng.chance(cardChance)) {
          const alreadyYellow = (next.matchYellows[defender.id] ?? 0) > 0;
          const red = alreadyYellow
            ? rng.chance(0.35)
            : rng.chance(0.05 + defTactics.aggression / 900);
          if (red) {
            sideStats(next, !homeTurn).redCards++;
          } else {
            sideStats(next, !homeTurn).yellowCards++;
            next.matchYellows[defender.id] = (next.matchYellows[defender.id] ?? 0) + 1;
          }
          push(next, {
            minute,
            type: "card",
            clubId: defendClub.id,
            playerId: defender.id,
            detail: red ? "red" : "yellow",
            text: line(rng, red ? CARD_R : CARD_Y, { m, p: playerDisplayName(defender) }),
            score: [next.homeGoals, next.awayGoals],
          });
          bumpRating(next, defender.id, red ? -1.2 : -0.35);
          if (red) sendOff(defendClub.id, defender.id);
        }
      } else if (roll < handballChance) {
        push(next, {
          minute,
          type: "handball",
          clubId: defendClub.id,
          playerId: defender.id,
          text: line(rng, HANDBALL, { m, p: playerDisplayName(defender) }),
          score: [next.homeGoals, next.awayGoals],
        });
        bumpRating(next, defender.id, -0.15);
        if (rng.chance(0.4)) {
          push(next, {
            minute,
            type: "penalty",
            clubId: attackClub.id,
            playerId: attacker.id,
            text: line(rng, PENALTY, { m, p: playerDisplayName(attacker) }),
            score: [next.homeGoals, next.awayGoals],
            detail: "handball",
          });
          if (rng.chance(0.7)) {
            if (homeTurn) next.homeGoals++;
            else next.awayGoals++;
            push(next, {
              minute,
              type: "goal",
              clubId: attackClub.id,
              playerId: attacker.id,
              detail: "penalty",
              text: line(rng, PENALTY_GOAL, {
                m,
                p: playerDisplayName(attacker),
                club: attackClub.shortName,
                score: `${next.homeGoals}:${next.awayGoals}`,
              }),
              score: [next.homeGoals, next.awayGoals],
            });
            bumpRating(next, attacker.id, 0.8);
          } else {
            push(next, {
              minute,
              type: "miss",
              clubId: attackClub.id,
              playerId: attacker.id,
              detail: "penalty",
              text: line(rng, PENALTY_MISS, { m, p: playerDisplayName(attacker) }),
              score: [next.homeGoals, next.awayGoals],
            });
          }
        } else {
          push(next, {
            minute,
            type: "freekick",
            clubId: attackClub.id,
            playerId: creator.id,
            text: line(rng, FREEKICK, {
              m,
              p: playerDisplayName(creator),
              def: defendClub.shortName,
            }),
            score: [next.homeGoals, next.awayGoals],
          });
        }
      } else if (roll < penaltyChance) {
        // Soft penalty / clear penalty call without prior foul event
        push(next, {
          minute,
          type: "penalty",
          clubId: attackClub.id,
          playerId: attacker.id,
          text: line(rng, PENALTY, { m, p: playerDisplayName(attacker) }),
          score: [next.homeGoals, next.awayGoals],
        });
        if (rng.chance(0.74)) {
          if (homeTurn) next.homeGoals++;
          else next.awayGoals++;
          push(next, {
            minute,
            type: "goal",
            clubId: attackClub.id,
            playerId: attacker.id,
            detail: "penalty",
            text: line(rng, PENALTY_GOAL, {
              m,
              p: playerDisplayName(attacker),
              club: attackClub.shortName,
              score: `${next.homeGoals}:${next.awayGoals}`,
            }),
            score: [next.homeGoals, next.awayGoals],
          });
          bumpRating(next, attacker.id, 0.8);
        } else {
          push(next, {
            minute,
            type: "miss",
            clubId: attackClub.id,
            playerId: attacker.id,
            detail: "penalty",
            text: line(rng, PENALTY_MISS, { m, p: playerDisplayName(attacker) }),
            score: [next.homeGoals, next.awayGoals],
          });
        }
      } else if (roll < penaltyChance + 0.12) {
        push(next, {
          minute,
          type: "chance",
          clubId: attackClub.id,
          playerId: creator.id,
          text: line(rng, CHANCE, {
            m,
            p: playerDisplayName(creator),
            def: defendClub.shortName,
          }),
          score: [next.homeGoals, next.awayGoals],
        });
        bumpRating(next, creator.id, 0.05);
      } else if (roll < penaltyChance + 0.16) {
        sideStats(next, homeTurn).offsides++;
        push(next, {
          minute,
          type: "offsides",
          clubId: attackClub.id,
          playerId: attacker.id,
          text: `${minute}' Офсайд. ${playerDisplayName(attacker)} в положении вне игры.`,
          score: [next.homeGoals, next.awayGoals],
        });
      } else if (roll < penaltyChance + 0.4) {
        if (homeTurn) next.homeShots++;
        else next.awayShots++;
        sideStats(next, homeTurn).shots++;
        push(next, {
          minute,
          type: "shot",
          clubId: attackClub.id,
          playerId: attacker.id,
          text: line(rng, SHOT, { m, p: playerDisplayName(attacker) }),
          score: [next.homeGoals, next.awayGoals],
        });
        const onTargetChance = Math.max(0.22, Math.min(0.62, 0.42 + wx.saveMod * 0.5));
        if (rng.chance(onTargetChance) && keeper) {
          sideStats(next, homeTurn).shotsOnTarget++;
          const gkBlunder = rng.chance(Math.max(0, wx.gkErrorChance));
          if (gkBlunder) {
            if (homeTurn) next.homeGoals++;
            else next.awayGoals++;
            const sun = wxId === "sunny";
            const wet = wxId === "rain" || wxId === "heavy_rain" || wxId === "snow";
            push(next, {
              minute,
              type: "goal",
              clubId: attackClub.id,
              playerId: attacker.id,
              detail: sun ? "gk_sun" : wet ? "gk_wet" : "gk_error",
              text: sun
                ? `${minute}' ${playerDisplayName(attacker)} бьёт — ${playerDisplayName(keeper)} ослеплён солнцем! ${next.homeGoals}:${next.awayGoals}`
                : wet
                  ? `${minute}' Мокрый мяч выскальзывает из рук ${playerDisplayName(keeper)} — гол! ${next.homeGoals}:${next.awayGoals}`
                  : `${minute}' Ошибка вратаря ${playerDisplayName(keeper)}! ${playerDisplayName(attacker)} забивает — ${next.homeGoals}:${next.awayGoals}`,
              score: [next.homeGoals, next.awayGoals],
            });
            bumpRating(next, attacker.id, 0.7);
            bumpRating(next, keeper.id, -0.9);
          } else {
            push(next, {
              minute,
              type: "save",
              clubId: defendClub.id,
              playerId: keeper.id,
              text: line(rng, SAVE, { p: playerDisplayName(keeper) }),
              score: [next.homeGoals, next.awayGoals],
            });
            bumpRating(next, keeper.id, 0.25);
            bumpRating(next, attacker.id, 0.05);
          }
        } else {
          push(next, {
            minute,
            type: "miss",
            clubId: attackClub.id,
            playerId: attacker.id,
            text: line(rng, MISS, { p: playerDisplayName(defender) }),
            score: [next.homeGoals, next.awayGoals],
          });
          bumpRating(next, defender.id, 0.08);
        }
      } else if (roll < penaltyChance + 0.58) {
        if (homeTurn) next.homeShots++;
        else next.awayShots++;
        sideStats(next, homeTurn).shots++;
        sideStats(next, homeTurn).shotsOnTarget++;
        const finishBias =
          attacker.attributes.shooting / 100 + tactics.attack / 400 + (atkFresh - 0.85) * 0.35;
        const defBias =
          (defender.attributes.defending + (keeper?.attributes.goalkeeping ?? 60)) / 200 +
          defTactics.defence / 350 +
          (defFresh - 0.85) * 0.25;
        let scored = rng.chance(0.26 + finishBias * 0.35 - defBias * 0.28 + wx.finishMod);
        // Wet ball / sun: keeper fails to claim a shot that looked saved
        if (!scored && keeper && rng.chance(Math.max(0, wx.gkErrorChance * 0.55))) {
          scored = true;
          push(next, {
            minute,
            type: "comment",
            clubId: defendClub.id,
            playerId: keeper.id,
            detail: wxId === "sunny" ? "gk_sun" : "gk_wet",
            text:
              wxId === "sunny"
                ? `${minute}' ${playerDisplayName(keeper)} теряет мяч из виду на солнце!`
                : `${minute}' Мокрый мяч выскальзывает у ${playerDisplayName(keeper)}!`,
            score: [next.homeGoals, next.awayGoals],
          });
          bumpRating(next, keeper.id, -0.55);
        }
        if (scored) {
          if (homeTurn) next.homeGoals++;
          else next.awayGoals++;
          const newScore = `${next.homeGoals}:${next.awayGoals}`;
          push(next, {
            minute,
            type: "goal",
            clubId: attackClub.id,
            playerId: attacker.id,
            secondaryPlayerId: creator.id !== attacker.id ? creator.id : undefined,
            text: line(rng, GOAL, {
              m,
              p: playerDisplayName(attacker),
              club: attackClub.shortName,
              score: newScore,
            }),
            score: [next.homeGoals, next.awayGoals],
          });
          bumpRating(next, attacker.id, 1.0);
          if (creator.id !== attacker.id) {
            push(next, {
              minute,
              type: "assist",
              clubId: attackClub.id,
              playerId: creator.id,
              text: line(rng, ASSIST, { m, p: playerDisplayName(creator) }),
              score: [next.homeGoals, next.awayGoals],
            });
            bumpRating(next, creator.id, 0.45);
          }
          for (const id of homeTurn ? next.awayOnField : next.homeOnField) {
            const p = map.get(id);
            if (p && (primaryPosition(p) === "DF" || primaryPosition(p) === "GK")) {
              bumpRating(next, id, -0.12);
            }
          }
        } else {
          push(next, {
            minute,
            type: "shot",
            clubId: attackClub.id,
            playerId: attacker.id,
            text: rng.pick([
              `${minute}' Удар ${playerDisplayName(attacker)} — штанга/мимо!`,
              `${minute}' ${playerDisplayName(attacker)} бьёт — чуть мимо!`,
              `${minute}' Удар ${playerDisplayName(attacker)} — вратарь был готов.`,
            ]),
            score: [next.homeGoals, next.awayGoals],
          });
          bumpRating(next, attacker.id, 0.05);
        }
      } else if (roll < penaltyChance + 0.72) {
        sideStats(next, homeTurn).corners++;
        push(next, {
          minute,
          type: "corner",
          clubId: attackClub.id,
          text: line(rng, CORNER, {
            m,
            def: defendClub.shortName,
            atk: attackClub.shortName,
          }),
          score: [next.homeGoals, next.awayGoals],
        });
      } else {
        push(next, {
          minute,
          type: "comment",
          clubId: attackClub.id,
          text: line(rng, COMMENT, {
            m,
            club: attackClub.shortName,
            att: String(tactics.attack),
            def: String(tactics.defence),
          }),
          score: [next.homeGoals, next.awayGoals],
        });
      }
      void scoreStr;
    }

    drainFieldStamina(next, next.homeOnField, next.homeTactics, map);
    drainFieldStamina(next, next.awayOnField, next.awayTactics, map);

    // Occasional fatigue comment late in the game
    if (minute >= 70 && minute % 12 === 0) {
      const side = rng.chance(0.5) ? next.homeOnField : next.awayOnField;
      const club = side === next.homeOnField ? home : away;
      const avg =
        side.reduce((s, id) => s + (next.stamina[id] ?? 100), 0) / Math.max(1, side.length);
      if (avg < 48) {
        push(next, {
          minute,
          type: "comment",
          clubId: club.id,
          text: rng.pick([
            `${minute}' «${club.shortName}» заметно устали — темп падает.`,
            `${minute}' Физика подводит «${club.shortName}»: игроки ходят пешком.`,
            `${minute}' У «${club.shortName}» кончаются силы на прессинг.`,
          ]),
          score: [next.homeGoals, next.awayGoals],
        });
      }
    }

    next.minute = minute;
  }

  if (target >= 90 && !next.finished) {
    push(next, {
      minute: 90,
      type: "fulltime",
      text: rng.pick([
        `Финал. ${home.shortName} ${next.homeGoals}:${next.awayGoals} ${away.shortName}.`,
        `Свисток! ${home.name} ${next.homeGoals}:${next.awayGoals} ${away.name}.`,
        `Матч окончен — ${next.homeGoals}:${next.awayGoals}.`,
      ]),
      score: [next.homeGoals, next.awayGoals],
    });
    next.finished = true;
    next.minute = 90;
  }

  return next;
}

export function liveMakeSubstitution(
  state: LiveMatchState,
  clubId: string,
  playerOutId: string,
  playerInId: string,
  minute: number,
  players: Player[]
): LiveMatchState {
  const next = structuredClone(state) as LiveMatchState;
  const isHome = clubId === next.homeClubId;
  const used = isHome ? next.homeSubsUsed : next.awaySubsUsed;
  if (used >= next.maxSubs) return state;
  const onField = isHome ? next.homeOnField : next.awayOnField;
  const bench = isHome ? next.homeBench : next.awayBench;
  if (!onField.includes(playerOutId) || !bench.includes(playerInId)) return state;

  const map = playersById(players);
  const outP = map.get(playerOutId);
  const inP = map.get(playerInId);

  const idx = onField.indexOf(playerOutId);
  onField[idx] = playerInId;
  bench.splice(bench.indexOf(playerInId), 1);
  bench.push(playerOutId);
  if (isHome) {
    next.homeSubsUsed++;
    next.homeTactics.lineup = [...onField];
  } else {
    next.awaySubsUsed++;
    next.awayTactics.lineup = [...onField];
  }
  if (next.ratings[playerInId] == null) next.ratings[playerInId] = 6.4;
  ensureStamina(next, [playerInId, playerOutId]);
  next.stamina[playerInId] = Math.max(next.stamina[playerInId] ?? 100, 88);

  push(next, {
    minute,
    type: "sub_off",
    clubId,
    playerId: playerOutId,
    text: `${minute}' ↓ ${outP ? playerDisplayName(outP) : "игрок"} (${(next.ratings[playerOutId] ?? 6.5).toFixed(1)}, вын. ${Math.round(next.stamina[playerOutId] ?? 0)}%)`,
    score: [next.homeGoals, next.awayGoals],
  });
  push(next, {
    minute,
    type: "sub_on",
    clubId,
    playerId: playerInId,
    text: `${minute}' ↑ ${inP ? playerDisplayName(inP) : "игрок"}`,
    score: [next.homeGoals, next.awayGoals],
  });
  return next;
}

export function liveUpdateTactics(
  state: LiveMatchState,
  clubId: string,
  patch: Partial<Pick<TeamTactics, "attack" | "defence" | "aggression" | "formation">>,
  minute: number
): LiveMatchState {
  const next = structuredClone(state) as LiveMatchState;
  const tactics = clubId === next.homeClubId ? next.homeTactics : next.awayTactics;
  Object.assign(tactics, patch);
  push(next, {
    minute,
    type: "tactics",
    clubId,
    text: `${minute}' Корректировка: атака ${tactics.attack}, оборона ${tactics.defence}, агрессия ${tactics.aggression}.`,
    score: [next.homeGoals, next.awayGoals],
  });
  return next;
}

export function liveMatchToResult(state: LiveMatchState): MatchResult {
  return {
    homeGoals: state.homeGoals,
    awayGoals: state.awayGoals,
    homeShots: state.homeShots,
    awayShots: state.awayShots,
    events: state.events,
    homeLineup: state.homeOnField,
    awayLineup: state.awayOnField,
    ratings: state.ratings,
    homeStats: state.homeStats,
    awayStats: state.awayStats,
    atmosphere: state.atmosphere,
  };
}

/** Apply computer-suggested substitutions for a club. */
export function liveApplyAutoSubs(
  state: LiveMatchState,
  clubId: string,
  players: Player[],
  minute: number
): LiveMatchState {
  const isHome = clubId === state.homeClubId;
  const onField = isHome ? state.homeOnField : state.awayOnField;
  const bench = isHome ? state.homeBench : state.awayBench;
  const tactics = isHome ? state.homeTactics : state.awayTactics;
  const used = isHome ? state.homeSubsUsed : state.awaySubsUsed;
  const left = state.maxSubs - used;
  const suggestions = suggestAutoSubstitutions(
    onField,
    bench,
    tactics.formation,
    players,
    state.ratings,
    state.matchYellows ?? {},
    left,
    state.stamina
  );
  let next = state;
  for (const s of suggestions) {
    next = liveMakeSubstitution(next, clubId, s.outId, s.inId, minute, players);
  }
  return next;
}

/** Instant full simulation for non-user matches. */
export function simulateMatch(
  home: Club,
  away: Club,
  players: Player[],
  rng: Rng,
  homeTactics?: TeamTactics,
  awayTactics?: TeamTactics,
  atmosphere?: MatchAtmosphere
): MatchResult {
  const ht = homeTactics ?? optimalTactics(players, home.id);
  const at = awayTactics ?? optimalTactics(players, away.id);
  let state = createLiveMatch("sim", home, away, players, ht, at, atmosphere);
  state = advanceLiveMatch(state, home, away, players, 90, rng);
  return liveMatchToResult(state);
}
