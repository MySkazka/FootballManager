import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasContinentalAccess } from "./access";
import type { WorldPack } from "./types";

const pack: WorldPack = {
  version: "test",
  season: "2025/26",
  federations: [
    { id: "RUS", name: "Россия", confederation: "UEFA", coefficient: 25 },
    { id: "ENG", name: "Англия", confederation: "UEFA", coefficient: 90 },
  ],
  continentalAccess: [
    {
      federationId: "RUS",
      confederation: "UEFA",
      allowed: false,
      range: { fromSeason: "2022/23", toSeason: null },
      note: "Suspended until further notice",
    },
  ],
  clubs: [],
  leagues: [],
  tournaments: [],
};

describe("continental access", () => {
  it("blocks RUS while rule is open-ended", () => {
    assert.equal(hasContinentalAccess(pack, "RUS"), false);
  });

  it("allows ENG by default", () => {
    assert.equal(hasContinentalAccess(pack, "ENG"), true);
  });

  it("allows RUS from 2025/26 when reinstated", () => {
    const reopened: WorldPack = {
      ...pack,
      continentalAccess: [
        {
          federationId: "RUS",
          confederation: "UEFA",
          allowed: false,
          range: { fromSeason: "2022/23", toSeason: "2024/25" },
        },
        {
          federationId: "RUS",
          confederation: "UEFA",
          allowed: true,
          range: { fromSeason: "2025/26", toSeason: null },
        },
      ],
    };
    assert.equal(hasContinentalAccess(reopened, "RUS", "2024/25"), false);
    assert.equal(hasContinentalAccess(reopened, "RUS", "2025/26"), true);
  });
});
