import type {
  CareerSave,
  Club,
  IncomingTransferOffer,
  OutgoingTransferOffer,
  Player,
  TransferDealRecord,
  TransferResult,
  TransferWindow,
  WindowTransferReport,
  WorldPack,
} from "./types";
import {
  evaluatePlayerTransferWillingness,
  evaluateWageAffordability,
  playerSquadRole,
  sellerAskDiscountForBuyerStrength,
} from "./agency";
import { formatMarketValue, primaryPosition } from "./labels";
import { computePlayerWage, recomputeMarketValue } from "./players";
import { Rng } from "./rng";
import { analyzeSquadNeeds, topSquadNeedPositions } from "./squadNeeds";
import { autoSelectLineup, defaultTactics } from "./tactics";
import { clearSquadDramasForPlayers } from "./squadDrama";
import { seasonEuroGuestIds } from "./continental";

function roundFee(n: number): number {
  return Math.round(Math.max(0, n) * 10) / 10;
}

function stableUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Build summer + winter windows from pack season (e.g. "2025/26"). */
export function buildTransferWindows(season: string): TransferWindow[] {
  const startYear = Number(season.slice(0, 4));
  const endYear = startYear + 1;
  return [
    {
      id: "summer_open",
      label: "Летнее окно",
      from: `${startYear}-07-01`,
      to: `${startYear}-08-31`,
    },
    {
      id: "winter",
      label: "Зимнее окно",
      from: `${endYear}-01-01`,
      to: `${endYear}-01-31`,
    },
    {
      id: "summer_close",
      label: "Летнее окно",
      from: `${endYear}-06-01`,
      to: `${endYear}-07-31`,
    },
  ];
}

export function seedClubFinances(pack: WorldPack): CareerSave["clubFinances"] {
  const out: CareerSave["clubFinances"] = {};
  for (const c of pack.clubs) {
    // Transfer cash only — wages are seasonal costs tracked separately; keep budget healthy at start.
    const budget = c.budget ?? Math.round(c.reputation * 0.55 + 8);
    out[c.id] = { budget };
  }
  return out;
}

export function getActiveTransferWindow(
  save: CareerSave,
  date = save.currentDate
): TransferWindow | null {
  return (save.transferWindows ?? []).find((w) => date >= w.from && date <= w.to) ?? null;
}

export function getNextTransferWindow(
  save: CareerSave,
  date = save.currentDate
): TransferWindow | null {
  const upcoming = (save.transferWindows ?? [])
    .filter((w) => w.from > date)
    .sort((a, b) => a.from.localeCompare(b.from));
  return upcoming[0] ?? null;
}

export function isTransferWindowOpen(save: CareerSave, date = save.currentDate): boolean {
  return getActiveTransferWindow(save, date) != null;
}

export function clubBudget(save: CareerSave, clubId: string): number {
  return save.clubFinances?.[clubId]?.budget ?? 0;
}

function ensureFinances(save: CareerSave, clubId: string): void {
  if (!save.clubFinances) save.clubFinances = {};
  if (!save.clubFinances[clubId]) save.clubFinances[clubId] = { budget: 10 };
}

function ensureTransferLog(save: CareerSave): TransferDealRecord[] {
  if (!save.transferLog) save.transferLog = [];
  return save.transferLog;
}

function appendCareerMove(
  player: Player,
  move: {
    date: string;
    kind: "permanent" | "loan" | "loan_return";
    fromClubId: string;
    toClubId: string;
    fee: number;
    fromClubName?: string;
    toClubName?: string;
  }
): void {
  if (!player.careerMoves) player.careerMoves = [];
  player.careerMoves.unshift(move);
  player.careerMoves = player.careerMoves.slice(0, 40);
}

/** High-fee / headline deals in a window (absolute floor or top of the window). */
export function isBigTransfer(
  deal: TransferDealRecord,
  windowDeals: TransferDealRecord[],
  absoluteFloor = 20
): boolean {
  if (deal.kind !== "permanent") return false;
  if (deal.fee >= absoluteFloor) return true;
  const fees = windowDeals
    .filter((d) => d.kind === "permanent")
    .map((d) => d.fee)
    .sort((a, b) => b - a);
  if (fees.length < 4) return deal.fee >= Math.max(12, absoluteFloor * 0.6);
  const cut = fees[Math.max(0, Math.ceil(fees.length * 0.15) - 1)] ?? absoluteFloor;
  return deal.fee >= cut && deal.fee >= 8;
}

function recordDeal(
  save: CareerSave,
  deal: Omit<TransferDealRecord, "id" | "windowId"> & { windowId?: string }
): void {
  const window = getActiveTransferWindow(save, deal.date) ?? getActiveTransferWindow(save);
  const log = ensureTransferLog(save);
  log.unshift({
    id: `deal-${deal.playerId}-${deal.date}-${log.length}`,
    windowId: deal.windowId ?? window?.id ?? "unknown",
    ...deal,
  });
  // Cap log size
  save.transferLog = log.slice(0, 200);
}

export function buildWindowReport(
  save: CareerSave,
  window: TransferWindow,
  closedOn: string
): WindowTransferReport {
  const deals = (save.transferLog ?? []).filter(
    (d) =>
      d.windowId === window.id || (d.date >= window.from && d.date <= window.to)
  );
  return {
    windowId: window.id,
    label: window.label,
    from: window.from,
    to: window.to,
    closedOn,
    deals,
  };
}

/** Call after calendar day advances: if a window just ended, attach a report. */
export function detectClosedTransferWindow(save: CareerSave, previousDate: string): void {
  const was = getActiveTransferWindow(save, previousDate);
  if (!was) return;
  if (isTransferWindowOpen(save)) return;
  if (save.pendingWindowReport?.windowId === was.id) return;
  save.pendingWindowReport = buildWindowReport(save, was, save.currentDate);
}

export function clearWindowReport(save: CareerSave): CareerSave {
  const next = structuredClone(save) as CareerSave;
  next.pendingWindowReport = null;
  return next;
}

/** Players from other clubs the user can bid on (all leagues by default). */
export type TransferMarketScope = "all" | "league" | "other" | "euro";

function sortTransferPool(a: Player, b: Player): number {
  return (b.marketValue ?? 0) - (a.marketValue ?? 0) || b.overall - a.overall;
}

function takeTopPlayers(pool: Player[], n: number): Player[] {
  if (n <= 0 || pool.length === 0) return [];
  return [...pool].sort(sortTransferPool).slice(0, n);
}

/**
 * Classify a club for the transfer market:
 * - league: user's domestic championship
 * - other: other playable domestic leagues in the pack
 * - euro: guest euro-cup clubs (UCL/UEL/UECL pool)
 */
export function transferClubScope(
  pack: WorldPack,
  save: CareerSave,
  clubId: string
): TransferMarketScope | null {
  const homeLeague = pack.leagues.find((l) => l.clubIds.includes(save.clubId));
  if (homeLeague?.clubIds.includes(clubId)) return "league";
  const club = pack.clubs.find((c) => c.id === clubId);
  if (!club) return null;
  if (club.guest) return "euro";
  const inOtherLeague = pack.leagues.some(
    (l) => l.id !== homeLeague?.id && l.clubIds.includes(clubId)
  );
  if (inOtherLeague) return "other";
  // Guests that somehow aren't flagged, or euro-only entrants
  const euroGuests = new Set(seasonEuroGuestIds(pack, save.season, save.uefa));
  if (euroGuests.has(clubId)) return "euro";
  return null;
}

export function listTransferTargets(
  pack: WorldPack,
  save: CareerSave,
  opts?: { leagueOnly?: boolean; scope?: TransferMarketScope; limit?: number }
): Player[] {
  const homeLeague = pack.leagues.find((l) => l.clubIds.includes(save.clubId));
  const leagueSet = new Set(homeLeague?.clubIds ?? []);
  const leagueOnly = opts?.leagueOnly ?? false;
  const scope: TransferMarketScope = opts?.scope ?? (leagueOnly ? "league" : "all");
  const limit = opts?.limit ?? 200;

  const clubsById = new Map(pack.clubs.map((c) => [c.id, c]));
  const otherLeagueIds = new Set(
    pack.leagues
      .filter((l) => l.id !== homeLeague?.id)
      .flatMap((l) => l.clubIds)
  );
  let euroIds = new Set(seasonEuroGuestIds(pack, save.season, save.uefa));
  if (euroIds.size === 0) {
    for (const c of pack.clubs) {
      if (c.guest) euroIds.add(c.id);
    }
  } else {
    // Always include flagged guests even if not drawn this season — market depth
    for (const c of pack.clubs) {
      if (c.guest) euroIds.add(c.id);
    }
  }

  const buckets: Record<"league" | "other" | "euro", Player[]> = {
    league: [],
    other: [],
    euro: [],
  };

  for (const p of save.players) {
    if (!p.clubId || p.clubId === save.clubId) continue;
    if (leagueSet.has(p.clubId)) {
      buckets.league.push(p);
      continue;
    }
    if (euroIds.has(p.clubId) || clubsById.get(p.clubId)?.guest) {
      buckets.euro.push(p);
      continue;
    }
    if (otherLeagueIds.has(p.clubId)) {
      buckets.other.push(p);
    }
  }

  if (scope === "league") return takeTopPlayers(buckets.league, limit);
  if (scope === "other") return takeTopPlayers(buckets.other, limit);
  if (scope === "euro") return takeTopPlayers(buckets.euro, limit);

  // «Все»: balanced mix so same-league depth doesn't drown out other leagues / euro guests.
  const nLeague = Math.ceil(limit * 0.4);
  const nOther = Math.ceil(limit * 0.35);
  const nEuro = Math.max(8, limit - nLeague - nOther);
  const picked = [
    ...takeTopPlayers(buckets.league, nLeague),
    ...takeTopPlayers(buckets.other, nOther),
    ...takeTopPlayers(buckets.euro, nEuro),
  ];
  const seen = new Set(picked.map((p) => p.id));
  if (picked.length < limit) {
    const rest = [...buckets.league, ...buckets.other, ...buckets.euro]
      .filter((p) => !seen.has(p.id))
      .sort(sortTransferPool);
    for (const p of rest) {
      picked.push(p);
      if (picked.length >= limit) break;
    }
  }
  return picked.slice(0, limit).sort(sortTransferPool);
}

export interface BuyNegotiation {
  playerId: string;
  marketValue: number;
  /** Hidden threshold the seller will accept. */
  minAccept: number;
  /** Realistic ceiling (~1.85× MV) — above this bids are rejected as absurd. */
  hardCeil: number;
  sellerClubId: string;
  sellerName: string;
}

