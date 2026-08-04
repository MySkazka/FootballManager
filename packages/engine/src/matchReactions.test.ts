import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMatchReactions, quoteFingerprint } from "./matchReactions";
import type { MatchEvent, MatchResult, MatchSideStats, Player } from "./types";

function mkPlayer(id: string, clubId: string): Player {
  return {
    id,
    clubId,
    firstName: "Иван",
    lastName: id,
    age: 25,
    overall: 70,
    potential: 75,
    nationalityId: "RUS",
    positions: ["CM"],
    roles: ["CM"],
    preferredRole: "CM",
    contractUntil: "2027",
    wage: 10,
    value: 1e6,
    morale: 70,
    fitness: 80,
    form: 70,
    stamina: 100,
    injuredUntil: null,
    suspendedMatches: 0,
  } as unknown as Player;
}

function stats(extra: Partial<MatchSideStats> = {}): MatchSideStats {
  return {
    shots: 8,
    shotsOnTarget: 3,
    possessionTicks: 50,
    fouls: 10,
    yellowCards: 1,
    redCards: 0,
    corners: 3,
    offsides: 1,
    ...extra,
  };
}

describe("matchReactions dedup", () => {
  it("fingerprints venue variants as the same template", () => {
    const a = "Честный раздел очков дома. Картинка боевая.";
    const b = "Честный раздел очков в гостях. Картинка боевая.";
    assert.equal(quoteFingerprint(a), quoteFingerprint(b));
  });

  it("keeps quotes unique by fingerprint within a 0-0 match", () => {
    const events: MatchEvent[] = [];
    const result = {
      homeGoals: 0,
      awayGoals: 0,
      homeShots: 6,
      awayShots: 5,
      events,
      ratings: { hp0: 6.8, hp1: 6.4, ap0: 6.7, ap1: 6.3 },
      homeLineup: ["hp0", "hp1"],
      awayLineup: ["ap0", "ap1"],
    } as MatchResult;
    const players = [
      mkPlayer("hp0", "home-club"),
      mkPlayer("hp1", "home-club"),
      mkPlayer("ap0", "away-club"),
      mkPlayer("ap1", "away-club"),
    ];

    for (let seed = 1; seed <= 200; seed++) {
      const reactions = buildMatchReactions(
        result,
        players,
        "home-club",
        "away-club",
        stats(),
        stats(),
        seed
      );
      const keys = reactions.map((r) => quoteFingerprint(r.quote));
      assert.equal(
        new Set(keys).size,
        keys.length,
        `duplicate fingerprint at seed ${seed}: ${reactions.map((r) => r.quote).join(" | ")}`
      );
      assert.ok(reactions.length >= 2);
    }
  });

  it("keeps quotes unique across varied scorelines", () => {
    const players = [
      mkPlayer("hp0", "h"),
      mkPlayer("hp1", "h"),
      mkPlayer("ap0", "a"),
      mkPlayer("ap1", "a"),
    ];
    for (let seed = 1; seed <= 80; seed++) {
      for (const [hg, ag] of [
        [1, 1],
        [2, 2],
        [1, 0],
        [0, 1],
        [3, 1],
      ] as [number, number][]) {
        const events: MatchEvent[] = [];
        for (let i = 0; i < hg; i++) {
          events.push({
            minute: 10 + i * 10,
            type: "goal",
            clubId: "h",
            playerId: "hp0",
            text: "g",
            score: [i + 1, 0],
          } as MatchEvent);
        }
        for (let i = 0; i < ag; i++) {
          events.push({
            minute: 15 + i * 10,
            type: "goal",
            clubId: "a",
            playerId: "ap0",
            text: "g",
            score: [hg, i + 1],
          } as MatchEvent);
        }
        const result = {
          homeGoals: hg,
          awayGoals: ag,
          homeShots: 10,
          awayShots: 9,
          events,
          ratings: { hp0: 7.5, hp1: 6.2, ap0: 7.1, ap1: 6.0 },
          homeLineup: ["hp0", "hp1"],
          awayLineup: ["ap0", "ap1"],
        } as MatchResult;
        const reactions = buildMatchReactions(
          result,
          players,
          "h",
          "a",
          stats(),
          stats(),
          seed
        );
        const keys = reactions.map((r) => quoteFingerprint(r.quote));
        assert.equal(new Set(keys).size, keys.length);
      }
    }
  });
});
