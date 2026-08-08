import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCareer } from "./career";
import {
  listLoanClubOffers,
  listSellClubOffers,
  loanOutPlayer,
  sellPlayer,
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
      reputation: 88,
      colors: ["#111", "#222"],
      vibe: "test",
      stadium: "A",
      budget: 200,
      crest: "a",
    },
    {
      id: "c2",
      name: "Beta",
      shortName: "BET",
      city: "B",
      federationId: "RUS",
      reputation: 78,
      colors: ["#333", "#444"],
      vibe: "test",
      stadium: "B",
      budget: 120,
      crest: "b",
    },
    {
      id: "c3",
      name: "Gamma",
      shortName: "GAM",
      city: "C",
      federationId: "RUS",
      reputation: 64,
      colors: ["#555", "#666"],
      vibe: "test",
      stadium: "C",
      budget: 90,
      crest: "c",
    },
  ],
  leagues: [
    {
      id: "rpl",
      name: "Test League",
      federationId: "RUS",
      tier: 1,
      teamCount: 3,
      clubIds: ["c1", "c2", "c3"],
    },
  ],
  tournaments: [],
} as unknown as WorldPack;

describe("outbound club offers", () => {
  it("lists sell offers by club with league ids", () => {
    const save = createCareer(miniPack, "c1", "Boss", 42);
    save.currentDate = save.transferWindows[0]!.from;
    const player = save.players
      .filter((p) => p.clubId === save.clubId && !p.loan)
      .sort((a, b) => a.overall - b.overall)[0];
    assert.ok(player);
    const offers = listSellClubOffers(miniPack, save, player.id);
    assert.equal(offers.length, 2);
    assert.ok(offers.every((o) => o.leagueId === "rpl"));
    assert.ok(offers.some((o) => o.status === "ready" || o.status === "player_refuse"));
  });

  it("sells to a chosen ready club for the listed fee", () => {
    const save = createCareer(miniPack, "c1", "Boss", 42);
    save.currentDate = save.transferWindows[0]!.from;
    const player = save.players
      .filter((p) => p.clubId === save.clubId && !p.loan)
      .sort((a, b) => a.overall - b.overall)[0];
    assert.ok(player);
    const ready = listSellClubOffers(miniPack, save, player.id).find(
      (o) => o.status === "ready"
    );
    assert.ok(ready, "expected at least one ready buyer for a fringe player");
    const result = sellPlayer(miniPack, save, player.id, ready.clubId, ready.fee);
    assert.equal(result.ok, true);
    assert.equal(result.save.players.find((p) => p.id === player.id)?.clubId, ready.clubId);
  });

  it("loans to a chosen host club", () => {
    const save = createCareer(miniPack, "c1", "Boss", 7);
    save.currentDate = save.transferWindows[0]!.from;
    const player = save.players
      .filter((p) => p.clubId === save.clubId && !p.loan)
      .sort((a, b) => a.overall - b.overall)[0];
    assert.ok(player);
    const offers = listLoanClubOffers(miniPack, save, player.id);
    assert.ok(offers.length >= 2);
    const ready = offers.find((o) => o.status === "ready");
    if (!ready) return;
    const result = loanOutPlayer(miniPack, save, player.id, ready.clubId);
    assert.equal(result.ok, true);
    const moved = result.save.players.find((p) => p.id === player.id);
    assert.equal(moved?.clubId, ready.clubId);
    assert.equal(moved?.loan?.parentClubId, save.clubId);
  });
});