/**
 * Seller ask relative to market value — usually not instant at face value.
 * Real-world-ish: 5–55% markup, hard cap near ~85% above MV.
 */
export function getBuyNegotiation(
  pack: WorldPack,
  save: CareerSave,
  playerId: string
): BuyNegotiation | null {
  const player = save.players.find((p) => p.id === playerId);
  if (!player?.clubId || player.clubId === save.clubId) return null;
  const seller = pack.clubs.find((c) => c.id === player.clubId);
  const buyer = pack.clubs.find((c) => c.id === save.clubId);
  if (!seller || !buyer) return null;

  const marketValue = roundFee(player.marketValue ?? 0);
  if (marketValue <= 0) {
    return {
      playerId,
      marketValue: 0.5,
      minAccept: 0.5,
      hardCeil: 1,
      sellerClubId: seller.id,
      sellerName: seller.name,
    };
  }

  const squad = save.players.filter((p) => p.clubId === seller.id);
  const samePos = squad.filter((p) => primaryPosition(p) === primaryPosition(player));
  const avgOvr =
    squad.reduce((s, p) => s + p.overall, 0) / Math.max(1, squad.length);
  const u = stableUnit(`${player.id}:${seller.id}:ask`);
  const role = playerSquadRole(pack, save, player);
  const prestigeDiscount = sellerAskDiscountForBuyerStrength(pack, save, buyer.id, seller.id);

  let markup = 1.08 + u * 0.12; // 8–20% base
  if (player.overall >= avgOvr + 4) markup += 0.12; // important starter
  if (player.overall >= avgOvr + 8) markup += 0.1; // star
  if (role === "starter") markup += 0.08;
  else if (role === "fringe") markup -= 0.06;
  else if (role === "bench") markup -= 0.03;
  if (player.age <= 24 && player.potential - player.overall >= 8) markup += 0.1;
  if (samePos.length <= 3) markup += 0.12; // thin depth — reluctant
  if (samePos.length >= 6 && player.overall < avgOvr) markup -= 0.08; // surplus
  if (seller.reputation > buyer.reputation + 12) markup += 0.08;
  if (buyer.reputation > seller.reputation + 15) markup -= 0.06; // bigger club leverage
  markup -= prestigeDiscount; // stronger buyer → seller less greedy

  markup = Math.max(1.02, Math.min(1.55, markup));
  const minAccept = roundFee(marketValue * markup);
  // ~1.85× is already a hefty premium in real transfers; don't go past ~2×
  const hardCeil = roundFee(Math.max(minAccept + 0.5, marketValue * 1.85));

  return {
    playerId,
    marketValue,
    minAccept,
    hardCeil,
    sellerClubId: seller.id,
    sellerName: seller.name,
  };
}

export function raiseBuyOffer(current: number, marketValue: number, hardCeil: number, step: "small" | "medium" | "large"): number {
  const mv = Math.max(0.5, marketValue);
  const bump =
    step === "small"
      ? Math.max(0.5, roundFee(mv * 0.05))
      : step === "medium"
        ? Math.max(1, roundFee(mv * 0.1))
        : Math.max(2, roundFee(mv * 0.2));
  return roundFee(Math.min(hardCeil, current + bump));
}

export type OfferDecision =
  | { status: "accept"; message: string }
  | { status: "reject"; message: string }
  | { status: "insult"; message: string }
  | { status: "cap"; message: string }
  | { status: "player"; message: string }
  | { status: "wage"; message: string };

const MAX_SWAP_PLAYERS = 2;

/** How much cash a swap player offsets in negotiations (~80% of MV). */
export function swapCreditForPlayers(players: Player[]): number {
  if (!players.length) return 0;
  return roundFee(players.reduce((s, p) => s + Math.max(0.3, p.marketValue ?? 0) * 0.8, 0));
}

export function listSwapCandidates(save: CareerSave, targetPlayerId?: string): Player[] {
  return save.players
    .filter(
      (p) =>
        p.clubId === save.clubId &&
        !p.loan &&
        p.id !== targetPlayerId
    )
    .sort((a, b) => (a.marketValue ?? 0) - (b.marketValue ?? 0) || a.overall - b.overall);
}

function sellerValuesSwap(
  pack: WorldPack,
  save: CareerSave,
  sellerClubId: string,
  swapPlayers: Player[]
): { ok: boolean; message?: string; bonus: number } {
  if (!swapPlayers.length) return { ok: true, bonus: 0 };
  if (swapPlayers.length > MAX_SWAP_PLAYERS) {
    return { ok: false, message: `В обмен можно предложить не больше ${MAX_SWAP_PLAYERS} игроков.`, bonus: 0 };
  }
  const needs = analyzeSquadNeeds(save.players, sellerClubId);
  const want = new Set(topSquadNeedPositions(needs, 3));
  const sellerSquad = save.players.filter((p) => p.clubId === sellerClubId && !p.loan);
  const sellerRep = pack.clubs.find((c) => c.id === sellerClubId)?.reputation ?? 70;
  let bonus = 0;

  for (const sp of swapPlayers) {
    if (sp.clubId !== save.clubId || sp.loan) {
      return { ok: false, message: "В обмен можно отдавать только своих игроков не в аренде.", bonus: 0 };
    }
    if (sp.overall >= 88) {
      return {
        ok: false,
        message: `«${pack.clubs.find((c) => c.id === sellerClubId)?.shortName ?? "Клуб"}» не хочет брать звезду ${sp.overall} взамен — просят деньги.`,
        bonus: 0,
      };
    }
    const pos = primaryPosition(sp);
    const depth = sellerSquad.filter((p) => primaryPosition(p) === pos).length;
    if (want.has(pos) || depth < 3) {
      bonus += Math.max(0.3, (sp.marketValue ?? 0) * 0.12);
    } else if (sp.overall + 6 < sellerRep) {
      // Clear downgrade they don't need — low credit already applied; soft reject if all are junk
      bonus -= 0.4;
    } else {
      bonus += 0.15;
    }
  }
  return { ok: true, bonus: roundFee(bonus) };
}

/** Seller reaction to an offer (does not mutate save). */
export function evaluateBuyOffer(
  neg: BuyNegotiation,
  offer: number,
  opts?: {
    pack?: WorldPack;
    save?: CareerSave;
    swapPlayers?: Player[];
    /** Buying club (defaults to save.clubId). */
    buyerClubId?: string;
  }
): OfferDecision {
  const fee = roundFee(offer);
  const swaps = opts?.swapPlayers ?? [];
  const swapCredit = swapCreditForPlayers(swaps);
  let sellerBonus = 0;

  if (swaps.length && opts?.pack && opts?.save) {
    const valued = sellerValuesSwap(opts.pack, opts.save, neg.sellerClubId, swaps);
    if (!valued.ok) {
      return { status: "reject", message: valued.message ?? "Обмен отклонён." };
    }
    sellerBonus = valued.bonus;
  } else if (swaps.length && (!opts?.pack || !opts?.save)) {
    // Without context still count raw swap credit
  }

  const totalValue = roundFee(fee + swapCredit + Math.max(0, sellerBonus));

  // Cash alone can still hit the absurd ceiling; swaps don't inflate the cash cap check the same way
  if (fee > neg.hardCeil + 0.05 && !swaps.length) {
    return {
      status: "cap",
      message: `Слишком завышенная сумма. В реалиях рынка потолок около ${formatMarketValue(neg.hardCeil)}.`,
    };
  }
  if (fee > neg.hardCeil + swapCredit + 0.05) {
    return {
      status: "cap",
      message: `Даже с обменом клуб не возьмёт больше ~${formatMarketValue(neg.hardCeil)} кэшем.`,
    };
  }

  const floor = neg.marketValue * 0.95;
  if (totalValue < floor) {
    return {
      status: "insult",
      message: swaps.length
        ? `«${neg.sellerName}» считают пакет (деньги + обмен) слишком слабым.`
        : `«${neg.sellerName}» даже не рассматривают предложение ниже рыночной оценки.`,
    };
  }
  if (totalValue + 0.05 < neg.minAccept) {
    const gap = neg.minAccept - totalValue;
    const hint =
      gap >= neg.marketValue * 0.25
        ? "Клуб явно хочет заметно больше — добавьте денег или более сильного игрока в обмен."
        : gap >= neg.marketValue * 0.12
          ? "Близко: чуть больше кэша или ещё один игрок в пакет."
          : "Почти договорились — не хватает совсем чуть-чуть.";
    return {
      status: "reject",
      message: `«${neg.sellerName}» отклонили пакет на ~${formatMarketValue(totalValue)}. ${hint}`,
    };
  }

  // Clubs agree on fee — check wage fit and player willingness when context is available
  if (opts?.pack && opts?.save) {
    const buyerId = opts.buyerClubId ?? opts.save.clubId;
    const player = opts.save.players.find((p) => p.id === neg.playerId);
    if (player) {
      const wageCheck = evaluateWageAffordability(
        opts.pack,
        opts.save,
        buyerId,
        player.wage ?? 0
      );
      if (!wageCheck.ok) {
        return {
          status: "wage",
          message: wageCheck.message ?? "Зарплата игрока слишком высока для клуба.",
        };
      }
      const will = evaluatePlayerTransferWillingness(
        opts.pack,
        opts.save,
        player.id,
        buyerId
      );
      if (!will.ok) {
        return { status: "player", message: will.message };
      }
    }
  }

  const swapNote = swaps.length
    ? ` + обмен (${swaps.map((p) => p.lastName).join(", ")})`
    : "";
  return {
    status: "accept",
    message: `«${neg.sellerName}» согласны: ${formatMarketValue(fee)}${swapNote}.`,
  };
}

