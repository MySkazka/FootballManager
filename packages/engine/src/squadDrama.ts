import { playerSquadRole } from "./agency";
import { computeOverall, playerDisplayName, primaryPosition } from "./labels";
import { recomputeMarketValue } from "./players";
import { Rng } from "./rng";
import type {
  CareerSave,
  NewsItem,
  Player,
  SquadDrama,
  SquadDramaKind,
  WorldPack,
} from "./types";

/** Target ≈1.5 dramas / month for the user club. */
export const DRAMA_SPAWN_CHANCE_PER_DAY = 0.05;
export const DRAMA_MAX_ACTIVE = 2;
/** Don't re-involve the same player shortly after a drama ends. */
export const DRAMA_PLAYER_COOLDOWN_DAYS = 45;
/** Overall / form hit while ignored and not in XI. */
export const DRAMA_PENALTY_INTERVAL_DAYS = 7;
/** Consecutive starts in the XI needed to cool off. */
export const DRAMA_XI_STARTS_TO_RESOLVE = 3;
export const DRAMA_OVERALL_FLOOR = 45;

const KINDS: SquadDramaKind[] = [
  "dressing_room_fight",
  "playing_time",
  "coach_clash",
  "wage_envy",
  "clique_conflict",
  "wants_transfer",
];

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T12:00:00Z").getTime();
  const b = new Date(to + "T12:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

function clampAttr(v: number): number {
  return Math.max(25, Math.min(95, Math.round(v)));
}

function bumpKeyAttrs(player: Player, delta: number): void {
  const pos = primaryPosition(player);
  const keys =
    pos === "GK"
      ? (["goalkeeping", "physical", "passing"] as const)
      : pos === "DF"
        ? (["defending", "physical", "passing"] as const)
        : pos === "MF"
          ? (["passing", "dribbling", "pace"] as const)
          : (["shooting", "pace", "dribbling"] as const);
  for (const k of keys) {
    player.attributes[k] = clampAttr(player.attributes[k] + delta);
  }
}

function applyOverallDrop(player: Player): void {
  bumpKeyAttrs(player, -1);
  const next = computeOverall(primaryPosition(player), player.attributes);
  player.overall = Math.max(
    DRAMA_OVERALL_FLOOR,
    Math.min(player.overall - 1, Math.min(player.potential, next))
  );
}

function ensureDramas(save: CareerSave): SquadDrama[] {
  if (!Array.isArray(save.squadDramas)) save.squadDramas = [];
  return save.squadDramas;
}

function activeDramas(save: CareerSave, clubId?: string): SquadDrama[] {
  return ensureDramas(save).filter(
    (d) => d.status === "active" && (clubId == null || d.clubId === clubId)
  );
}

function playerInXi(save: CareerSave, playerId: string): boolean {
  return (save.userTactics?.lineup ?? []).includes(playerId);
}

function involvedPlayerIds(save: CareerSave): Set<string> {
  const ids = new Set<string>();
  for (const d of ensureDramas(save)) {
    if (d.status !== "active") continue;
    for (const id of d.playerIds) ids.add(id);
  }
  return ids;
}

function recentlyInvolved(save: CareerSave, playerId: string, today: string): boolean {
  for (const d of ensureDramas(save)) {
    if (!d.playerIds.includes(playerId)) continue;
    if (d.status === "active") return true;
    if (d.resolvedOn && daysBetween(d.resolvedOn, today) < DRAMA_PLAYER_COOLDOWN_DAYS) {
      return true;
    }
  }
  return false;
}

function eligibleSquad(pack: WorldPack, save: CareerSave, clubId: string): Player[] {
  const today = save.currentDate;
  const involved = involvedPlayerIds(save);
  return save.players.filter((p) => {
    if (p.clubId !== clubId || p.loan) return false;
    if (involved.has(p.id)) return false;
    if (recentlyInvolved(save, p.id, today)) return false;
    if ((save.suspensions?.[p.id] ?? 0) > 0) return false;
    if (p.age < 18) return false;
    return true;
  });
}

function pickKind(rng: Rng, roles: ReturnType<typeof playerSquadRole>[]): SquadDramaKind {
  const fringeHeavy = roles.every((r) => r === "bench" || r === "fringe");
  const weights = KINDS.map((k) => {
    if (k === "playing_time" || k === "wants_transfer") return fringeHeavy ? 3.2 : 1.2;
    if (k === "dressing_room_fight" || k === "clique_conflict") return 1.4;
    if (k === "wage_envy") return 1.1;
    if (k === "coach_clash") return 1.3;
    return 1;
  });
  return KINDS[rng.pickWeighted(weights)];
}

type DramaCopy = { headline: string; body: string };

/** Two-player locker-room clashes; other kinds are player vs club/staff. */
function dramaNeedsTwo(kind: SquadDramaKind): boolean {
  return kind === "dressing_room_fight" || kind === "clique_conflict";
}

function copyForDrama(
  kind: SquadDramaKind,
  players: Player[],
  clubName: string,
  rng: Rng
): DramaCopy {
  const a = playerDisplayName(players[0]!);
  const b = players[1] ? playerDisplayName(players[1]) : "";
  const soloAdvice =
    "Что делать: ставьте его в основу, продайте или отдайте в аренду — иначе форма и рейтинг просядут.";
  const pairAdvice =
    "Что делать: продайте/арендуйте одного из них или ставьте обоих в основу — иначе форма и рейтинг просядут.";

  const pools: Record<SquadDramaKind, DramaCopy[]> = {
    dressing_room_fight: [
      {
        headline: `Конфликт игроков: ${a} ↔ ${b}`,
        body: `Межличностный конфликт в раздевалке «${clubName}»: ${a} и ${b} сцепились после тренировки. Это не претензия к клубу — ссора между двумя футболистами. ${pairAdvice}`,
      },
      {
        headline: `Стычка: ${a} и ${b}`,
        body: `В «${clubName}» ${a} и ${b} устроили перепалку, дошедшую до толчков. Конфликт между игроками, команда ждёт вашего решения. ${pairAdvice}`,
      },
    ],
    playing_time: [
      {
        headline: `${a}: конфликт с клубом из‑за минут`,
        body: `${a} недоволен отношением клуба «${clubName}»: мало игрового времени и нет доверия тренерского штаба. Это претензия игрока к клубу, а не ссора с партнёром. ${soloAdvice}`,
      },
      {
        headline: `${a} против скамейки «${clubName}»`,
        body: `${a} заявил, что сидеть на скамейке «${clubName}» больше не готов — требует минут или ухода. Конфликт игрока с клубом. ${soloAdvice}`,
      },
    ],
    coach_clash: [
      {
        headline: `${a}: конфликт со штабом клуба`,
        body: `${a} публично усомнился в методах тренерского штаба «${clubName}». Это разлад игрока с клубом/тренером, не ссора в раздевалке. ${soloAdvice}`,
      },
      {
        headline: `Разлад ${a} с тренером «${clubName}»`,
        body: `Между ${a} и штабом «${clubName}» вспыхнул конфликт из‑за роли в команде. Игрок против клуба. ${soloAdvice}`,
      },
    ],
    wage_envy: [
      {
        headline: `${a}: конфликт с клубом из‑за зарплаты`,
        body: `${a} считает, что контракт в «${clubName}» несправедлив относительно его вклада и требует пересмотра или статуса. Претензия к клубу, не к конкретному партнёру. ${soloAdvice}`,
      },
      {
        headline: `Зарплатный ультиматум: ${a}`,
        body: `${a} сравнивает свой оклад с рынком и давит на «${clubName}»: либо достойный контракт/минуты, либо уход. Конфликт игрока с клубом. ${soloAdvice}`,
      },
    ],
    clique_conflict: [
      {
        headline: `Раскол в раздевалке: ${a} ↔ ${b}`,
        body: `В «${clubName}» ${a} и ${b} возглавили враждующие группы. Межличностный конфликт двух игроков (и их «клик»), не претензия к клубу. ${pairAdvice}`,
      },
      {
        headline: `Клика против клики: ${a} и ${b}`,
        body: `${a} и ${b} тянут команду «${clubName}» в разные стороны — ссора между футболистами. ${pairAdvice}`,
      },
    ],
    wants_transfer: [
      {
        headline: `${a} просит трансфер у клуба`,
        body: `${a} хочет сменить клуб: мало доверия и минут в «${clubName}». Это запрос игрока к клубу (продажа/аренда/основа), не конфликт с партнёром. ${soloAdvice}`,
      },
      {
        headline: `Агент ${a} давит на «${clubName}»`,
        body: `Окружение ${a} давит на клуб: либо место в основе, либо продажа. Конфликт интересов игрока и клуба. ${soloAdvice}`,
      },
    ],
  };

  return rng.pick(pools[kind]);
}

function makeNews(drama: SquadDrama, copy: DramaCopy, date: string, players: Player[]): NewsItem {
  const lead = players[0];
  return {
    id: `news-drama-${drama.id}`,
    date,
    category: "drama",
    headline: copy.headline,
    body: copy.body,
    relatedClubIds: [drama.clubId],
    relatedPlayerIds: [...drama.playerIds],
    speaker: lead
      ? {
          role: "player",
          name: playerDisplayName(lead),
          clubId: drama.clubId,
          playerId: lead.id,
        }
      : undefined,
  };
}

function reminderNews(drama: SquadDrama, players: Player[], date: string): NewsItem {
  const solo = players.length < 2;
  const names = players.map(playerDisplayName).join(" и ");
  return {
    id: `news-drama-remind-${drama.id}-${date}`,
    date,
    category: "drama",
    headline: solo ? "Конфликт с клубом не угас" : "Конфликт в раздевалке не угас",
    body: solo
      ? `${names}: претензии к клубу всё ещё остры. Пока игрока нет в основе и он не продан/арендован — рейтинг продолжит падать.`
      : `${names}: ссора между игроками всё ещё острая. Пока ситуация не решена (продажа/аренда/основа) — рейтинг продолжит падать.`,
    relatedClubIds: [drama.clubId],
    relatedPlayerIds: [...drama.playerIds],
  };
}

/**
 * Apply attribute/overall decline for unresolved drama players who are not starters.
 * Returns true if any penalty was applied.
 */
export function applyDramaPenalty(save: CareerSave, drama: SquadDrama): boolean {
  let applied = false;
  for (const id of drama.playerIds) {
    const p = save.players.find((x) => x.id === id);
    if (!p || p.clubId !== drama.clubId) continue;
    if (playerInXi(save, id)) continue;
    if (p.overall <= DRAMA_OVERALL_FLOOR) continue;
    applyOverallDrop(p);
    const stats = save.playerStats?.[id] ?? null;
    p.marketValue = recomputeMarketValue(p, stats);
    applied = true;
  }
  return applied;
}

function resolveDrama(
  save: CareerSave,
  drama: SquadDrama,
  reason: NonNullable<SquadDrama["resolvedReason"]>,
  date: string,
  newsBody?: string
): void {
  drama.status = "resolved";
  drama.resolvedOn = date;
  drama.resolvedReason = reason;
  if (newsBody) {
    save.news.unshift({
      id: `news-drama-resolve-${drama.id}-${date}`,
      date,
      category: "drama",
      headline: "Конфликт улажен",
      body: newsBody,
      relatedClubIds: [drama.clubId],
      relatedPlayerIds: [...drama.playerIds],
    });
  }
}

function playerStillAtClub(save: CareerSave, drama: SquadDrama, playerId: string): boolean {
  const p = save.players.find((x) => x.id === playerId);
  if (!p) return false;
  // Loaned out from parent club counts as "away"
  if (p.loan && p.loan.parentClubId === drama.clubId) return false;
  return p.clubId === drama.clubId;
}

/**
 * Clear dramas that involve sold / loaned players.
 * Call after permanent sale or loan-out.
 */
export function clearSquadDramasForPlayers(
  save: CareerSave,
  playerIds: string[],
  reason: "sold" | "loaned" = "sold"
): void {
  const set = new Set(playerIds);
  const date = save.currentDate;
  for (const d of ensureDramas(save)) {
    if (d.status !== "active") continue;
    if (!d.playerIds.some((id) => set.has(id))) continue;
    const remaining = d.playerIds.filter((id) => !set.has(id) && playerStillAtClub(save, d, id));
    if (remaining.length === 0 || dramaNeedsTwo(d.kind)) {
      // Solo dramas end when the player leaves; pair dramas end if either leaves.
      const gone = d.playerIds
        .map((id) => save.players.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => playerDisplayName(p!))
        .join(" и ");
      resolveDrama(
        save,
        d,
        reason,
        date,
        reason === "loaned"
          ? `${gone}: уход в аренду снял напряжение.`
          : `${gone}: трансфер закрыл конфликт.`
      );
    } else {
      d.playerIds = remaining;
    }
  }
}

/**
 * After a user-club match: update XI start streaks and resolve cooled dramas.
 */
export function noteSquadDramaMatchStarts(
  save: CareerSave,
  startedIds: string[],
  clubId: string
): void {
  const started = new Set(startedIds);
  const date = save.currentDate;
  for (const d of activeDramas(save, clubId)) {
    let allOk = true;
    for (const id of d.playerIds) {
      if (!playerStillAtClub(save, d, id)) continue;
      if (started.has(id)) {
        d.startsStreak = (d.startsStreak ?? 0) + 1;
      } else {
        d.startsStreak = 0;
        allOk = false;
      }
    }
    const streak = d.startsStreak ?? 0;
    if (allOk && streak >= DRAMA_XI_STARTS_TO_RESOLVE) {
      const names = d.playerIds
        .map((id) => save.players.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => playerDisplayName(p!))
        .join(" и ");
      resolveDrama(
        save,
        d,
        "starting_xi",
        date,
        `${names} получил(и) стабильное место в основе — конфликт остыл.`
      );
    }
  }
}

/**
 * Also cool down if every remaining player is already in the saved starting XI
 * and has accumulated enough starts (or was put in XI and we count lineup presence
 * after enough calendar time with streak from matches).
 */
export function tryResolveDramasByLineup(save: CareerSave, clubId: string): void {
  const date = save.currentDate;
  for (const d of activeDramas(save, clubId)) {
    const atClub = d.playerIds.filter((id) => playerStillAtClub(save, d, id));
    if (!atClub.length) {
      resolveDrama(save, d, "sold", date);
      continue;
    }
    const allInXi = atClub.every((id) => playerInXi(save, id));
    if (allInXi && (d.startsStreak ?? 0) >= DRAMA_XI_STARTS_TO_RESOLVE) {
      const names = atClub
        .map((id) => save.players.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => playerDisplayName(p!))
        .join(" и ");
      resolveDrama(
        save,
        d,
        "starting_xi",
        date,
        `${names} закреплён(ы) в стартовом составе — напряжение спало.`
      );
    }
  }
}

function trySpawnUserDrama(pack: WorldPack, save: CareerSave, rng: Rng): SquadDrama | null {
  if (activeDramas(save, save.clubId).length >= DRAMA_MAX_ACTIVE) return null;
  if (!rng.chance(DRAMA_SPAWN_CHANCE_PER_DAY)) return null;

  const club = pack.clubs.find((c) => c.id === save.clubId);
  if (!club) return null;

  const pool = eligibleSquad(pack, save, save.clubId);
  if (pool.length < 1) return null;

  const cache = { xiByClub: new Map<string, Set<string>>() };
  const weighted = pool.map((p) => {
    const role = playerSquadRole(pack, save, p, cache);
    const w = role === "fringe" ? 3.5 : role === "bench" ? 2.5 : role === "important" ? 0.8 : 0.35;
    return w;
  });

  const firstIdx = rng.pickWeighted(weighted);
  const first = pool[firstIdx]!;
  const firstRole = playerSquadRole(pack, save, first, cache);
  const kind = pickKind(rng, [firstRole]);

  const players: Player[] = [first];
  if (dramaNeedsTwo(kind)) {
    const rest = pool.filter((p) => p.id !== first.id);
    if (rest.length < 1) {
      const soloKind: SquadDramaKind = rng.chance(0.5) ? "playing_time" : "coach_clash";
      return buildDrama(save, soloKind, players, club.name, rng);
    }
    const restW = rest.map((p) => {
      const role = playerSquadRole(pack, save, p, cache);
      return role === "starter" || role === "important" ? 1.4 : 1;
    });
    players.push(rest[rng.pickWeighted(restW)]!);
  }

  return buildDrama(save, kind, players, club.name, rng);
}

function buildDrama(
  save: CareerSave,
  kind: SquadDramaKind,
  players: Player[],
  clubName: string,
  rng: Rng
): SquadDrama {
  const drama: SquadDrama = {
    id: `drama-${save.currentDate}-${rng.int(1000, 9999)}-${players.map((p) => p.id).join("-")}`,
    kind,
    playerIds: players.map((p) => p.id),
    clubId: save.clubId,
    startedOn: save.currentDate,
    status: "active",
    startsStreak: 0,
    lastNewsOn: save.currentDate,
  };
  ensureDramas(save).unshift(drama);
  const copy = copyForDrama(kind, players, clubName, rng);
  save.news.unshift(makeNews(drama, copy, save.currentDate, players));
  return drama;
}

/**
 * Daily tick: penalties for ignored dramas, reminders, spawn chance, lineup resolve.
 * Mutates save.
 */
export function tickSquadDramas(pack: WorldPack, save: CareerSave, rng: Rng): void {
  ensureDramas(save);
  const today = save.currentDate;

  // Drop dramas whose players all left somehow
  for (const d of activeDramas(save, save.clubId)) {
    const atClub = d.playerIds.filter((id) => playerStillAtClub(save, d, id));
    if (!atClub.length) {
      resolveDrama(save, d, "sold", today);
      continue;
    }
    if (atClub.length < d.playerIds.length) d.playerIds = atClub;

    // Penalty if ignored and not in XI
    const sincePenalty = d.lastPenaltyOn
      ? daysBetween(d.lastPenaltyOn, today)
      : daysBetween(d.startedOn, today);
    if (sincePenalty >= DRAMA_PENALTY_INTERVAL_DAYS) {
      const anyNotInXi = atClub.some((id) => !playerInXi(save, id));
      if (anyNotInXi && applyDramaPenalty(save, d)) {
        d.lastPenaltyOn = today;
      }
    }

    // Reminder news ~ every 14 days
    const sinceNews = d.lastNewsOn ? daysBetween(d.lastNewsOn, today) : 99;
    if (sinceNews >= 14) {
      const ps = atClub
        .map((id) => save.players.find((p) => p.id === id))
        .filter(Boolean) as Player[];
      if (ps.length) {
        save.news.unshift(reminderNews(d, ps, today));
        d.lastNewsOn = today;
      }
    }
  }

  tryResolveDramasByLineup(save, save.clubId);
  trySpawnUserDrama(pack, save, rng);

  // Trim resolved history
  save.squadDramas = ensureDramas(save)
    .filter((d) => d.status === "active" || (d.resolvedOn && daysBetween(d.resolvedOn, today) < 120))
    .slice(0, 40);
}

/** Normalize / migrate drama array from raw saves. */
export function normalizeSquadDramas(raw: unknown): SquadDrama[] {
  if (!Array.isArray(raw)) return [];
  const out: SquadDrama[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const d = item as Partial<SquadDrama>;
    if (typeof d.id !== "string") continue;
    if (!Array.isArray(d.playerIds) || !d.playerIds.every((x) => typeof x === "string")) continue;
    if (typeof d.clubId !== "string" || typeof d.startedOn !== "string") continue;
    const kind = typeof d.kind === "string" && (KINDS as string[]).includes(d.kind)
      ? (d.kind as SquadDramaKind)
      : "playing_time";
    const status = d.status === "resolved" || d.status === "cooled" ? d.status : "active";
    // Deduplicate while preserving order (two-player kinds keep both IDs).
    const playerIds = [...new Set(d.playerIds)];
    out.push({
      id: d.id,
      kind,
      playerIds,
      clubId: d.clubId,
      startedOn: d.startedOn,
      status,
      lastPenaltyOn: typeof d.lastPenaltyOn === "string" ? d.lastPenaltyOn : undefined,
      lastNewsOn: typeof d.lastNewsOn === "string" ? d.lastNewsOn : undefined,
      startsStreak: typeof d.startsStreak === "number" ? d.startsStreak : 0,
      resolvedOn: typeof d.resolvedOn === "string" ? d.resolvedOn : undefined,
      resolvedReason:
        d.resolvedReason === "sold" ||
        d.resolvedReason === "loaned" ||
        d.resolvedReason === "starting_xi" ||
        d.resolvedReason === "cooled"
          ? d.resolvedReason
          : undefined,
    });
  }
  return out;
}

function livingPlayerIds(save: CareerSave, ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    if (!save.players.some((p) => p.id === id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Backfill drama news `relatedPlayerIds` from matching `squadDramas` entries
 * (old saves / truncated payloads may only have the speaker).
 */
export function enrichDramaNewsPlayerIds(save: CareerSave): void {
  const dramas = save.squadDramas ?? [];
  if (!dramas.length || !Array.isArray(save.news)) return;
  for (const item of save.news) {
    if (item.category !== "drama") continue;
    const fromDrama = dramas.find((d) => item.id.includes(d.id));
    if (fromDrama && fromDrama.playerIds.length >= 2) {
      item.relatedPlayerIds = [...fromDrama.playerIds];
      continue;
    }
    const existing = item.relatedPlayerIds ?? [];
    if (existing.length >= 2) continue;
    if (fromDrama && fromDrama.playerIds.length > existing.length) {
      item.relatedPlayerIds = [...fromDrama.playerIds];
    }
  }
}

/**
 * Two living player IDs for a vertical compare when news is a multi-player drama.
 * Falls back to matching squad drama when news only carried one id.
 */
export function newsComparePlayerIds(
  item: NewsItem,
  save: CareerSave
): [string, string] | null {
  if (item.category !== "drama") return null;

  let ids = livingPlayerIds(save, item.relatedPlayerIds ?? []);

  if (ids.length < 2) {
    for (const d of save.squadDramas ?? []) {
      const hit =
        item.id.includes(d.id) ||
        ids.some((id) => d.playerIds.includes(id)) ||
        (item.relatedPlayerIds ?? []).some((id) => d.playerIds.includes(id));
      if (!hit) continue;
      ids = livingPlayerIds(save, d.playerIds);
      if (ids.length >= 2) break;
    }
  }

  if (ids.length < 2 && item.speaker?.playerId) {
    const speaker = item.speaker.playerId;
    const partner = (item.relatedPlayerIds ?? []).find(
      (id) => id !== speaker && save.players.some((p) => p.id === id)
    );
    if (partner && save.players.some((p) => p.id === speaker)) {
      ids = [speaker, partner];
    }
  }

  // Last resort: any active two-player drama at the user club that overlaps the speaker.
  if (ids.length < 2 && item.speaker?.playerId) {
    const speaker = item.speaker.playerId;
    for (const d of save.squadDramas ?? []) {
      if (d.status !== "active") continue;
      if (!d.playerIds.includes(speaker)) continue;
      ids = livingPlayerIds(save, d.playerIds);
      if (ids.length >= 2) break;
    }
  }

  if (ids.length < 2) return null;
  return [ids[0]!, ids[1]!];
}

/** Test helper: force-spawn with fixed kind/players (bypasses RNG spawn gate). */
export function forceSpawnDrama(
  save: CareerSave,
  kind: SquadDramaKind,
  playerIds: string[],
  clubName = "Клуб"
): SquadDrama {
  const players = playerIds
    .map((id) => save.players.find((p) => p.id === id))
    .filter(Boolean) as Player[];
  const rng = new Rng(1);
  return buildDrama(save, kind, players, clubName, rng);
}
