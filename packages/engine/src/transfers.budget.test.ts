import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCareer } from "./career";
import { squadAverageOverall, playerNameWithAge, rolesLabel } from "./labels";
import {
  buyPlayer,
  evaluateBuyOffer,
  getBuyNegotiation,
  isBigTransfer,
  raiseBuyOffer,
} from "./transfers";
import type { WorldPack } from "./types";

const miniPack = {
  version: "test",
  season: "2025/26",
  federations: [{ id: "RUS", name: "Russia", confederation: "UEFA" }],
  continentalAccess: [],
  clubs: [
    {
      id: "c1",
      name: "Alpha",
      shortName: "ALP",
      city: "A",
      federationId: "RUS",
      reputation: 70,
      colors: ["#111", "#222"],
      vibe: "test",
      stadium: "A",
      budget: 80,
      crest: "a",
    },
    {
      id: "c2",
      name: "Beta",
      shortName: "BET",
      city: "B",
      federationId: "RUS",
      reputation: 65,
      colors: ["#333", "#444"],
      vibe: "test",
      stadium: "B",
      budget: 50,
      crest: "b",
    },
  ],
  leagues: [
    {
      id: "rpl",
      name: "Test League",
      federationId: "RUS",
      tier: 1,
      teamCount: 2,
      clubIds: ["c1", "c2"],
    },
  ],
  tournaments: [],
} as unknown as WorldPack;

describe("squadAverageOverall", () => {
  it("averages club players", () => {
    const save = createCareer(miniPack, "c1", "Boss", 7);
    const avg = squadAverageOverall(save.players, "c1");
    assert.ok(avg >= 40 && avg <= 95);
    assert.equal(Math.round(avg), avg);
  });
});

describe("player labels", () => {
  it("includes age and roles", () => {
    const save = createCareer(miniPack, "c1", "Boss", 7);
    const p = save.players.find((x) => x.clubId === "c1")!;
    assert.match(playerNameWithAge(p), new RegExp(`, ${p.age}$`));
    assert.ok(rolesLabel(p).length >= 2);
  });
});

describe("buyPlayer budget", () => {
  it("deducts fee and records career move", () => {
    let save = createCareer(miniPack, "c1", "Boss", 11);
    // Force open window
    save.currentDate = save.transferWindows[0]!.from;
    save.clubFinances[save.clubId].budget = 200;

    const target = save.players.find((p) => p.clubId === "c2" && !p.loan)!;
    const neg = getBuyNegotiation(miniPack, save, target.id)!;
    let offer = neg.minAccept;
    let verdict = evaluateBuyOffer(neg, offer);
    let guard = 0;
    while (verdict.status !== "accept" && guard++ < 12) {
      offer = raiseBuyOffer(offer, neg.marketValue, neg.hardCeil, "large");
      verdict = evaluateBuyOffer(neg, offer);
    }
    assert.equal(verdict.status, "accept");

    const before = save.clubFinances[save.clubId].budget;
    const result = buyPlayer(miniPack, save, target.id, offer);
    assert.equal(result.ok, true);
    assert.equal(result.budgetBefore, before);
    assert.ok((result.budgetAfter ?? 0) < before);
    assert.equal(
      Math.round(((result.budgetBefore ?? 0) - (result.budgetAfter ?? 0)) * 10) / 10,
      result.fee
    );
    const bought = result.save.players.find((p) => p.id === target.id)!;
    assert.equal(bought.clubId, "c1");
    assert.ok((bought.careerMoves?.length ?? 0) >= 1);
    assert.equal(result.save.clubFinances[save.clubId].budget, result.budgetAfter);
  });
});

describe("isBigTransfer", () => {
  it("flags high fees", () => {
    const deals = [
      {
        id: "1",
        date: "2025-07-10",
        windowId: "summer_open",
        kind: "permanent" as const,
        playerId: "p",
        playerName: "X",
        fromClubId: "a",
        toClubId: "b",
        fee: 25,
      },
      {
        id: "2",
        date: "2025-07-11",
        windowId: "summer_open",
        kind: "permanent" as const,
        playerId: "q",
        playerName: "Y",
        fromClubId: "a",
        toClubId: "b",
        fee: 3,
      },
    ];
    assert.equal(isBigTransfer(deals[0]!, deals), true);
    assert.equal(isBigTransfer(deals[1]!, deals), false);
  });
});