export function buyPlayer(
  pack: WorldPack,
  save: CareerSave,
  playerId: string,
  offeredFee?: number,
  swapPlayerIds: string[] = []
): TransferResult {
  if (!isTransferWindowOpen(save)) {
    return { ok: false, save, error: "Трансферное окно закрыто." };
  }
  const neg = getBuyNegotiation(pack, save, playerId);
  if (!neg) {
    return { ok: false, save, error: "Игрок недоступен." };
  }

  const uniqueSwapIds = [...new Set(swapPlayerIds)].slice(0, MAX_SWAP_PLAYERS);
  const swapPlayers = uniqueSwapIds
    .map((id) => save.players.find((p) => p.id === id))
    .filter((p): p is Player => !!p);

  if (swapPlayers.length !== uniqueSwapIds.length) {
    return { ok: false, save, error: "Один из игроков обмена не найден." };
  }
  for (const sp of swapPlayers) {
    if (sp.clubId !== save.clubId || sp.loan) {
      return { ok: false, save, error: "В обмен можно отдавать только своих игроков не в аренде." };
    }
  }

  const fee = roundFee(offeredFee ?? Math.max(0, neg.marketValue - swapCreditForPlayers(swapPlayers)));
  const verdict = evaluateBuyOffer(neg, fee, { pack, save, swapPlayers });
  if (verdict.status !== "accept") {
    return { ok: false, save, error: verdict.message };
  }

  const next = structuredClone(save) as CareerSave;
  const player = next.players.find((p) => p.id === playerId);
  if (!player || !player.clubId) {
    return { ok: false, save, error: "Игрок недоступен." };
  }
  if (player.clubId === next.clubId) {
    return { ok: false, save, error: "Игрок уже в вашем клубе." };
  }
  if (player.loan) {
    return { ok: false, save, error: "Игрок в аренде — доступна только аренда, не покупка у текущего клуба." };
  }

  const fromClubId = player.clubId;
  const ownSquadSize = next.players.filter((p) => p.clubId === next.clubId && !p.loan).length;
  if (ownSquadSize - swapPlayers.length < 16) {
    return { ok: false, save, error: "После обмена в составе останется слишком мало игроков." };
  }

  ensureFinances(next, next.clubId);
  ensureFinances(next, fromClubId);
  const budgetBefore = next.clubFinances[next.clubId].budget;
  if (budgetBefore < fee) {
    return { ok: false, save, error: "Недостаточно бюджета." };
  }

  const fromClub = pack.clubs.find((c) => c.id === fromClubId);
  const toClub = pack.clubs.find((c) => c.id === next.clubId);
  next.clubFinances[next.clubId].budget =
    Math.round((budgetBefore - fee) * 10) / 10;
  next.clubFinances[fromClubId].budget =
    Math.round((next.clubFinances[fromClubId].budget + fee) * 10) / 10;
  const budgetAfter = next.clubFinances[next.clubId].budget;

  // Move swap players to seller
  const swapNames: string[] = [];
  for (const id of uniqueSwapIds) {
    const sp = next.players.find((p) => p.id === id);
    if (!sp) continue;
    const swapFrom = next.clubId;
    sp.clubId = fromClubId;
    delete sp.loan;
    const sellerLeague = pack.leagues.find((l) => l.clubIds.includes(fromClubId))?.id;
    sp.wage = computePlayerWage(sp, fromClub, sellerLeague);
    appendCareerMove(sp, {
      date: next.currentDate,
      kind: "permanent",
      fromClubId: swapFrom,
      toClubId: fromClubId,
      fee: 0,
      fromClubName: toClub?.shortName ?? toClub?.name,
      toClubName: fromClub?.shortName ?? fromClub?.name,
    });
    swapNames.push(`${sp.firstName} ${sp.lastName}`);
    if (next.userTactics?.lineup?.includes(sp.id)) {
      next.userTactics = {
        ...next.userTactics,
        lineup: next.userTactics.lineup.filter((x) => x !== sp.id),
      };
    }
  }
  if (next.userTactics && next.userTactics.lineup.length < 11) {
    next.userTactics = defaultTactics(next.players, next.clubId, next.userTactics.formation);
  }

  player.clubId = next.clubId;
  player.marketValue = recomputeMarketValue(player, next.playerStats?.[player.id] ?? null);
  const buyerLeague = pack.leagues.find((l) => l.clubIds.includes(next.clubId))?.id;
  player.wage = computePlayerWage(player, toClub, buyerLeague);
  delete player.loan;
  appendCareerMove(player, {
    date: next.currentDate,
    kind: "permanent",
    fromClubId,
    toClubId: next.clubId,
    fee,
    fromClubName: fromClub?.shortName ?? fromClub?.name,
    toClubName: toClub?.shortName ?? toClub?.name,
  });
  if (!next.seasonStartMarketValues) next.seasonStartMarketValues = {};
  if (next.seasonStartMarketValues[player.id] == null) {
    next.seasonStartMarketValues[player.id] = player.marketValue;
  }

  const swapPart = swapNames.length ? `, обмен: ${swapNames.join(", ")}` : "";
  const overMv =
    fee > neg.marketValue + 0.05
      ? ` (оценка рынка ${formatMarketValue(neg.marketValue)})`
      : "";
  next.news.unshift({
    id: `news-transfer-buy-${player.id}-${next.currentDate}`,
    date: next.currentDate,
    category: "transfer",
    headline: `${player.firstName} ${player.lastName} → «${toClub?.shortName ?? "клуб"}»`,
    body: `Клуб приобрёл игрока за ${formatMarketValue(fee)} у «${fromClub?.name ?? fromClubId}»${swapPart}${overMv}. Бюджет: ${formatMarketValue(budgetBefore)} → ${formatMarketValue(budgetAfter)}.`,
    relatedClubIds: [next.clubId, fromClubId],
    relatedPlayerIds: [player.id, ...uniqueSwapIds],
  });
  recordDeal(next, {
    date: next.currentDate,
    kind: "permanent",
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    fromClubId,
    toClubId: next.clubId,
    fee,
  });

  return { ok: true, save: next, fee, budgetBefore, budgetAfter };
}

export function sellPlayer(
  pack: WorldPack,
  save: CareerSave,
  playerId: string,
  toClubId?: string,
  offeredFee?: number
): TransferResult {
  if (!isTransferWindowOpen(save)) {
    return { ok: false, save, error: "Трансферное окно закрыто." };
  }
  const next = structuredClone(save) as CareerSave;
  const player = next.players.find((p) => p.id === playerId);
  if (!player || player.clubId !== next.clubId) {
    return { ok: false, save, error: "Можно продать только своего игрока." };
  }
  if (player.loan) {
    return { ok: false, save, error: "Нельзя продать игрока, взятого в аренду." };
  }

  const squad = next.players.filter((p) => p.clubId === next.clubId);
  if (squad.length <= 16) {
    return { ok: false, save, error: "Слишком мало игроков в составе." };
  }

  const mv = player.marketValue ?? 0;
  const fee =
    offeredFee != null && Number.isFinite(offeredFee) && offeredFee > 0
      ? roundFee(offeredFee)
      : mv;
  const buyer =
    (toClubId && pack.clubs.find((c) => c.id === toClubId)) ||
    pickAiBuyer(pack, next, player);

  if (!buyer) {
    return { ok: false, save, error: "Покупатель не найден." };
  }

  const will = evaluatePlayerTransferWillingness(pack, next, player.id, buyer.id);
  if (!will.ok) {
    return { ok: false, save, error: will.message };
  }
  const wageOk = evaluateWageAffordability(pack, next, buyer.id, player.wage ?? 0);
  if (!wageOk.ok) {
    return {
      ok: false,
      save,
      error: wageOk.message ?? "Покупатель не потянет зарплату игрока.",
    };
  }

  ensureFinances(next, next.clubId);
  ensureFinances(next, buyer.id);
  if (next.clubFinances[buyer.id].budget < fee * 0.5) {
    // AI still buys — soft budget for AI
  }

  const budgetBefore = next.clubFinances[next.clubId].budget;
  next.clubFinances[next.clubId].budget =
    Math.round((budgetBefore + fee) * 10) / 10;
  next.clubFinances[buyer.id].budget = Math.max(
    0,
    Math.round((next.clubFinances[buyer.id].budget - fee) * 10) / 10
  );
  const budgetAfter = next.clubFinances[next.clubId].budget;

  const fromClub = pack.clubs.find((c) => c.id === next.clubId);
  const fromClubId = next.clubId;
  player.clubId = buyer.id;
  player.marketValue = recomputeMarketValue(player, next.playerStats?.[player.id] ?? null);
  const buyerLeague = pack.leagues.find((l) => l.clubIds.includes(buyer.id))?.id;
  player.wage = computePlayerWage(player, buyer, buyerLeague);
  appendCareerMove(player, {
    date: next.currentDate,
    kind: "permanent",
    fromClubId,
    toClubId: buyer.id,
    fee,
    fromClubName: fromClub?.shortName ?? fromClub?.name,
    toClubName: buyer.shortName ?? buyer.name,
  });

  // Remove from user lineup if present
  const tactics = next.userTactics ?? defaultTactics(next.players, next.clubId);
  next.userTactics = {
    ...tactics,
    lineup: (tactics.lineup ?? []).filter((id) => id !== playerId),
  };
  if (next.userTactics.lineup.length < 11) {
    next.userTactics = defaultTactics(next.players, next.clubId, next.userTactics.formation);
  }

  clearSquadDramasForPlayers(next, [playerId], "sold");

  next.news.unshift({
    id: `news-transfer-sell-${player.id}-${next.currentDate}`,
    date: next.currentDate,
    category: "transfer",
    headline: `${player.firstName} ${player.lastName} ушёл в «${buyer.shortName}»`,
    body: `«${fromClub?.name ?? next.clubId}» продали игрока за ${formatMarketValue(fee)}. Бюджет: ${formatMarketValue(budgetBefore)} → ${formatMarketValue(budgetAfter)}.`,
    relatedClubIds: [next.clubId, buyer.id],
    relatedPlayerIds: [player.id],
  });
  recordDeal(next, {
    date: next.currentDate,
    kind: "permanent",
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    fromClubId: next.clubId,
    toClubId: buyer.id,
    fee,
  });

  // Drop competing / obsolete offers for this player
  if (next.incomingTransferOffers?.length) {
    next.incomingTransferOffers = next.incomingTransferOffers.map((o) =>
      o.playerId === playerId && o.status === "pending"
        ? { ...o, status: "expired" as const }
        : o
    );
  }

  return { ok: true, save: next, fee, budgetBefore, budgetAfter };
}

/** Status of an AI club as a destination for a user sell/loan. */
export type OutboundOfferStatus =
  | "ready"
  | "player_refuse"
  | "no_budget"
  | "no_interest"
  | "wage"
  | "squad_full";

export type OutboundClubOffer = {
  clubId: string;
  leagueId: string;
  fee: number;
  status: OutboundOfferStatus;
  reason?: string;
  /** Loan only: would the player start for the host. */
  wouldStart?: boolean;
};

function leagueIdForClub(pack: WorldPack, clubId: string): string {
  return pack.leagues.find((l) => l.clubIds.includes(clubId))?.id ?? "other";
}

