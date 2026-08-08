import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildClubHistory,
  buildWorldHonoursLedger,
  groupHonoursForDisplay,
  timesHolderPhrase,
} from "./clubHistory";
import type { WorldPack } from "./types";

const pack: WorldPack = {
  version: 1,
  season: "2025/26",
  federations: [
    { id: "RUS", name: "Россия", confederation: "UEFA", coefficient: 20 },
    { id: "ENG", name: "Англия", confederation: "UEFA", coefficient: 90 },
  ],
  continentalAccess: { UEFA: { fromSeason: "2020/21" } },
  tournaments: [],
  clubs: [
    {
      id: "c1",
      name: "Гигант",
      shortName: "Гиг",
      city: "Город",
      federationId: "RUS",
      reputation: 92,
      vibe: "attacking",
      colors: ["#000", "#fff"],
      stadium: "S1",
    },
    {
      id: "c2",
      name: "Середняк",
      shortName: "Сер",
      city: "Город",
      federationId: "RUS",
      reputation: 74,
      vibe: "balanced",
      colors: ["#111", "#eee"],
      stadium: "S2",
    },
    {
      id: "c3",
      name: "Аутсайдер",
      shortName: "Аут",
      city: "Город",
      federationId: "RUS",
      reputation: 58,
      vibe: "defensive",
      colors: ["#222", "#ddd"],
      stadium: "S3",
    },
    {
      id: "e1",
      name: "London Elite",
      shortName: "LE",
      city: "London",
      federationId: "ENG",
      reputation: 95,
      vibe: "attacking",
      colors: ["#003", "#fff"],
      stadium: "E1",
    },
    {
      id: "e2",
      name: "London Mid",
      shortName: "LM",
      city: "London",
      federationId: "ENG",
      reputation: 72,
      vibe: "balanced",
      colors: ["#030", "#fff"],
      stadium: "E2",
    },
  ],
  leagues: [
    {
      id: "rpl",
      name: "РПЛ",
      federationId: "RUS",
      tier: 1,
      teamCount: 3,
      clubIds: ["c1", "c2", "c3"],
    },
    {
      id: "epl",
      name: "АПЛ",
      federationId: "ENG",
      tier: 1,
      teamCount: 2,
      clubIds: ["e1", "e2"],
    },
  ],
} as unknown as WorldPack;

/** Years listed in a grouped honour line, e.g. `(2001, 2004, 2020)`. */
function yearsInHonourLine(honour: string): number[] {
  const m = honour.match(/\(([^)]+)\)\s*$/);
  if (!m) return [];
  return m[1]!
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1000);
}

describe("groupHonoursForDisplay", () => {
  it("groups same competition into one line with ascending years", () => {
    const lines = groupHonoursForDisplay([
      "Чемпион страны (2004)",
      "Чемпион страны (2001)",
      "Чемпион страны (2020)",
      "Обладатель кубка (2010)",
    ]);
    assert.deepEqual(lines, [
      "Чемпион страны. 3-кратный обладатель (2001, 2004, 2020)",
      "Обладатель кубка (2010)",
    ]);
  });

  it("uses N-кратный only for counts ≥ 2", () => {
    assert.equal(timesHolderPhrase(1), "");
    assert.equal(timesHolderPhrase(2), "2-кратный обладатель");
    assert.equal(timesHolderPhrase(5), "5-кратный обладатель");
  });
});

describe("buildClubHistory honours years", () => {
  it("never awards trophies in the unfinished pack season or later", () => {
    const seasonStart = parseInt(pack.season.slice(0, 4), 10);
    for (const club of pack.clubs) {
      const history = buildClubHistory(pack, club.id);
      assert.ok(history);
      for (const honour of history!.honours) {
        const years = yearsInHonourLine(honour);
        assert.ok(years.length > 0, `expected years in honour: ${honour}`);
        for (const year of years) {
          assert.ok(
            year < seasonStart,
            `${club.name}: "${honour}" must be before season ${pack.season}`
          );
        }
      }
    }
  });

  it("clamps procedural years that would otherwise reach into the future", () => {
    const history = buildClubHistory(pack, "c1");
    assert.ok(history);
    for (const honour of history!.honours) {
      for (const year of yearsInHonourLine(honour)) {
        assert.ok(year <= 2024);
      }
    }
  });

  it("assigns at most one club per competition+year within a federation", () => {
    const { slots } = buildWorldHonoursLedger(pack);
    const domestic = ["Чемпион страны", "Обладатель кубка", "Суперкубок", "Чемпион второй лиги"];
    const byFed = new Map<string, typeof slots>();
    for (const slot of slots) {
      if (!domestic.includes(slot.competition)) continue;
      const fed = pack.clubs.find((c) => c.id === slot.clubId)?.federationId ?? "?";
      const key = `${fed}|${slot.competition}|${slot.year}`;
      const list = byFed.get(key) ?? [];
      list.push(slot);
      byFed.set(key, list);
    }
    for (const [key, list] of byFed) {
      assert.equal(list.length, 1, `duplicate honour slot: ${key}`);
    }
  });

  it("prefers top clubs for major honours; low-rep clubs stay sparse", () => {
    const top = buildClubHistory(pack, "c1")!;
    const mid = buildClubHistory(pack, "c2")!;
    const low = buildClubHistory(pack, "c3")!;
    assert.ok(top.honours.length >= mid.honours.length);
    assert.ok(top.honours.length > 0, "top club should have trophies");
    // Low-rep clubs may have at most a second-division title, often empty
    assert.ok(low.honours.length <= 2);
    const major = (h: string) =>
      h.startsWith("Чемпион страны") ||
      h.startsWith("Обладатель кубка") ||
      h.startsWith("Суперкубок") ||
      h.startsWith("Победитель еврокубка");
    assert.equal(low.honours.filter(major).length, 0);
  });

  it("returns one display line per competition with grouped years", () => {
    const history = buildClubHistory(pack, "c1")!;
    assert.ok(history.honours.length > 0);
    const comps = new Set<string>();
    for (const honour of history.honours) {
      const years = yearsInHonourLine(honour);
      assert.ok(years.length > 0, `expected years in honour: ${honour}`);
      assert.deepEqual(years, [...years].sort((a, b) => a - b));
      if (years.length === 1) {
        const m = honour.match(/^(.+) \(\d{4}\)$/);
        assert.ok(m, `expected singular format: ${honour}`);
        assert.ok(!honour.includes(". "), `singular must not use multiplicity: ${honour}`);
        assert.ok(!comps.has(m![1]!), `duplicate competition line: ${m![1]}`);
        comps.add(m![1]!);
      } else {
        const m = honour.match(/^(.+)\. .+ \(([^)]+)\)$/);
        assert.ok(m, `expected grouped format: ${honour}`);
        assert.ok(!comps.has(m![1]!), `duplicate competition line: ${m![1]}`);
        comps.add(m![1]!);
        assert.match(honour, new RegExp(`\\. ${years.length}-кратный обладатель \\(`));
      }
    }
  });
});
