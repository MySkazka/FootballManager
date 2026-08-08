import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FORMATION_ROLES,
  analyzeLineupStrength,
  applyOptimalLineup,
  autoSelectLineup,
  effectiveOverall,
  lineupContributionScore,
  slotContribution,
} from "./tactics";
import type { Player, RoleId } from "./types";

function stubPlayer(
  id: string,
  overall: number,
  preferredRole: RoleId,
  roles: RoleId[],
  foot: "L" | "R" | "B" = "R"
): Player {
  return {
    id,
    firstName: "Игрок",
    lastName: id,
    age: 25,
    nationalityId: "RUS",
    clubId: "club-a",
    positions: [],
    preferredRole,
    roles,
    preferredFoot: foot,
    overall,
    potential: overall + 2,
    marketValue: overall / 10,
    wage: 1,
    height: 180,
    weight: 75,
    attributes: {
      pace: overall,
      shooting: overall,
      passing: overall,
      dribbling: overall,
      defending: overall,
      physical: overall,
      goalkeeping: preferredRole === "GK" ? overall : 20,
    },
    traits: [],
    portraitId: 1,
  };
}

describe("autoSelectLineup prefers role contribution over raw OVR on bench", () => {
  it("puts natural RW ahead of higher-OVR striker forced wide", () => {
    const players: Player[] = [
      stubPlayer("gk", 78, "GK", ["GK"]),
      stubPlayer("lb", 76, "LB", ["LB"], "L"),
      stubPlayer("cb1", 77, "CB", ["CB"]),
      stubPlayer("cb2", 76, "CB", ["CB"]),
      stubPlayer("rb", 75, "RB", ["RB"], "R"),
      stubPlayer("cm1", 74, "CM", ["CM"]),
      stubPlayer("cdm", 73, "CDM", ["CDM"]),
      stubPlayer("cm2", 72, "CM", ["CM"]),
      stubPlayer("lw", 74, "LW", ["LW"], "L"),
      stubPlayer("st", 88, "ST", ["ST"]),
      stubPlayer("rw-nat", 79, "RW", ["RW"], "R"),
      stubPlayer("st2", 86, "ST", ["ST"]),
      stubPlayer("bench-rw", 70, "CM", ["CM"]),
    ];

    const xi = autoSelectLineup(players, "club-a", "4-3-3");
    const roles = FORMATION_ROLES["4-3-3"];
    const rwIdx = roles.indexOf("RW");
    assert.equal(xi[rwIdx], "rw-nat");

    const stIdx = roles.indexOf("ST");
    assert.ok(xi[stIdx] === "st" || xi[stIdx] === "st2");

    const byId = new Map(players.map((p) => [p.id, p]));
    for (let i = 0; i < roles.length; i++) {
      const starter = byId.get(xi[i]!);
      assert.ok(starter);
      const role = roles[i]!;
      const starterScore = slotContribution(starter, role);
      for (const p of players) {
        if (xi.includes(p.id)) continue;
        if (role === "GK" && p.preferredRole !== "GK") continue;
        if (role !== "GK" && p.preferredRole === "GK") continue;
        assert.ok(
          slotContribution(p, role) <= starterScore + 0.5,
          `bench ${p.id} (${slotContribution(p, role)}) should not beat XI ${starter.id} on ${role} (${starterScore})`
        );
      }
    }
  });

  it("analyzeLineupStrength + applyOptimalLineup improve a weak XI", () => {
    const players: Player[] = [
      stubPlayer("gk", 78, "GK", ["GK"]),
      stubPlayer("lb", 76, "LB", ["LB"], "L"),
      stubPlayer("cb1", 77, "CB", ["CB"]),
      stubPlayer("cb2", 76, "CB", ["CB"]),
      stubPlayer("rb", 75, "RB", ["RB"], "R"),
      stubPlayer("cm1", 74, "CM", ["CM"]),
      stubPlayer("cdm", 73, "CDM", ["CDM"]),
      stubPlayer("cm2", 72, "CM", ["CM"]),
      stubPlayer("lw", 74, "LW", ["LW"], "L"),
      stubPlayer("st", 80, "ST", ["ST"]),
      stubPlayer("rw", 78, "RW", ["RW"], "R"),
      stubPlayer("star-rw", 85, "RW", ["RW"], "R"),
    ];
    const weak = {
      formation: "4-3-3" as const,
      lineup: ["gk", "lb", "cb1", "cb2", "rb", "cm1", "cdm", "cm2", "lw", "st", "rw"],
      attack: 55,
      defence: 55,
      aggression: 50,
    };
    const before = lineupContributionScore(weak.lineup, "4-3-3", players);
    const hints = analyzeLineupStrength(players, "club-a", weak);
    assert.ok(hints.some((h) => h.message.includes("Сила слота") || h.outId));
    const next = applyOptimalLineup(players, "club-a", weak);
    const after = lineupContributionScore(next.lineup, "4-3-3", players);
    assert.ok(after >= before);
    assert.ok(next.lineup.includes("star-rw"));
    assert.ok(effectiveOverall(players.find((p) => p.id === "star-rw")!, "RW") >= 80);
  });
});