/** Deterministic fee an AI club would table for this player. */
function aiOutboundBuyFee(
  pack: WorldPack,
  save: CareerSave,
  player: Player,
  buyerId: string,
  needsPosition: boolean
): number {
  const mv = Math.max(0.5, player.marketValue ?? 0.5);
  const budget = clubBudget(save, buyerId);
  const prestige = sellerAskDiscountForBuyerStrength(pack, save, buyerId, save.clubId);
  const unit = stableUnit(`${player.id}:${buyerId}:outfee`);
  const stretch =
    0.9 + unit * 0.22 + (needsPosition ? 0.06 : 0) + (budget > mv * 2 ? 0.05 : 0) - prestige * 0.85;
  let fee = roundFee(Math.min(budget * 0.9, mv * Math.max(0.78, stretch)));
  if (fee < mv * 0.72) fee = roundFee(Math.min(budget * 0.82, mv * 0.82));
  return Math.max(0.5, fee);
}

/**
 * Clubs that could buy a user player — grouped later by UI by league.
 * Ready rows have a real offer fee; others explain why the deal is blocked.
 */
export function listSellClubOffers(
  pack: WorldPack,
  save: CareerSave,
  playerId: string
): OutboundClubOffer[] {
  const player = save.players.find((p) => p.id === playerId);
  if (!player || player.clubId !== save.clubId || player.loan) return [];

  const userSquad = save.players.filter((p) => p.clubId === save.clubId && !p.loan);
  if (userSquad.length <= 16) {
    return pack.clubs
      .filter((c) => c.id !== save.clubId)
      .map((c) => ({
        clubId: c.id,
        leagueId: leagueIdForClub(pack, c.id),
        fee: 0,
        status: "squad_full" as const,
        reason: "Слишком мало игроков в составе.",
      }));
  }

  const pos = primaryPosition(player);
  const mv = player.marketValue ?? 0;
  const xiCache = { xiByClub: new Map<string, Set<string>>() };
  const offers: OutboundClubOffer[] = [];

  for (const club of pack.clubs) {
    if (club.id === save.clubId) continue;
    const leagueId = leagueIdForClub(pack, club.id);
    const budget = clubBudget(save, club.id);
    const needs = analyzeSquadNeeds(save.players, club.id);
    const want = new Set(topSquadNeedPositions(needs, 3));
    const needsPos = want.has(pos);

    if (budget < Math.max(0.8, mv * 0.35)) {
      offers.push({
        clubId: club.id,
        leagueId,
        fee: 0,
        status: "no_budget",
        reason: "Не хватает бюджета",
      });
      continue;
    }

    const wageOk = evaluateWageAffordability(pack, save, club.id, player.wage ?? 0);
    if (!wageOk.ok) {
      offers.push({
        clubId: club.id,
        leagueId,
        fee: 0,
        status: "wage",
        reason: wageOk.message ?? "Не потянут зарплату",
      });
      continue;
    }

    const will = evaluatePlayerTransferWillingness(pack, save, player.id, club.id, xiCache);
    if (!will.ok) {
      offers.push({
        clubId: club.id,
        leagueId,
        fee: 0,
        status: "player_refuse",
        reason: will.message,
      });
      continue;
    }

    // Soft interest: need position, or gap vs squad level, or rich mid-table shopper
    const hostSquad = save.players.filter((p) => p.clubId === club.id && !p.loan);
    const samePos = hostSquad.filter((p) => primaryPosition(p) === pos);
    const bestSame = samePos.sort((a, b) => b.overall - a.overall)[0];
    const interested =
      needsPos ||
      !bestSame ||
      player.overall >= bestSame.overall - 2 ||
      (club.reputation + 8 >= (player.overall ?? 70) && budget >= mv * 0.85);

    if (!interested) {
      offers.push({
        clubId: club.id,
        leagueId,
        fee: 0,
        status: "no_interest",
        reason: "Клуб не заинтересован",
      });
      continue;
    }

    const fee = aiOutboundBuyFee(pack, save, player, club.id, needsPos);
    if (fee > budget) {
      offers.push({
        clubId: club.id,
        leagueId,
        fee: 0,
        status: "no_budget",
        reason: "Не хватает бюджета",
      });
      continue;
    }

    offers.push({
      clubId: club.id,
      leagueId,
      fee,
      status: "ready",
      reason: will.message,
    });
  }

  return offers.sort((a, b) => {
    if (a.status === "ready" && b.status !== "ready") return -1;
    if (b.status === "ready" && a.status !== "ready") return 1;
    return b.fee - a.fee;
  });
}

function pickAiBuyer(pack: WorldPack, save: CareerSave, player: Player): Club | undefined {
  const ready = listSellClubOffers(pack, save, player.id).filter((o) => o.status === "ready");
  if (ready.length) {
    return pack.clubs.find((c) => c.id === ready[0]!.clubId);
  }
  const league = pack.leagues.find((l) => l.clubIds.includes(save.clubId));
  const candidates = pack.clubs.filter((c) => {
    if (c.id === save.clubId) return false;
    if (league && !league.clubIds.includes(c.id)) return false;
    const budget = save.clubFinances?.[c.id]?.budget ?? c.budget ?? 0;
    return budget >= (player.marketValue ?? 0) * 0.4;
  });
  if (!candidates.length) {
    return pack.clubs.find((c) => c.id !== save.clubId);
  }
  candidates.sort((a, b) => b.reputation - a.reputation);
  return candidates[Math.floor(candidates.length / 3)] ?? candidates[0];
}

/**
 * AI clubs deal among themselves during open windows (never touches user club).
 * Sparse but visible: often 0–2 deals per day so the market feed stays alive.
 */
export function simulateAiTransfers(pack: WorldPack, save: CareerSave, rng: Rng): void {
  if (!isTransferWindowOpen(save)) return;
  const league = pack.leagues.find((l) => l.clubIds.includes(save.clubId));
  const clubIds = (league?.clubIds ?? pack.clubs.map((c) => c.id)).filter(
    (id) => id !== save.clubId
  );
  if (clubIds.length < 2) return;

  const dealCount = rng.chance(0.58) ? (rng.chance(0.28) ? 2 : 1) : 0;
  const xiCache = { xiByClub: new Map<string, Set<string>>() };
  for (let i = 0; i < dealCount; i++) {
    const buyers = [...clubIds].sort(() => rng.next() - 0.5);
    let done = false;
    for (const buyerId of buyers) {
      if (done) break;
      const needs = analyzeSquadNeeds(save.players, buyerId);
      let want = topSquadNeedPositions(needs, 2);
      // Balanced squads still shop: pick a random line to reinforce.
      if (!want.length) {
        want = [rng.pick(["FW", "MF", "DF", "GK"] as const)];
      }
      const budget = clubBudget(save, buyerId);
      if (budget < 1.5) continue;

      const sellers = clubIds.filter((id) => id !== buyerId);
      for (const sellerId of sellers) {
        const sellerSquad = save.players.filter((p) => p.clubId === sellerId);
        if (sellerSquad.length <= 17) continue;
        const sellerNeeds = analyzeSquadNeeds(save.players, sellerId);
        const sellerWeak = new Set(topSquadNeedPositions(sellerNeeds, 2));

        const candidates = sellerSquad
          .filter((p) => {
            if (p.loan) return false;
            const pos = primaryPosition(p);
            if (!want.includes(pos)) return false;
            if (sellerWeak.has(pos)) return false;
            const samePos = sellerSquad.filter((x) => primaryPosition(x) === pos).length;
            if (samePos < 3) return false;
            const fee = p.marketValue ?? 0;
            if (fee > budget * 0.85 || fee < 0.8) return false;
            // Prefer mid-tier moves, not stars stripping
            if (p.overall >= 86) return false;
            if (!evaluateWageAffordability(pack, save, buyerId, p.wage ?? 0).ok) return false;
            if (!evaluatePlayerTransferWillingness(pack, save, p.id, buyerId, xiCache).ok) {
              return false;
            }
            return true;
          })
          .sort((a, b) => (a.marketValue ?? 0) - (b.marketValue ?? 0));

        const pick = candidates[0];
        if (!pick) continue;

        const fee = Math.round((pick.marketValue ?? 1) * 10) / 10;
        ensureFinances(save, buyerId);
        ensureFinances(save, sellerId);
        if (save.clubFinances[buyerId].budget < fee * 0.55) continue;

        save.clubFinances[buyerId].budget =
          Math.round((save.clubFinances[buyerId].budget - fee) * 10) / 10;
        save.clubFinances[sellerId].budget =
          Math.round((save.clubFinances[sellerId].budget + fee) * 10) / 10;
        const fromClub = pack.clubs.find((c) => c.id === sellerId);
        const toClub = pack.clubs.find((c) => c.id === buyerId);
        pick.clubId = buyerId;
        pick.marketValue = recomputeMarketValue(pick, save.playerStats?.[pick.id] ?? null);
        const buyerLeague = pack.leagues.find((l) => l.clubIds.includes(buyerId))?.id;
        pick.wage = computePlayerWage(pick, toClub, buyerLeague);
        delete pick.loan;
        appendCareerMove(pick, {
          date: save.currentDate,
          kind: "permanent",
          fromClubId: sellerId,
          toClubId: buyerId,
          fee,
          fromClubName: fromClub?.shortName ?? fromClub?.name,
          toClubName: toClub?.shortName ?? toClub?.name,
        });
        save.news.unshift({
          id: `news-ai-transfer-${pick.id}-${save.currentDate}-${i}`,
          date: save.currentDate,
          category: "transfer",
          headline: `${pick.firstName} ${pick.lastName}: «${fromClub?.shortName}» → «${toClub?.shortName}»`,
          body: `Клубы договорились о переходе за ${formatMarketValue(fee)} в рамках трансферного окна.`,
          relatedClubIds: [sellerId, buyerId],
          relatedPlayerIds: [pick.id],
        });
        recordDeal(save, {
          date: save.currentDate,
          kind: "permanent",
          playerId: pick.id,
          playerName: `${pick.firstName} ${pick.lastName}`,
          fromClubId: sellerId,
          toClubId: buyerId,
          fee,
        });
        done = true;
        break;
      }
    }
  }
}

function ensureIncomingOffers(save: CareerSave): IncomingTransferOffer[] {
  if (!save.incomingTransferOffers) save.incomingTransferOffers = [];
  return save.incomingTransferOffers;
}

/** Expire pending bids when the window closes or the player left. */
export function expireStaleIncomingOffers(save: CareerSave): void {
  const offers = ensureIncomingOffers(save);
  const open = isTransferWindowOpen(save);
  const window = getActiveTransferWindow(save);
  for (const o of offers) {
    if (o.status !== "pending") continue;
    const player = save.players.find((p) => p.id === o.playerId);
    if (!open || !player || player.clubId !== save.clubId) {
      o.status = "expired";
      continue;
    }
    if (window && o.windowId !== window.id) o.status = "expired";
  }
  // Keep recent history short
  save.incomingTransferOffers = offers
    .filter((o) => o.status === "pending" || o.date >= save.currentDate.slice(0, 7))
    .slice(0, 40);
}

