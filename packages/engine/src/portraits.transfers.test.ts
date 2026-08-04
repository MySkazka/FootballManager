import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLAYER_PORTRAIT_ALLOWLIST,
  PLAYER_PORTRAIT_BLOCKLIST,
  PORTRAIT_COUNT,
  assignSquadPortraits,
  isValidPortraitId,
  portraitIdForPlayer,
} from "./portraits";
import { Rng } from "./rng";
import { newsFromMatch } from "./news";
import { quoteFingerprint } from "./matchReactions";
import { createCareer } from "./career";
import {
  acceptIncomingOffer,
  generateIncomingTransferOffers,
  listPendingIncomingOffers,
  rejectIncomingOffers,
  simulateAiTransfers,
} from "./transfers";
import type { Club, Fixture, MatchResult, WorldPack } from "./types";

describe("player portrait allowlist", () => {
  it("blocks female/elderly IDs from players", () => {
    for (const id of PLAYER_PORTRAIT_BLOCKLIST) {
      assert.equal(isValidPortraitId(id), false);
      assert.ok(!PLAYER_PORTRAIT_ALLOWLIST.includes(id));
    }
    assert.equal(PLAYER_PORTRAIT_ALLOWLIST.length, PORTRAIT_COUNT - PLAYER_PORTRAIT_BLOCKLIST.length);
  });

  it("never assigns blocked IDs in squad or seed lookup", () => {
    const rng = new Rng(42);
    const nats = Array.from({ length: 40 }, () => "RUS");
    const ids = assignSquadPortraits(nats, rng);
    for (const id of ids) {
      assert.ok(isValidPortraitId(id), `blocked id assigned: ${id}`);
    }
    for (let i = 0; i < 50; i++) {
      const id = portraitIdForPlayer("BRA", `seed-${i}`);
      assert.ok(isValidPortraitId(id));
    }
  });
});

describe("president / SD news quotes", () => {
  it("emits varied quotes with stable club speakers and no dup fingerprints", () => {
    const home = { id: "rus-a", name: "Alpha", shortName: "ALP" } as Club;
    const away = { id: "rus-b", name: "Beta", shortName: "BET" } as Club;
    const fixture = { id: "fx1", date: "2025-08-10" } as Fixture;
    const result = {
      homeGoals: 1,
      awayGoals: 0,
      homeShots: 8,
      awayShots: 4,
    } as MatchResult;

    const seenQuotes = new Set<string>();
    let quoteItems = 0;
    const namesByClub = new Map<string, string>();

    for (let seed = 1; seed < 2500; seed++) {
      const items = newsFromMatch(fixture, result, home, away, [], new Rng(seed));
      const quotes = items.filter((n) => n.category === "quote" || n.category === "insight");
      if (!quotes.length) continue;
      quoteItems += quotes.length;
      const fps = quotes.map((q) => {
        const m = q.headline.match(/«([^»]+)»\s*$/);
        return quoteFingerprint(m?.[1] ?? q.headline);
      });
      assert.equal(new Set(fps).size, fps.length);
      for (const q of quotes) {
        assert.ok(q.speaker?.clubId);
        assert.ok(q.speaker?.name);
        const key = `${q.speaker!.role}:${q.speaker!.clubId}`;
        const prev = namesByClub.get(key);
        if (prev) assert.equal(prev, q.speaker!.name);
        else namesByClub.set(key, q.speaker!.name);
        const m = q.headline.match(/«([^»]+)»\s*$/);
        if (m?.[1]) seenQuotes.add(m[1]);
      }
    }
    assert.ok(quoteItems >= 10, "expected several president/SD quotes across seeds");
    assert.ok(seenQuotes.size >= 5, "expected creative variety in quote pool");
  });
});

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
      budget: 90,
      crest: "b",
    },
    {
      id: "c3",
      name: "Gamma",
      shortName: "GAM",
      city: "C",
      federationId: "RUS",
      reputation: 60,
      colors: ["#555", "#666"],
      vibe: "test",
      stadium: "C",
      budget: 70,
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

describe("AI transfers and incoming offers", () => {
  it("records AI↔AI deals into transferLog during the window", () => {
    const save = createCareer(miniPack, "c1", "Boss", 21);
    save.currentDate = "2025-07-15";
    let deals = 0;
    for (let i = 0; i < 40; i++) {
      simulateAiTransfers(miniPack, save, new Rng(100 + i));
      deals = (save.transferLog ?? []).length;
      if (deals > 0) break;
    }
    assert.ok(deals > 0, "expected at least one AI deal after several ticks");
    const deal = save.transferLog![0];
    assert.notEqual(deal.fromClubId, "c1");
    assert.notEqual(deal.toClubId, "c1");
    assert.ok(deal.fee > 0);
  });

  it("generates, accepts and rejects incoming buy offers", () => {
    let save = createCareer(miniPack, "c1", "Boss", 33);
    save.currentDate = "2025-07-20";
    // Enrich budgets / tame MV so AI can bid within budget caps
    for (const id of ["c2", "c3"]) {
      save.clubFinances[id].budget = 80;
    }
    for (const p of save.players.filter((x) => x.clubId === "c1")) {
      p.marketValue = 5;
      p.overall = Math.min(p.overall, 78);
    }

    let pending = listPendingIncomingOffers(save);
    for (let i = 0; i < 80 && pending.length === 0; i++) {
      generateIncomingTransferOffers(miniPack, save, new Rng(i));
      pending = listPendingIncomingOffers(save);
    }
    assert.ok(pending.length > 0, "expected incoming offers");

    const offer = pending[0];
    const beforeBudget = save.clubFinances.c1.budget;
    const accepted = acceptIncomingOffer(miniPack, save, offer.id);
    assert.equal(accepted.ok, true);
    save = accepted.save;
    assert.ok(save.clubFinances.c1.budget > beforeBudget);
    const sold = save.players.find((p) => p.id === offer.playerId);
    assert.equal(sold?.clubId, offer.buyingClubId);
    assert.equal(
      listPendingIncomingOffers(save).filter((o) => o.playerId === offer.playerId).length,
      0
    );

    // Fresh offers then reject all
    for (const p of save.players.filter((x) => x.clubId === "c1")) {
      p.marketValue = 5;
      p.overall = Math.min(p.overall, 78);
    }
    for (let i = 0; i < 40; i++) {
      generateIncomingTransferOffers(miniPack, save, new Rng(200 + i));
    }
    if (listPendingIncomingOffers(save).length) {
      save = rejectIncomingOffers(save);
      assert.equal(listPendingIncomingOffers(save).length, 0);
    }
  });
});
