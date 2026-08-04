import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildClubHistory } from "./clubHistory";
import type { WorldPack } from "./types";

const pack: WorldPack = {
  version: 1,
  season: "2025/26",
  federations: [{ id: "RUS", name: "Россия", confederation: "UEFA" }],
  continentalAccess: { UEFA: { fromSeason: "2020/21" } },
  tournaments: [],
  clubs: [
    {
      id: "c1",
      name: "Тест",
      shortName: "Тест",
      city: "Город",
      federationId: "RUS",
      reputation: 90,
      vibe: "attacking",
      colors: ["#000", "#fff"],
    },
    {
      id: "c2",
      name: "Соперник",
      shortName: "Соп",
      city: "Город",
      federationId: "RUS",
      reputation: 70,
      vibe: "balanced",
      colors: ["#111", "#eee"],
    },
  ],
  leagues: [
    {
      id: "rpl",
      name: "РПЛ",
      federationId: "RUS",
      tier: 1,
      teamCount: 2,
      clubIds: ["c1", "c2"],
    },
  ],
} as unknown as WorldPack;

describe("buildClubHistory honours years", () => {
  it("never awards trophies in the unfinished pack season or later", () => {
    const seasonStart = parseInt(pack.season.slice(0, 4), 10);
    for (const club of pack.clubs) {
      const history = buildClubHistory(pack, club.id);
      assert.ok(history);
      assert.ok(history!.honours.length > 0);
      for (const honour of history!.honours) {
        const m = honour.match(/\((\d{4})\)\s*$/);
        assert.ok(m, `expected year in honour: ${honour}`);
        const year = Number(m![1]);
        assert.ok(
          year < seasonStart,
          `${club.name}: "${honour}" must be before season ${pack.season}`
        );
      }
    }
  });

  it("clamps procedural years that would otherwise reach into the future", () => {
    // High-rep club + late founded year previously produced e.g. 2035.
    const history = buildClubHistory(pack, "c1");
    assert.ok(history);
    for (const honour of history!.honours) {
      const year = Number(honour.match(/\((\d{4})\)\s*$/)?.[1]);
      assert.ok(year <= 2024);
    }
  });
});