/**
 * Other clubs send buy requests for the user's players during the open window.
 * Multiple clubs may bid for the same player; user picks one or refuses all.
 */
export function generateIncomingTransferOffers(
  pack: WorldPack,
  save: CareerSave,
  rng: Rng
): void {
  if (!isTransferWindowOpen(save)) return;
  expireStaleIncomingOffers(save);
  const window = getActiveTransferWindow(save);
  if (!window) return;

  // Sparse: usually 0, sometimes 1–2 new bids per day
  if (!rng.chance(0.42)) return;
  const bidCount = rng.chance(0.3) ? 2 : 1;

  const league = pack.leagues.find((l) => l.clubIds.includes(save.clubId));
  const buyerIds = (league?.clubIds ?? pack.clubs.map((c) => c.id)).filter(
    (id) => id !== save.clubId
  );
  if (!buyerIds.length) return;

  const userSquad = save.players.filter(
    (p) => p.clubId === save.clubId && !p.loan && (p.marketValue ?? 0) >= 1.2
  );
  if (userSquad.length <= 16) return;

  const lineup = new Set(save.userTactics?.lineup ?? []);
  const pending = ensureIncomingOffers(save).filter((o) => o.status === "pending");
  const pendingKeys = new Set(pending.map((o) => `${o.playerId}:${o.buyingClubId}`));

  let created = 0;
  const buyersShuffled = [...buyerIds].sort(() => rng.next() - 0.5);
  const xiCache = { xiByClub: new Map<string, Set<string>>() };

  for (const buyerId of buyersShuffled) {
    if (created >= bidCount) break;
    const needs = analyzeSquadNeeds(save.players, buyerId);
    const want = new Set(topSquadNeedPositions(needs, 3));
    const budget = clubBudget(save, buyerId);
    if (budget < 2) continue;

    const candidates = userSquad
      .filter((p) => {
        if (pendingKeys.has(`${p.id}:${buyerId}`)) return false;
        const pos = primaryPosition(p);
        const mv = p.marketValue ?? 0;
        if (mv > budget * 0.9) return false;
        // Prefer need positions; otherwise bid on bench / surplus.
        const onNeed = want.size === 0 || want.has(pos);
        const onBench = !lineup.has(p.id);
        if (!onNeed && !onBench && !rng.chance(0.22)) return false;
        // Don't constantly bid for irreplaceable stars unless rich
        if (lineup.has(p.id) && p.overall >= 82 && budget < mv * 1.15) return false;
        const samePos = userSquad.filter((x) => primaryPosition(x) === pos).length;
        if (samePos < 2 && lineup.has(p.id)) return false;
        if (!evaluateWageAffordability(pack, save, buyerId, p.wage ?? 0).ok) return false;
        // Starters won't join a clear step down — don't even bid
        if (!evaluatePlayerTransferWillingness(pack, save, p.id, buyerId, xiCache).ok) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aNeed = want.has(primaryPosition(a)) ? 0 : 1;
        const bNeed = want.has(primaryPosition(b)) ? 0 : 1;
        if (aNeed !== bNeed) return aNeed - bNeed;
        return (b.marketValue ?? 0) - (a.marketValue ?? 0);
      });

    const pick = candidates[0];
    if (!pick) continue;

    const mv = Math.max(1, pick.marketValue ?? 1);
    // Fee around MV, capped by budget; richer / stronger clubs get softer asks
    const prestige = sellerAskDiscountForBuyerStrength(pack, save, buyerId, save.clubId);
    const stretch =
      0.88 + rng.next() * 0.32 + (budget > mv * 2 ? 0.08 : 0) - prestige * 0.9;
    let fee = roundFee(Math.min(budget * 0.92, mv * Math.max(0.78, stretch)));
    if (fee < mv * 0.75) fee = roundFee(Math.min(budget * 0.85, mv * 0.85));
    if (fee < 0.8 || fee > budget) continue;

    const offer: IncomingTransferOffer = {
      id: `inoffer-${pick.id}-${buyerId}-${save.currentDate}-${rng.int(1, 9999)}`,
      date: save.currentDate,
      windowId: window.id,
      playerId: pick.id,
      playerName: `${pick.firstName} ${pick.lastName}`,
      buyingClubId: buyerId,
      fee,
      status: "pending",
    };
    pendingKeys.add(`${pick.id}:${buyerId}`);
    save.incomingTransferOffers = [offer, ...ensureIncomingOffers(save)].slice(0, 40);
    const buyerClub = pack.clubs.find((c) => c.id === buyerId);
    save.news.unshift({
      id: `news-inoffer-${offer.id}`,
      date: save.currentDate,
      category: "transfer",
      headline: `«${buyerClub?.shortName ?? buyerId}» хочет купить ${pick.lastName}`,
      body: `Входящее предложение: ${pick.firstName} ${pick.lastName} за ${formatMarketValue(fee)}. Откройте Трансферы, чтобы принять или отклонить.`,
      relatedClubIds: [save.clubId, buyerId],
      relatedPlayerIds: [pick.id],
    });
    created++;
  }
}

export function listPendingIncomingOffers(save: CareerSave): IncomingTransferOffer[] {
  expireStaleIncomingOffers(save);
  return (save.incomingTransferOffers ?? []).filter((o) => o.status === "pending");
}

export function acceptIncomingOffer(
  pack: WorldPack,
  save: CareerSave,
  offerId: string
): TransferResult {
  if (!isTransferWindowOpen(save)) {
    return { ok: false, save, error: "Трансферное окно закрыто." };
  }
  const offer = (save.incomingTransferOffers ?? []).find(
    (o) => o.id === offerId && o.status === "pending"
  );
  if (!offer) {
    return { ok: false, save, error: "Предложение уже неактуально." };
  }
  const buyer = pack.clubs.find((c) => c.id === offer.buyingClubId);
  if (!buyer) {
    return { ok: false, save, error: "Клуб-покупатель не найден." };
  }
  const result = sellPlayer(pack, save, offer.playerId, offer.buyingClubId, offer.fee);
  if (!result.ok) return result;
  const next = result.save;
  if (next.incomingTransferOffers) {
    next.incomingTransferOffers = next.incomingTransferOffers.map((o) => {
      if (o.id === offerId) return { ...o, status: "accepted" as const };
      if (o.playerId === offer.playerId && o.status === "pending") {
        return { ...o, status: "expired" as const };
      }
      return o;
    });
  }
  return { ...result, save: next };
}

export function rejectIncomingOffer(save: CareerSave, offerId: string): CareerSave {
  const next = structuredClone(save) as CareerSave;
  if (!next.incomingTransferOffers) return next;
  next.incomingTransferOffers = next.incomingTransferOffers.map((o) =>
    o.id === offerId && o.status === "pending" ? { ...o, status: "rejected" as const } : o
  );
  return next;
}

/** Reject every pending bid for a player (or all pending bids if playerId omitted). */
export function rejectIncomingOffers(
  save: CareerSave,
  playerId?: string
): CareerSave {
  const next = structuredClone(save) as CareerSave;
  if (!next.incomingTransferOffers) return next;
  next.incomingTransferOffers = next.incomingTransferOffers.map((o) => {
    if (o.status !== "pending") return o;
    if (playerId && o.playerId !== playerId) return o;
    return { ...o, status: "rejected" as const };
  });
  return next;
}

function ensureOutgoingOffers(save: CareerSave): OutgoingTransferOffer[] {
  if (!save.outgoingTransferOffers) save.outgoingTransferOffers = [];
  return save.outgoingTransferOffers;
}

export function listPendingOutgoingOffers(save: CareerSave): OutgoingTransferOffer[] {
  return (save.outgoingTransferOffers ?? []).filter((o) => o.status === "pending");
}

export function expireStaleOutgoingOffers(save: CareerSave): void {
  const offers = ensureOutgoingOffers(save);
  const open = isTransferWindowOpen(save);
  const window = getActiveTransferWindow(save);
  for (const o of offers) {
    if (o.status !== "pending") continue;
    const player = save.players.find((p) => p.id === o.playerId);
    if (!open || !player || player.clubId === save.clubId) {
      o.status = "expired";
      continue;
    }
    if (o.kind === "buy" && player.clubId !== o.sellingClubId) {
      o.status = "expired";
      continue;
    }
    if (window && o.windowId !== window.id) o.status = "expired";
  }
  save.outgoingTransferOffers = offers
    .filter((o) => o.status === "pending" || o.date >= save.currentDate.slice(0, 7))
    .slice(0, 40);
}

export type SubmitOutgoingResult =
  | { ok: true; save: CareerSave; offer: OutgoingTransferOffer }
  | { ok: false; save: CareerSave; error: string };

/** Queue a buy offer — seller reply comes on the next calendar day / tour. */
export function submitOutgoingBuyOffer(
  pack: WorldPack,
  save: CareerSave,
  playerId: string,
  offeredFee: number,
  swapPlayerIds: string[] = []
): SubmitOutgoingResult {
  if (!isTransferWindowOpen(save)) {
    return { ok: false, save, error: "Трансферное окно закрыто." };
  }
  const window = getActiveTransferWindow(save);
  if (!window) {
    return { ok: false, save, error: "Трансферное окно закрыто." };
  }
  const neg = getBuyNegotiation(pack, save, playerId);
  if (!neg) {
    return { ok: false, save, error: "Игрок недоступен." };
  }
  const player = save.players.find((p) => p.id === playerId);
  if (!player?.clubId || player.clubId === save.clubId) {
    return { ok: false, save, error: "Игрок недоступен." };
  }
  const uniqueSwapIds = [...new Set(swapPlayerIds)].slice(0, MAX_SWAP_PLAYERS);
  for (const id of uniqueSwapIds) {
    const sp = save.players.find((p) => p.id === id);
    if (!sp || sp.clubId !== save.clubId || sp.loan) {
      return { ok: false, save, error: "В обмен можно отдавать только своих игроков не в аренде." };
    }
  }
  const fee = roundFee(offeredFee);
  if (clubBudget(save, save.clubId) < fee) {
    return { ok: false, save, error: "Недостаточно бюджета." };
  }
  const pending = listPendingOutgoingOffers(save);
  if (pending.some((o) => o.playerId === playerId && o.kind === "buy")) {
    return {
      ok: false,
      save,
      error: "По этому игроку уже есть ожидающее предложение. Дождитесь ответа к следующему туру.",
    };
  }

  const next = structuredClone(save) as CareerSave;
  const seller = pack.clubs.find((c) => c.id === player.clubId);
  const offer: OutgoingTransferOffer = {
    id: `outoffer-buy-${playerId}-${next.currentDate}-${ensureOutgoingOffers(next).length}`,
    date: next.currentDate,
    windowId: window.id,
    kind: "buy",
    playerId,
    playerName: `${player.firstName} ${player.lastName}`,
    sellingClubId: player.clubId,
    fee,
    swapPlayerIds: uniqueSwapIds,
    status: "pending",
  };
  next.outgoingTransferOffers = [offer, ...ensureOutgoingOffers(next)].slice(0, 40);
  next.news.unshift({
    id: `news-outoffer-sent-${offer.id}`,
    date: next.currentDate,
    category: "transfer",
    headline: `Предложение по ${player.lastName} отправлено`,
    body: `Вы предложили «${seller?.shortName ?? player.clubId}» ${formatMarketValue(fee)} за ${player.firstName} ${player.lastName}. Ответ клуба придёт к следующему туру (после продвижения календаря).`,
    relatedClubIds: [next.clubId, player.clubId],
    relatedPlayerIds: [playerId],
  });
  return { ok: true, save: next, offer };
}

