import type { CareerSave, Club, Player, WorldPack } from "./types";
import { formatWage, primaryPosition } from "./labels";
import { autoSelectLineup } from "./tactics";

function leagueOfClub(pack: WorldPack, clubId: string) {
  return pack.leagues.find((l) => l.clubIds.includes(clubId));
}

function tablePlace(save: CareerSave, leagueId: string | undefined, clubId: string): number {
  if (!leagueId) return 10;
  const table = save.table?.[leagueId] ?? [];
  if (!table.length) return 10;
  const idx = table.findIndex((r) => r.clubId === clubId);
  return idx >= 0 ? idx + 1 : Math.max(8, Math.ceil(table.length / 2));
}

/** Composite prestige: reputation, squad OVR, league table. Higher = stronger. */
export function clubStrengthScore(
  pack: WorldPack,
  save: CareerSave,
  clubId: string
): number {
  const club = pack.clubs.find((c) => c.id === clubId);
  if (!club) return 0;
  const squad = save.players.filter((p) => p.clubId === clubId && !p.loan);
  const avgOvr = squad.length
    ? squad.reduce((s, p) => s + p.overall, 0) / squad.length
    : 60;
  const league = leagueOfClub(pack, clubId);
  const place = tablePlace(save, league?.id, clubId);
  const placeScore = Math.max(0, 22 - place); // 1st ≈ 21, mid ≈ 12
  const tierBoost = league?.tier === 1 ? 4 : 0;
  return club.reputation * 1.15 + avgOvr * 0.85 + placeScore * 1.4 + tierBoost;
}

export type SquadRole = "starter" | "important" | "bench" | "fringe";

/**
 * How central a player is at their current club (XI / depth / overall rank).
 * Uses user lineup when available; otherwise auto XI.
 */
export function playerSquadRole(
  pack: WorldPack,
  save: CareerSave,
  player: Player,
  cache?: { xiByClub?: Map<string, Set<string>> }
): SquadRole {
  if (!player.clubId) return "fringe";
  const clubId = player.clubId;
  const squad = save.players.filter((p) => p.clubId === clubId && !p.loan);
  if (!squad.length) return "fringe";

  let xi = cache?.xiByClub?.get(clubId);
  if (!xi) {
    const lineup =
      clubId === save.clubId && save.userTactics?.lineup?.length
        ? save.userTactics.lineup
        : autoSelectLineup(save.players, clubId, "4-3-3", {
            stats: save.playerStats,
            suspensions: save.suspensions ?? {},
          });
    xi = new Set(lineup);
    cache?.xiByClub?.set(clubId, xi);
  }

  const inXi = xi.has(player.id);
  const samePos = squad
    .filter((p) => primaryPosition(p) === primaryPosition(player))
    .sort((a, b) => b.overall - a.overall);
  const rank = samePos.findIndex((p) => p.id === player.id);
  const avgOvr = squad.reduce((s, p) => s + p.overall, 0) / squad.length;

  if (inXi && (player.overall >= avgOvr + 2 || rank <= 1)) return "starter";
  if (inXi) return "important";
  if (rank === 0 && samePos.length <= 3 && player.overall >= avgOvr - 1) return "important";
  if (rank <= 2 || player.overall >= avgOvr - 2) return "bench";
  return "fringe";
}

export function isImportantStarter(
  pack: WorldPack,
  save: CareerSave,
  player: Player,
  cache?: { xiByClub?: Map<string, Set<string>> }
): boolean {
  const role = playerSquadRole(pack, save, player, cache);
  return role === "starter" || role === "important";
}

/** Buyer vs seller: positive ⇒ buyer stronger. */
export function clubStrengthDelta(
  pack: WorldPack,
  save: CareerSave,
  buyerId: string,
  sellerId: string
): number {
  return clubStrengthScore(pack, save, buyerId) - clubStrengthScore(pack, save, sellerId);
}

/**
 * Player agency on a permanent move. Clubs may agree on fee; player can still refuse a step down.
 */
