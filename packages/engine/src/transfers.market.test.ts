import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCareer, normalizeCareerSave } from "./career";
import { listTransferTargets, transferClubScope } from "./transfers";
import type { WorldPack } from "./types";

const pack = {
  version: "test",
  season: "2025/26",
  federations: [
    { id: "RUS", name: "Russia", confederation: "UEFA" },
    { id: "ENG", name: "England", confederation: "UEFA" },
    { id: "POR", name: "Portugal", confederation: "UEFA" },
  ],
  continentalAccess: [],
  clubs: [
    {
      id: "rus-a",
      name: "Alpha",
      shortName: "ALP",
      city: "A",
      federationId: "RUS",
      reputation: 80,
      colors: ["#111", "#222"],
      vibe: "a",
      stadium: "A",
      budget: 60,
      crest: "a",
    },
    {
      id: "rus-b",
      name: "Beta",
      shortName: "BET",
      city: "B",
      federationId: "RUS",
      reputation: 70,
      colors: ["#333", "#444"],
      vibe: "b",
      stadium: "B",
      budget: 40,
      crest: "b",
    },
    {
      id: "eng-a",
      name: "Gunners",
      shortName: "GUN",
      city: "London",
      federationId: "ENG",
      reputation: 88,
      colors: ["#E00", "#FFF"],
      vibe: "eng",
      stadium: "E",
      budget: 200,
      crest: "e",
    },
    {
      id: "por-eagles",
      name: "Орлы",
      shortName: "Орлы",
      city: "Lisbon",
      federationId: "POR",
      reputation: 86,
      colors: ["#E00", "#FFF"],
      vibe: "guest",
      stadium: "P",
      budget: 90,
      crest: "p",
      guest: true,
    },
  ],
  leagues: [
    {
      id: "rpl",
      name: "РПЛ",
      federationId: "RUS",
      tier: 1,
      teamCount: 2,
      clubIds: ["rus-a", "rus-b"],
    },
    {
      id: "epl",
      name: "АПЛ",
      federationId: "ENG",
      tier: 1,
      teamCount: 1,
      clubIds: ["eng-a"],
    },
  ],
  tournaments: [],
} as unknown as WorldPack;

describe("listTransferTargets market scopes", () => {
  it("includes other leagues and euro guests, not only home league", () => {
    const save = createCareer(pack, "rus-a", "Boss", 42);

    const all = listTransferTargets(pack, save, { scope: "all", limit: 80 });
    const clubs = new Set(all.map((p) => p.clubId));
    assert.ok(clubs.has("rus-b"), "same-league club should appear");
    assert.ok(clubs.has("eng-a"), "other domestic league should appear");
    assert.ok(clubs.has("por-eagles"), "euro guest club should appear");

    const other = listTransferTargets(pack, save, { scope: "other", limit: 40 });
    assert.ok(other.every((p) => p.clubId === "eng-a"));
    assert.ok(other.length > 0);

    const euro = listTransferTargets(pack, save, { scope: "euro", limit: 40 });
    assert.ok(euro.every((p) => p.clubId === "por-eagles"));
    assert.ok(euro.length > 0);

    assert.equal(transferClubScope(pack, save, "eng-a"), "other");
    assert.equal(transferClubScope(pack, save, "por-eagles"), "euro");
    assert.equal(transferClubScope(pack, save, "rus-b"), "league");
  });

  it("ensureMissingClubSquads keeps guest squads on normalize", () => {
    const raw = createCareer(pack, "rus-a", "Boss", 7);
    // Drop guest players to simulate an old save, then normalize should restore them.
    const stripped = {
      ...raw,
      players: raw.players.filter((p) => p.clubId !== "por-eagles"),
    };
    const fixed = normalizeCareerSave(pack, stripped);
    assert.ok(fixed);
    const guestPlayers = fixed!.players.filter((p) => p.clubId === "por-eagles");
    assert.ok(guestPlayers.length >= 18, `expected guest squad, got ${guestPlayers.length}`);
    const euro = listTransferTargets(pack, fixed!, { scope: "euro", limit: 20 });
    assert.ok(euro.length > 0);
  });
});