/** Queue a loan request — parent club replies next tour. */
export function submitOutgoingLoanOffer(
  pack: WorldPack,
  save: CareerSave,
  playerId: string
): SubmitOutgoingResult {
  if (!isTransferWindowOpen(save)) {
    return { ok: false, save, error: "Трансферное окно закрыто." };
  }
  const window = getActiveTransferWindow(save);
  if (!window) {
    return { ok: false, save, error: "Трансферное окно закрыто." };
  }
  const player = save.players.find((p) => p.id === playerId);
  if (!player?.clubId || player.clubId === save.clubId) {
    return { ok: false, save, error: "Игрок недоступен." };
  }
  if (player.loan) {
    return { ok: false, save, error: "Игрок уже находится в аренде." };
  }
  const fee = loanFeeForPlayer(player);
  if (clubBudget(save, save.clubId) < fee) {
    return { ok: false, save, error: "Недостаточно бюджета на аренду." };
  }
  if (listPendingOutgoingOffers(save).some((o) => o.playerId === playerId && o.kind === "loan")) {
    return {
      ok: false,
      save,
      error: "Заявка на аренду уже отправлена. Ждите ответа к следующему туру.",
    };
  }

  const next = structuredClone(save) as CareerSave;
  const parent = pack.clubs.find((c) => c.id === player.clubId);
  const offer: OutgoingTransferOffer = {
    id: `outoffer-loan-${playerId}-${next.currentDate}-${ensureOutgoingOffers(next).length}`,
    date: next.currentDate,
    windowId: window.id,
    kind: "loan",
    playerId,
    playerName: `${player.firstName} ${player.lastName}`,
    sellingClubId: player.clubId,
    fee,
    status: "pending",
  };
  next.outgoingTransferOffers = [offer, ...ensureOutgoingOffers(next)].slice(0, 40);
  next.news.unshift({
    id: `news-outloan-sent-${offer.id}`,
    date: next.currentDate,
    category: "transfer",
    headline: `Заявка на аренду ${player.lastName} отправлена`,
    body: `Запрос аренды у «${parent?.shortName ?? player.clubId}» за ${formatMarketValue(fee)}. Ответ — к следующему туру.`,
    relatedClubIds: [next.clubId, player.clubId],
    relatedPlayerIds: [playerId],
  });
  return { ok: true, save: next, offer };
}

/**
 * Resolve pending outgoing offers submitted on a previous day.
 * Call when the calendar advances (bumpDate / next tour).
 */
export function resolveOutgoingTransferOffers(pack: WorldPack, save: CareerSave): void {
  expireStaleOutgoingOffers(save);
  const pendingIds = ensureOutgoingOffers(save)
    .filter((o) => o.status === "pending" && o.date < save.currentDate)
    .map((o) => o.id);
  if (!pendingIds.length) return;

  for (const offerId of pendingIds) {
    const offer = ensureOutgoingOffers(save).find((o) => o.id === offerId);
    if (!offer || offer.status !== "pending") continue;

    if (!isTransferWindowOpen(save)) {
      offer.status = "expired";
      save.news.unshift({
        id: `news-outoffer-expired-${offer.id}`,
        date: save.currentDate,
        category: "transfer",
        headline: `Предложение по ${offer.playerName} истекло`,
        body: "Трансферное окно закрылось до ответа клуба.",
        relatedClubIds: [save.clubId, offer.sellingClubId],
        relatedPlayerIds: [offer.playerId],
      });
      continue;
    }

    const seller = pack.clubs.find((c) => c.id === offer.sellingClubId);
    const sellerName = seller?.shortName ?? offer.sellingClubId;
    const surname = offer.playerName.split(" ").pop() ?? offer.playerName;

    if (offer.kind === "loan") {
      const verdict = evaluateLoanWillingness(pack, save, offer.playerId);
      if (!verdict.ok) {
        offer.status = "rejected";
        save.news.unshift({
          id: `news-outloan-rej-${offer.id}`,
          date: save.currentDate,
          category: "transfer",
          headline: `«${sellerName}» отклонили аренду ${surname}`,
          body: verdict.message,
          relatedClubIds: [save.clubId, offer.sellingClubId],
          relatedPlayerIds: [offer.playerId],
        });
        continue;
      }
      const outgoingSnap = save.outgoingTransferOffers;
      const result = loanPlayer(pack, save, offer.playerId);
      if (!result.ok) {
        offer.status = "rejected";
        save.news.unshift({
          id: `news-outloan-fail-${offer.id}`,
          date: save.currentDate,
          category: "transfer",
          headline: `Аренда ${surname} не состоялась`,
          body: result.error ?? "Клуб отказал в аренде.",
          relatedClubIds: [save.clubId, offer.sellingClubId],
          relatedPlayerIds: [offer.playerId],
        });
        continue;
      }
      save.players = result.save.players;
      save.clubFinances = result.save.clubFinances;
      save.transferLog = result.save.transferLog;
      save.seasonStartMarketValues = result.save.seasonStartMarketValues;
      save.userTactics = result.save.userTactics;
      save.news = result.save.news;
      save.outgoingTransferOffers = outgoingSnap;
      const resolved = ensureOutgoingOffers(save).find((o) => o.id === offer.id);
      if (resolved) resolved.status = "accepted";
      save.news.unshift({
        id: `news-outloan-ok-${offer.id}`,
        date: save.currentDate,
        category: "transfer",
        headline: `«${sellerName}» согласились отдать в аренду ${surname}`,
        body: `Аренда оформлена за ${formatMarketValue(result.fee ?? offer.fee)}.`,
        relatedClubIds: [save.clubId, offer.sellingClubId],
        relatedPlayerIds: [offer.playerId],
      });
      continue;
    }

    const neg = getBuyNegotiation(pack, save, offer.playerId);
    if (!neg) {
      offer.status = "expired";
      save.news.unshift({
        id: `news-outbuy-gone-${offer.id}`,
        date: save.currentDate,
        category: "transfer",
        headline: `Игрок ${offer.playerName} больше недоступен`,
        body: "Предложение снято — игрок ушёл из клуба или недоступен для покупки.",
        relatedClubIds: [save.clubId, offer.sellingClubId],
        relatedPlayerIds: [offer.playerId],
      });
      continue;
    }
    const swapPlayers = (offer.swapPlayerIds ?? [])
      .map((id) => save.players.find((p) => p.id === id))
      .filter((p): p is Player => !!p);
    const verdict = evaluateBuyOffer(neg, offer.fee, { pack, save, swapPlayers });
    if (verdict.status !== "accept") {
      offer.status = "rejected";
      const label =
        verdict.status === "insult"
          ? "оскорблены предложением"
          : verdict.status === "player"
            ? "— игрок отказался"
            : verdict.status === "wage"
              ? "не потянули зарплату"
              : "отклонили предложение";
      save.news.unshift({
        id: `news-outbuy-rej-${offer.id}`,
        date: save.currentDate,
        category: "transfer",
        headline: `«${sellerName}» ${label}: ${surname}`,
        body: verdict.message,
        relatedClubIds: [save.clubId, offer.sellingClubId],
        relatedPlayerIds: [offer.playerId],
      });
      continue;
    }
    const outgoingSnap = save.outgoingTransferOffers;
    const result = buyPlayer(pack, save, offer.playerId, offer.fee, offer.swapPlayerIds ?? []);
    if (!result.ok) {
      offer.status = "rejected";
      save.news.unshift({
        id: `news-outbuy-fail-${offer.id}`,
        date: save.currentDate,
        category: "transfer",
        headline: `Сделка по ${surname} сорвалась`,
        body: result.error ?? "Клуб отказался в последний момент.",
        relatedClubIds: [save.clubId, offer.sellingClubId],
        relatedPlayerIds: [offer.playerId],
      });
      continue;
    }
    save.players = result.save.players;
    save.clubFinances = result.save.clubFinances;
    save.transferLog = result.save.transferLog;
    save.seasonStartMarketValues = result.save.seasonStartMarketValues;
    save.userTactics = result.save.userTactics;
    save.incomingTransferOffers = result.save.incomingTransferOffers;
    save.news = result.save.news;
    save.outgoingTransferOffers = outgoingSnap;
    const resolved = ensureOutgoingOffers(save).find((o) => o.id === offer.id);
    if (resolved) resolved.status = "accepted";
    for (const o of ensureOutgoingOffers(save)) {
      if (o.playerId === offer.playerId && o.id !== offer.id && o.status === "pending") {
        o.status = "expired";
      }
    }
    save.news.unshift({
      id: `news-outbuy-ok-${offer.id}`,
      date: save.currentDate,
      category: "transfer",
      headline: `«${sellerName}» согласились продать ${surname}`,
      body: `Переход оформлен за ${formatMarketValue(result.fee ?? offer.fee)}. ${verdict.message}`,
      relatedClubIds: [save.clubId, offer.sellingClubId],
      relatedPlayerIds: [offer.playerId],
    });
  }
}

/** Approximate end of season / loan return date for current career. */
export function defaultLoanUntil(save: CareerSave): string {
  const y = Number(save.season.slice(0, 4)) + 1;
  return `${y}-06-30`;
}

export function loanFeeForPlayer(player: Player): number {
  const mv = Math.max(0.5, player.marketValue ?? 1);
  const u = stableUnit(player.id + ":loanfee");
  // ~6–12% of market value — reasonable short loan fee
  return roundFee(Math.max(0.3, mv * (0.06 + u * 0.06)));
}

