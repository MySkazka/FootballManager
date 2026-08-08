import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCareer } from "./career";
import {
  getBuyNegotiation,
  listPendingOutgoingOffers,
  resolveOutgoingTransferOffers,
  submitOutgoingBuyOffer,
  submitOutgoingLoanOffer,
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
      reputation: 62,
      colors: ["#333", "#444"],
      vibe: "test",
      stadium: "B",
      budget: 80,
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

describe("deferred outgoing transfer offers", () => {
  it("queues buy offer and resolves only after the date advances", () => {
    let save = createCareer(miniPack, "c1", "Boss", 42);
    save.currentDate = save.transferWindows[0]!.from;
    const target = save.players.find((p) => p.clubId === "c2" && !p.loan);
    assert.ok(target);
    const neg = getBuyNegotiation(miniPack, save, target.id)!;
    const queued = submitOutgoingBuyOffer(miniPack, save, target.id, neg.minAccept, []);
    assert.equal(queued.ok, true);
    if (!queued.ok) return;
    save = queued.save;
    assert.equal(listPendingOutgoingOffers(save).length, 1);
    assert.equal(save.players.find((p) => p.id === target.id)?.clubId, "c2");

    resolveOutgoingTransferOffers(miniPack, save);
    assert.equal(listPendingOutgoingOffers(save).length, 1);

    const w = save.transferWindows[0]!;
    const d = new Date(w.from);
    d.setDate(d.getDate() + 1);
    let next = d.toISOString().slice(0, 10);
    if (next > w.to) next = w.to;
    save.currentDate = next;

    resolveOutgoingTransferOffers(miniPack, save);
    assert.equal(listPendingOutgoingOffers(save).length, 0);
    assert.ok(save.news.some((n) => n.category === "transfer"));
  });

  it("queues loan offer without instant move", () => {
    let save = createCareer(miniPack, "c1", "Boss", 7);
    save.currentDate = save.transferWindows[0]!.from;
    const target = save.players.find((p) => p.clubId === "c2" && !p.loan);
    assert.ok(target);
    const queued = submitOutgoingLoanOffer(miniPack, save, target.id);
    assert.equal(queued.ok, true);
    if (!queued.ok) return;
    save = queued.save;
    assert.equal(listPendingOutgoingOffers(save).length, 1);
    assert.equal(save.players.find((p) => p.id === target.id)?.clubId, "c2");
    assert.ok(!save.players.find((p) => p.id === target.id)?.loan);
  });
});