export function evaluatePlayerTransferWillingness(
  pack: WorldPack,
  save: CareerSave,
  playerId: string,
  buyerClubId: string,
  cache?: { xiByClub?: Map<string, Set<string>> }
): { ok: boolean; message: string; desire: number } {
  const player = save.players.find((p) => p.id === playerId);
  if (!player?.clubId) {
    return { ok: false, message: "Игрок недоступен.", desire: 0 };
  }
  if (player.clubId === buyerClubId) {
    return { ok: false, message: "Игрок уже в этом клубе.", desire: 0 };
  }

  const seller = pack.clubs.find((c) => c.id === player.clubId);
  const buyer = pack.clubs.find((c) => c.id === buyerClubId);
  if (!seller || !buyer) {
    return { ok: false, message: "Клуб не найден.", desire: 0 };
  }

  const role = playerSquadRole(pack, save, player, cache);
  const delta = clubStrengthDelta(pack, save, buyer.id, seller.id);
  const repGap = buyer.reputation - seller.reputation;

  // Desire: higher = more eager to join. Bench players want a step up; starters resist downgrade.
  let desire = 0.35 + delta * 0.012 + repGap * 0.018;
  if (role === "fringe") desire += 0.35;
  else if (role === "bench") desire += 0.2;
  else if (role === "important") desire -= 0.05;
  else desire -= 0.18; // starter

  if (player.age <= 23 && delta > 0) desire += 0.12;
  if (player.age >= 32 && role !== "starter") desire += 0.08;

  // Clear refuse: starter/important moving to a clearly weaker club
  if ((role === "starter" || role === "important") && delta < -8) {
    return {
      ok: false,
      desire,
      message:
        role === "starter"
          ? `${player.lastName} не хочет переходить в более слабый клуб — он основа «${seller.shortName}».`
          : `${player.lastName} не хочет переходить в более слабый клуб.`,
    };
  }
  if (role === "starter" && delta < -3 && desire < 0.35) {
    return {
      ok: false,
      desire,
      message: `${player.lastName} отказался: не видит смысла уходить из основы в «${buyer.shortName}».`,
    };
  }
  if (desire < 0.18 && delta < 0) {
    return {
      ok: false,
      desire,
      message: `${player.lastName} не хочет переходить в более слабый клуб.`,
    };
  }

  return {
    ok: true,
    desire,
    message:
      desire >= 0.7
        ? `${player.lastName} заинтересован в переходе в «${buyer.shortName}».`
        : `${player.lastName} готов рассмотреть переход.`,
  };
}

/** How much seller ask softens when buyer is a bigger club (0 = no change, ~0.2 = −20% ask). */
export function sellerAskDiscountForBuyerStrength(
  pack: WorldPack,
  save: CareerSave,
  buyerId: string,
  sellerId: string
): number {
  const delta = clubStrengthDelta(pack, save, buyerId, sellerId);
  if (delta <= 4) return 0;
  // Stronger buyer → seller less greedy (prestige / hard to refuse)
  return Math.min(0.22, (delta - 4) * 0.012);
}

/**
 * Buyer wage comfort: annual wage bill should stay within a share of transfer budget.
 * Returns false when adding the player would push the bill into "insane" territory.
 */
export function evaluateWageAffordability(
  pack: WorldPack,
  save: CareerSave,
  buyerClubId: string,
  playerWage: number,
  opts?: { replacingWage?: number }
): { ok: boolean; message?: string; wageBill: number; budget: number } {
  const club = pack.clubs.find((c) => c.id === buyerClubId);
  const budget = save.clubFinances?.[buyerClubId]?.budget ?? club?.budget ?? 10;
  const squad = save.players.filter((p) => p.clubId === buyerClubId && !p.loan);
  const wageBill =
    squad.reduce((s, p) => s + Math.max(0, p.wage ?? 0), 0) -
    Math.max(0, opts?.replacingWage ?? 0) +
    Math.max(0, playerWage);

  // Soft cap: wage bill ≤ ~55% of transfer budget (+rep cushion). Stars can stretch a bit.
  const softCap = Math.max(4, budget * 0.55 + (club?.reputation ?? 70) * 0.04);
  if (wageBill > softCap * 1.35) {
    return {
      ok: false,
      wageBill,
      budget,
      message: `Зарплата слишком высока для бюджета «${club?.shortName ?? "клуба"}» — нужна меньшая зарплата.`,
    };
  }
  if (playerWage > Math.max(1.2, budget * 0.12)) {
    return {
      ok: false,
      wageBill,
      budget,
      message: `Игрок требует неадекватную зарплату (${formatWage(playerWage)}) относительно бюджета клуба.`,
    };
  }
  return { ok: true, wageBill, budget };
}

export function clubShortName(pack: WorldPack, clubId: string): string {
  return pack.clubs.find((c) => c.id === clubId)?.shortName ?? clubId;
}

export function compareClubsByStrength(
  pack: WorldPack,
  save: CareerSave,
  a: Club,
  b: Club
): number {
  return clubStrengthScore(pack, save, b.id) - clubStrengthScore(pack, save, a.id);
}