/**
 * AI parent club willingness to loan out a player.
 * Starters / key XI are refused; bench / surplus can be considered.
 */
export function evaluateLoanWillingness(
  pack: WorldPack,
  save: CareerSave,
  playerId: string,
  cache?: {
    xiByClub?: Map<string, Set<string>>;
    needsByClub?: Map<string, ReturnType<typeof analyzeSquadNeeds>>;
    squadByClub?: Map<string, Player[]>;
  }
): { ok: boolean; fee: number; message: string; parentClubId?: string } {
  const player = save.players.find((p) => p.id === playerId);
  if (!player?.clubId) {
    return { ok: false, fee: 0, message: "Игрок недоступен." };
  }
  if (player.clubId === save.clubId) {
    return { ok: false, fee: 0, message: "Игрок уже в вашем клубе." };
  }
  if (player.loan) {
    return { ok: false, fee: 0, message: "Игрок уже находится в аренде." };
  }

  const parentId = player.clubId;
  const parent = pack.clubs.find((c) => c.id === parentId);
  const fee = loanFeeForPlayer(player);

  let squad = cache?.squadByClub?.get(parentId);
  if (!squad) {
    squad = save.players.filter((p) => p.clubId === parentId && !p.loan);
    cache?.squadByClub?.set(parentId, squad);
  }
  if (squad.length <= 16) {
    return {
      ok: false,
      fee,
      message: `«${parent?.shortName ?? "Клуб"}» не отдаст игрока — слишком маленькая скамейка.`,
      parentClubId: parentId,
    };
  }

  let xi = cache?.xiByClub?.get(parentId);
  if (!xi) {
    xi = new Set(
      autoSelectLineup(save.players, parentId, "4-3-3", {
        stats: save.playerStats,
        suspensions: save.suspensions ?? {},
      })
    );
    cache?.xiByClub?.set(parentId, xi);
  }

  if (xi.has(player.id)) {
    return {
      ok: false,
      fee,
      message: `«${parent?.name ?? "Клуб"}» отказали: игрок в основе, в аренду таких не отдают.`,
      parentClubId: parentId,
    };
  }

  const pos = primaryPosition(player);
  const samePos = squad.filter((p) => primaryPosition(p) === pos).sort((a, b) => b.overall - a.overall);
  const rank = samePos.findIndex((p) => p.id === player.id);
  // Top option at a thin position — treat as important even if not in XI today
  if (rank === 0 && samePos.length <= 3 && player.overall >= 78) {
    return {
      ok: false,
      fee,
      message: `«${parent?.shortName ?? "Клуб"}» берегут лидера линии ${pos} — аренда отклонена.`,
      parentClubId: parentId,
    };
  }

  // Strong stars rarely loaned even from bench
  if (player.overall >= 86) {
    return {
      ok: false,
      fee,
      message: `Звезду уровня ${player.overall} «${parent?.shortName ?? "клуб"}» в аренду не отпустят.`,
      parentClubId: parentId,
    };
  }

  let needs = cache?.needsByClub?.get(parentId);
  if (!needs) {
    needs = analyzeSquadNeeds(save.players, parentId);
    cache?.needsByClub?.set(parentId, needs);
  }
  const weak = new Set(topSquadNeedPositions(needs, 2));
  if (weak.has(pos) && rank <= 1) {
    return {
      ok: false,
      fee,
      message: `Линия и так требует усиления — «${parent?.shortName ?? "клуб"}» не отдадут игрока.`,
      parentClubId: parentId,
    };
  }

  return {
    ok: true,
    fee,
    message: `«${parent?.name ?? "Клуб"}» готовы отдать игрока в аренду до конца сезона за ${formatMarketValue(fee)}.`,
    parentClubId: parentId,
  };
}

export function listLoanTargets(
  pack: WorldPack,
  save: CareerSave,
  opts?: { limit?: number; scope?: TransferMarketScope }
): Player[] {
  const limit = opts?.limit ?? 120;
  const scope = opts?.scope ?? "all";
  const cache = {
    xiByClub: new Map<string, Set<string>>(),
    needsByClub: new Map<string, ReturnType<typeof analyzeSquadNeeds>>(),
    squadByClub: new Map<string, Player[]>(),
  };
  // Rank first, then evaluate only a shortlist — full-world willingness checks are costly.
  const shortlist = save.players
    .filter((p) => {
      if (!p.clubId || p.clubId === save.clubId || p.loan || p.overall >= 86) return false;
      if (scope === "all") return true;
      const s = transferClubScope(pack, save, p.clubId);
      return s === scope;
    })
    .sort((a, b) => b.overall - a.overall || (a.marketValue ?? 0) - (b.marketValue ?? 0))
    .slice(0, Math.max(limit * 5, 200));

  const accepted: Player[] = [];
  for (const p of shortlist) {
    if (evaluateLoanWillingness(pack, save, p.id, cache).ok) {
      accepted.push(p);
      if (accepted.length >= limit) break;
    }
  }
  return accepted;
}

export function loanPlayer(
  pack: WorldPack,
  save: CareerSave,
  playerId: string
): TransferResult {
  if (!isTransferWindowOpen(save)) {
    return { ok: false, save, error: "Трансферное окно закрыто." };
  }
  const verdict = evaluateLoanWillingness(pack, save, playerId);
  if (!verdict.ok || !verdict.parentClubId) {
    return { ok: false, save, error: verdict.message };
  }

  const next = structuredClone(save) as CareerSave;
  const player = next.players.find((p) => p.id === playerId);
  if (!player || player.clubId !== verdict.parentClubId) {
    return { ok: false, save, error: "Игрок недоступен." };
  }

  const fee = verdict.fee;
  ensureFinances(next, next.clubId);
  ensureFinances(next, verdict.parentClubId);
  const budgetBefore = next.clubFinances[next.clubId].budget;
  if (budgetBefore < fee) {
    return { ok: false, save, error: "Недостаточно бюджета на аренду." };
  }

  const fromClub = pack.clubs.find((c) => c.id === verdict.parentClubId);
  const toClub = pack.clubs.find((c) => c.id === next.clubId);
  next.clubFinances[next.clubId].budget =
    Math.round((budgetBefore - fee) * 10) / 10;
  next.clubFinances[verdict.parentClubId].budget =
    Math.round((next.clubFinances[verdict.parentClubId].budget + fee) * 10) / 10;
  const budgetAfter = next.clubFinances[next.clubId].budget;

  player.loan = {
    parentClubId: verdict.parentClubId,
    fee,
    until: defaultLoanUntil(next),
  };
  player.clubId = next.clubId;
  appendCareerMove(player, {
    date: next.currentDate,
    kind: "loan",
    fromClubId: verdict.parentClubId,
    toClubId: next.clubId,
    fee,
    fromClubName: fromClub?.shortName ?? fromClub?.name,
    toClubName: toClub?.shortName ?? toClub?.name,
  });
  if (!next.seasonStartMarketValues) next.seasonStartMarketValues = {};
  if (next.seasonStartMarketValues[player.id] == null) {
    next.seasonStartMarketValues[player.id] = player.marketValue ?? fee;
  }

  next.news.unshift({
    id: `news-loan-${player.id}-${next.currentDate}`,
    date: next.currentDate,
    category: "transfer",
    headline: `${player.firstName} ${player.lastName} в аренду → «${toClub?.shortName ?? "клуб"}»`,
    body: `Аренда у «${fromClub?.name ?? verdict.parentClubId}» до ${player.loan.until} за ${formatMarketValue(fee)}. Бюджет: ${formatMarketValue(budgetBefore)} → ${formatMarketValue(budgetAfter)}.`,
    relatedClubIds: [next.clubId, verdict.parentClubId],
    relatedPlayerIds: [player.id],
  });
  recordDeal(next, {
    date: next.currentDate,
    kind: "loan",
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    fromClubId: verdict.parentClubId,
    toClubId: next.clubId,
    fee,
  });

  return { ok: true, save: next, fee, budgetBefore, budgetAfter };
}

/**
 * AI clubs that would take a user player on loan (need the position / would play him).
 * Fee is slightly attractive so loans find homes.
 */
type LoanHostCache = {
  squadByClub: Map<string, Player[]>;
  xiByClub: Map<string, string[]>;
  needsByClub: Map<string, ReturnType<typeof analyzeSquadNeeds>>;
};

function buildLoanHostCache(pack: WorldPack, save: CareerSave): LoanHostCache {
  const squadByClub = new Map<string, Player[]>();
  for (const p of save.players) {
    if (!p.clubId) continue;
    let list = squadByClub.get(p.clubId);
    if (!list) {
      list = [];
      squadByClub.set(p.clubId, list);
    }
    list.push(p);
  }
  const xiByClub = new Map<string, string[]>();
  const needsByClub = new Map<string, ReturnType<typeof analyzeSquadNeeds>>();
  for (const club of pack.clubs) {
    const hostSquad = squadByClub.get(club.id) ?? [];
    if (hostSquad.length < 14) continue;
    xiByClub.set(
      club.id,
      autoSelectLineup(save.players, club.id, "4-3-3", {
        stats: save.playerStats,
        suspensions: save.suspensions ?? {},
      })
    );
    needsByClub.set(club.id, analyzeSquadNeeds(save.players, club.id));
  }
  return { squadByClub, xiByClub, needsByClub };
}

