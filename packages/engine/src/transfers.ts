import type {
  CareerSave,
  Club,
  IncomingTransferOffer,
  Player,
  TransferDealRecord,
  TransferResult,
  TransferWindow,
  WindowTransferReport,
  WorldPack,
} from "./types";
import { primaryPosition } from "./labels";
import { recomputeMarketValue } from "./players";
import { Rng } from "./rng";
import { analyzeSquadNeeds, topSquadNeedPositions } from "./squadNeeds";
import { autoSelectLineup, defaultTactics } from "./tactics";

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
export function listTransferTargets(
  pack: WorldPack,
  save: CareerSave,
  opts?: { leagueOnly?: boolean; limit?: number }
): Player[] {
  const league = pack.leagues.find((l) => l.clubIds.includes(save.clubId));
  const leagueSet = new Set(league?.clubIds ?? []);
  const leagueOnly = opts?.leagueOnly ?? false;
  const limit = opts?.limit ?? 200;

  const pool = save.players.filter((p) => {
    if (!p.clubId || p.clubId === save.clubId) return false;
    if (leagueOnly && !leagueSet.has(p.clubId)) return false;
    return true;
  });

  // Prefer same-league deals slightly, then market value / overall
  pool.sort((a, b) => {
    const aHome = leagueSet.has(a.clubId!) ? 1 : 0;
    const bHome = leagueSet.has(b.clubId!) ? 1 : 0;
    if (bHome !== aHome) return bHome - aHome;
    return (b.marketValue ?? 0) - (a.marketValue ?? 0) || b.overall - a.overall;
  });
  return pool.slice(0, limit);
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

  let markup = 1.08 + u * 0.12; // 8–20% base
  if (player.overall >= avgOvr + 4) markup += 0.12; // important starter
  if (player.overall >= avgOvr + 8) markup += 0.1; // star
  if (player.age <= 24 && player.potential - player.overall >= 8) markup += 0.1;
  if (samePos.length <= 3) markup += 0.12; // thin depth — reluctant
  if (samePos.length >= 6 && player.overall < avgOvr) markup -= 0.08; // surplus
  if (seller.reputation > buyer.reputation + 12) markup += 0.08;
  if (buyer.reputation > seller.reputation + 15) markup -= 0.06; // bigger club leverage

  markup = Math.max(1.05, Math.min(1.55, markup));
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
  | { status: "cap"; message: string };

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
      message: `Слишком завышенная сумма. В реалиях рынка потолок около ${neg.hardCeil.toFixed(1)} млн.`,
    };
  }
  if (fee > neg.hardCeil + swapCredit + 0.05) {
    return {
      status: "cap",
      message: `Даже с обменом клуб не возьмёт больше ~${(neg.hardCeil).toFixed(1)} млн кэшем.`,
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
      message: `«${neg.sellerName}» отклонили пакет на ~${totalValue.toFixed(1)} млн. ${hint}`,
    };
  }

  const swapNote = swaps.length
    ? ` + обмен (${swaps.map((p) => p.lastName).join(", ")})`
    : "";
  return {
    status: "accept",
    message: `«${neg.sellerName}» согласны: ${fee.toFixed(1)} млн${swapNote}.`,
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
      ? ` (оценка рынка ${neg.marketValue.toFixed(1)} млн)`
      : "";
  next.news.unshift({
    id: `news-transfer-buy-${player.id}-${next.currentDate}`,
    date: next.currentDate,
    category: "transfer",
    headline: `${player.firstName} ${player.lastName} → «${toClub?.shortName ?? "клуб"}»`,
    body: `Клуб приобрёл игрока за ${fee.toFixed(1)} млн у «${fromClub?.name ?? fromClubId}»${swapPart}${overMv}. Бюджет: ${budgetBefore.toFixed(1)} → ${budgetAfter.toFixed(1)} млн.`,
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

  next.news.unshift({
    id: `news-transfer-sell-${player.id}-${next.currentDate}`,
    date: next.currentDate,
    category: "transfer",
    headline: `${player.firstName} ${player.lastName} ушёл в «${buyer.shortName}»`,
    body: `«${fromClub?.name ?? next.clubId}» продали игрока за ${fee.toFixed(1)} млн. Бюджет: ${budgetBefore.toFixed(1)} → ${budgetAfter.toFixed(1)} млн.`,
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

function pickAiBuyer(pack: WorldPack, save: CareerSave, player: Player): Club | undefined {
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
          body: `Клубы договорились о переходе за ${fee.toFixed(1)} млн в рамках трансферного окна.`,
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
    // Fee around MV, capped by budget; richer clubs stretch a bit
    const stretch = 0.88 + rng.next() * 0.32 + (budget > mv * 2 ? 0.08 : 0);
    let fee = roundFee(Math.min(budget * 0.92, mv * stretch));
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
    message: `«${parent?.name ?? "Клуб"}» готовы отдать игрока в аренду до конца сезона за ${fee.toFixed(1)} млн.`,
    parentClubId: parentId,
  };
}

export function listLoanTargets(
  pack: WorldPack,
  save: CareerSave,
  opts?: { limit?: number }
): Player[] {
  const limit = opts?.limit ?? 120;
  const cache = {
    xiByClub: new Map<string, Set<string>>(),
    needsByClub: new Map<string, ReturnType<typeof analyzeSquadNeeds>>(),
    squadByClub: new Map<string, Player[]>(),
  };
  // Rank first, then evaluate only a shortlist — full-world willingness checks are costly.
  const shortlist = save.players
    .filter((p) => p.clubId && p.clubId !== save.clubId && !p.loan && p.overall < 86)
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
    body: `Аренда у «${fromClub?.name ?? verdict.parentClubId}» до ${player.loan.until} за ${fee.toFixed(1)} млн. Бюджет: ${budgetBefore.toFixed(1)} → ${budgetAfter.toFixed(1)} млн.`,
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

  const fee = roundFee(loanFeeForPlayer(player) * 0.85); // slight discount to stimulate demand
  const hostCache = cache ?? buildLoanHostCache(pack, save);
  const squad = (hostCache.squadByClub.get(save.clubId) ?? []).filter((p) => !p.loan);
  if (squad.length <= 16) {
    return {
      ok: false,
      fee,
      wouldStart: false,
      message: "Слишком мало игроков — нельзя отдавать в аренду.",
    };
  }

  const userXi = new Set(
    hostCache.xiByClub.get(save.clubId) ??
      autoSelectLineup(save.players, save.clubId, save.userTactics?.formation ?? "4-3-3", {
        stats: save.playerStats,
        suspensions: save.suspensions ?? {},
      })
  );

  const pos = primaryPosition(player);
  const candidates: { id: string; score: number; wouldStart: boolean }[] = [];
  const playersById = new Map(save.players.map((p) => [p.id, p]));

  for (const club of pack.clubs) {
    if (club.id === save.clubId) continue;
    const hostSquad = hostCache.squadByClub.get(club.id) ?? [];
    if (hostSquad.length < 14) continue;

    const budget = clubBudget(save, club.id);
    if (budget < fee) continue;

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

    if (!wouldStart && !(player.age <= 23 && player.potential - player.overall >= 6)) {
      continue;
    }
    if (player.overall + 8 < (club.reputation ?? 60) && !want.has(pos)) continue;

    let score = needBoost + (wouldStart ? 35 : 10) + (100 - Math.abs(player.overall - 72));
    if (player.age <= 22) score += 12;
    if (userXi.has(player.id) && samePos.length >= 4) score += 5;
    score += (club.reputation - 50) * 0.15;
    candidates.push({ id: club.id, score, wouldStart });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) {
    return {
      ok: false,
      fee,
      wouldStart: false,
      message: "Пока нет клуба, готового взять игрока в аренду (нужна подходящая позиция и бюджет).",
    };
  }

  const host = pack.clubs.find((c) => c.id === best.id);
  return {
    ok: true,
    fee,
    hostClubId: best.id,
    hostName: host?.name,
    wouldStart: best.wouldStart,
    message: best.wouldStart
      ? `«${host?.name}» возьмут в аренду и планируют ставить в основу. Плата: ${fee.toFixed(1)} млн.`
      : `«${host?.name}» возьмут в аренду (ротация/развитие). Плата: ${fee.toFixed(1)} млн.`,
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
  const interest = evaluateLoanInterest(pack, save, playerId);
  if (!interest.ok) {
    return { ok: false, save, error: interest.message };
  }
  const hostId = hostClubId ?? interest.hostClubId;
  if (!hostId) return { ok: false, save, error: "Клуб-арендатор не найден." };

  // Re-check specific host if user/AI forced one
  const next = structuredClone(save) as CareerSave;
  const player = next.players.find((p) => p.id === playerId);
  if (!player || player.clubId !== next.clubId || player.loan) {
    return { ok: false, save, error: "Игрок недоступен." };
  }

  const fee = interest.fee;
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

  next.news.unshift({
    id: `news-loan-out-${player.id}-${next.currentDate}`,
    date: next.currentDate,
    category: "transfer",
    headline: `${player.firstName} ${player.lastName} → аренда в «${host?.shortName ?? "клуб"}»`,
    body: `«${parent?.shortName ?? "Клуб"}» отдали игрока до ${player.loan.until} за ${fee.toFixed(1)} млн. Бюджет: ${budgetBefore.toFixed(1)} → ${budgetAfter.toFixed(1)} млн.`,
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