export function listLoanClubOffers(
  pack: WorldPack,
  save: CareerSave,
  playerId: string,
  cache?: LoanHostCache
): OutboundClubOffer[] {
  const player = save.players.find((p) => p.id === playerId);
  if (!player || player.clubId !== save.clubId || player.loan) return [];

  const fee = roundFee(loanFeeForPlayer(player) * 0.85);
  const hostCache = cache ?? buildLoanHostCache(pack, save);
  const squad = (hostCache.squadByClub.get(save.clubId) ?? []).filter((p) => !p.loan);
  if (squad.length <= 16) {
    return pack.clubs
      .filter((c) => c.id !== save.clubId)
      .map((c) => ({
        clubId: c.id,
        leagueId: leagueIdForClub(pack, c.id),
        fee,
        status: "squad_full" as const,
        reason: "Слишком мало игроков — нельзя отдавать в аренду.",
      }));
  }

  const userXi = new Set(
    hostCache.xiByClub.get(save.clubId) ??
      autoSelectLineup(save.players, save.clubId, save.userTactics?.formation ?? "4-3-3", {
        stats: save.playerStats,
        suspensions: save.suspensions ?? {},
      })
  );
  const pos = primaryPosition(player);
  const playersById = new Map(save.players.map((p) => [p.id, p]));
  const offers: OutboundClubOffer[] = [];

  for (const club of pack.clubs) {
    if (club.id === save.clubId) continue;
    const leagueId = leagueIdForClub(pack, club.id);
    const hostSquad = hostCache.squadByClub.get(club.id) ?? [];
    if (hostSquad.length < 14) {
      offers.push({
        clubId: club.id,
        leagueId,
        fee,
        status: "no_interest",
        reason: "Слишком маленький состав",
      });
      continue;
    }

    const budget = clubBudget(save, club.id);
    if (budget < fee) {
      offers.push({
        clubId: club.id,
        leagueId,
        fee,
        status: "no_budget",
        reason: "Не хватает бюджета на аренду",
      });
      continue;
    }

    const needs = hostCache.needsByClub.get(club.id) ?? analyzeSquadNeeds(save.players, club.id);
    const want = new Set(topSquadNeedPositions(needs, 3));
    const needBoost = want.has(pos) ? 40 : 0;

    const xi =
      hostCache.xiByClub.get(club.id) ??
      autoSelectLineup(save.players, club.id, "4-3-3", {
        stats: save.playerStats,
        suspensions: save.suspensions ?? {},
      });
    const samePos = hostSquad.filter((p) => primaryPosition(p) === pos);
    const weakestStarter = xi
      .map((id) => playersById.get(id))
      .filter((p): p is Player => !!p && primaryPosition(p) === pos)
      .sort((a, b) => a.overall - b.overall)[0];

    const wouldStart =
      !weakestStarter ||
      player.overall >= weakestStarter.overall - 1 ||
      (samePos.length < 2 && player.overall >= 68);

    const youthDev = player.age <= 23 && player.potential - player.overall >= 6;
    if (!wouldStart && !youthDev) {
      offers.push({
        clubId: club.id,
        leagueId,
        fee,
        status: "no_interest",
        reason: "Не видят места в составе",
      });
      continue;
    }
    if (player.overall + 8 < (club.reputation ?? 60) && !want.has(pos)) {
      offers.push({
        clubId: club.id,
        leagueId,
        fee,
        status: "no_interest",
        reason: "Уровень клуба выше — не берут",
      });
      continue;
    }

    let score = needBoost + (wouldStart ? 35 : 10) + (100 - Math.abs(player.overall - 72));
    if (player.age <= 22) score += 12;
    if (userXi.has(player.id) && samePos.length >= 4) score += 5;
    score += (club.reputation - 50) * 0.15;

    offers.push({
      clubId: club.id,
      leagueId,
      fee,
      status: "ready",
      wouldStart,
      reason: wouldStart
        ? "Планируют ставить в основу"
        : "Ротация / развитие",
      // stash score in fee ordering via sort below — attach via temp? use fee sort + wouldStart
    });
    void score;
  }

  return offers.sort((a, b) => {
    if (a.status === "ready" && b.status !== "ready") return -1;
    if (b.status === "ready" && a.status !== "ready") return 1;
    if (a.wouldStart && !b.wouldStart) return -1;
    if (b.wouldStart && !a.wouldStart) return 1;
    const ra = pack.clubs.find((c) => c.id === a.clubId)?.reputation ?? 0;
    const rb = pack.clubs.find((c) => c.id === b.clubId)?.reputation ?? 0;
    return rb - ra;
  });
}

export function evaluateLoanInterest(
  pack: WorldPack,
  save: CareerSave,
  playerId: string,
  cache?: LoanHostCache
): {
  ok: boolean;
  fee: number;
  hostClubId?: string;
  hostName?: string;
  wouldStart: boolean;
  message: string;
} {
  const player = save.players.find((p) => p.id === playerId);
  if (!player || player.clubId !== save.clubId) {
    return { ok: false, fee: 0, wouldStart: false, message: "Можно отдавать только своего игрока." };
  }
  if (player.loan) {
    return { ok: false, fee: 0, wouldStart: false, message: "Игрок уже в аренде." };
  }

  const offers = listLoanClubOffers(pack, save, playerId, cache);
  const fee = offers[0]?.fee ?? roundFee(loanFeeForPlayer(player) * 0.85);
  if (offers.some((o) => o.status === "squad_full")) {
    return {
      ok: false,
      fee,
      wouldStart: false,
      message: "Слишком мало игроков — нельзя отдавать в аренду.",
    };
  }
  const best = offers.find((o) => o.status === "ready");
  if (!best) {
    return {
      ok: false,
      fee,
      wouldStart: false,
      message: "Пока нет клуба, готового взять игрока в аренду (нужна подходящая позиция и бюджет).",
    };
  }
  const host = pack.clubs.find((c) => c.id === best.clubId);
  return {
    ok: true,
    fee: best.fee,
    hostClubId: best.clubId,
    hostName: host?.name,
    wouldStart: !!best.wouldStart,
    message: best.wouldStart
      ? `«${host?.name}» возьмут в аренду и планируют ставить в основу. Плата: ${formatMarketValue(best.fee)}.`
      : `«${host?.name}» возьмут в аренду (ротация/развитие). Плата: ${formatMarketValue(best.fee)}.`,
  };
}

export function listLoanOutCandidates(pack: WorldPack, save: CareerSave): Player[] {
  const cache = buildLoanHostCache(pack, save);
  return save.players
    .filter((p) => p.clubId === save.clubId && !p.loan)
    .filter((p) => evaluateLoanInterest(pack, save, p.id, cache).ok)
    .sort((a, b) => a.overall - b.overall || (a.marketValue ?? 0) - (b.marketValue ?? 0));
}

/** Send a user player out on loan to an interested AI club. */
export function loanOutPlayer(
  pack: WorldPack,
  save: CareerSave,
  playerId: string,
  hostClubId?: string
): TransferResult {
  if (!isTransferWindowOpen(save)) {
    return { ok: false, save, error: "Трансферное окно закрыто." };
  }

  const offers = listLoanClubOffers(pack, save, playerId);
  const pick = hostClubId
    ? offers.find((o) => o.clubId === hostClubId)
    : offers.find((o) => o.status === "ready");
  if (!pick || pick.status !== "ready") {
    return {
      ok: false,
      save,
      error:
        pick?.reason ??
        "Пока нет клуба, готового взять игрока в аренду (нужна подходящая позиция и бюджет).",
    };
  }
  const hostId = pick.clubId;
  const fee = pick.fee;

  const next = structuredClone(save) as CareerSave;
  const player = next.players.find((p) => p.id === playerId);
  if (!player || player.clubId !== next.clubId || player.loan) {
    return { ok: false, save, error: "Игрок недоступен." };
  }

  ensureFinances(next, next.clubId);
  ensureFinances(next, hostId);
  if (next.clubFinances[hostId].budget < fee) {
    return { ok: false, save, error: "У клуба-арендатора не хватает бюджета." };
  }

  const host = pack.clubs.find((c) => c.id === hostId);
  const parent = pack.clubs.find((c) => c.id === next.clubId);
  const budgetBefore = next.clubFinances[next.clubId].budget;
  next.clubFinances[hostId].budget =
    Math.round((next.clubFinances[hostId].budget - fee) * 10) / 10;
  next.clubFinances[next.clubId].budget =
    Math.round((budgetBefore + fee) * 10) / 10;
  const budgetAfter = next.clubFinances[next.clubId].budget;

  player.loan = {
    parentClubId: next.clubId,
    fee,
    until: defaultLoanUntil(next),
  };
  player.clubId = hostId;
  appendCareerMove(player, {
    date: next.currentDate,
    kind: "loan",
    fromClubId: next.clubId,
    toClubId: hostId,
    fee,
    fromClubName: parent?.shortName ?? parent?.name,
    toClubName: host?.shortName ?? host?.name,
  });

  if (next.userTactics?.lineup) {
    next.userTactics = {
      ...next.userTactics,
      lineup: next.userTactics.lineup.filter((id) => id !== player.id),
    };
    if (next.userTactics.lineup.length < 11) {
      next.userTactics = defaultTactics(
        next.players,
        next.clubId,
        next.userTactics.formation
      );
    }
  }

  clearSquadDramasForPlayers(next, [playerId], "loaned");

  next.news.unshift({
    id: `news-loan-out-${player.id}-${next.currentDate}`,
    date: next.currentDate,
    category: "transfer",
    headline: `${player.firstName} ${player.lastName} → аренда в «${host?.shortName ?? "клуб"}»`,
    body: `«${parent?.shortName ?? "Клуб"}» отдали игрока до ${player.loan.until} за ${formatMarketValue(fee)}. Бюджет: ${formatMarketValue(budgetBefore)} → ${formatMarketValue(budgetAfter)}.`,
    relatedClubIds: [next.clubId, hostId],
    relatedPlayerIds: [player.id],
  });
  recordDeal(next, {
    date: next.currentDate,
    kind: "loan",
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    fromClubId: next.clubId,
    toClubId: hostId,
    fee,
  });

  return { ok: true, save: next, fee, budgetBefore, budgetAfter };
}

/** Return expired loans to parent clubs (mutates save). */
export function resolveExpiredLoans(pack: WorldPack, save: CareerSave): void {
  for (const p of save.players) {
    if (!p.loan) continue;
    if (save.currentDate < p.loan.until) continue;
    const parentId = p.loan.parentClubId;
    const wasAt = p.clubId;
    const fee = p.loan.fee;
    p.clubId = parentId;
    delete p.loan;
    const parent = pack.clubs.find((c) => c.id === parentId);
    const host = wasAt ? pack.clubs.find((c) => c.id === wasAt) : undefined;
    if (wasAt) {
      appendCareerMove(p, {
        date: save.currentDate,
        kind: "loan_return",
        fromClubId: wasAt,
        toClubId: parentId,
        fee,
        fromClubName: host?.shortName ?? host?.name,
        toClubName: parent?.shortName ?? parent?.name,
      });
    }
    if (wasAt === save.clubId && save.userTactics?.lineup) {
      save.userTactics = {
        ...save.userTactics,
        lineup: save.userTactics.lineup.filter((id) => id !== p.id),
      };
      if (save.userTactics.lineup.length < 11) {
        save.userTactics = defaultTactics(save.players, save.clubId, save.userTactics.formation);
      }
    }
    save.news.unshift({
      id: `news-loan-return-${p.id}-${save.currentDate}`,
      date: save.currentDate,
      category: "transfer",
      headline: `${p.firstName} ${p.lastName} вернулся из аренды`,
      body: `Аренда в «${host?.shortName ?? "клубе"}» завершена. Игрок снова в «${parent?.name ?? parentId}».`,
      relatedClubIds: [parentId, ...(wasAt ? [wasAt] : [])],
      relatedPlayerIds: [p.id],
    });
  }
}
