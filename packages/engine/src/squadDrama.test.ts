import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCareer, normalizeCareerSave } from "./career";
import { Rng } from "./rng";
import {
  DRAMA_MAX_ACTIVE,
  DRAMA_SPAWN_CHANCE_PER_DAY,
  DRAMA_XI_STARTS_TO_RESOLVE,
  applyDramaPenalty,
  clearSquadDramasForPlayers,
  forceSpawnDrama,
  noteSquadDramaMatchStarts,
  tickSquadDramas,
  newsComparePlayerIds,
} from "./squadDrama";
import type { CareerSave, WorldPack } from "./types";

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
      budget: 80,
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
      budget: 35,
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

function fringePlayer(save: CareerSave) {
  const xi = new Set(save.userTactics.lineup);
  const squad = save.players.filter((p) => p.clubId === save.clubId && !p.loan);
  const bench = squad.filter((p) => !xi.has(p.id)).sort((a, b) => a.overall - b.overall);
  return bench[0] ?? squad[squad.length - 1]!;
}

describe("squad drama", () => {
  it("migrates old saves to empty squadDramas", () => {
    const save = createCareer(miniPack, "c1", "Boss", 3);
    const raw = { ...save } as Record<string, unknown>;
    delete raw.squadDramas;
    const normalized = normalizeCareerSave(miniPack, raw);
    assert.ok(normalized);
    assert.deepEqual(normalized!.squadDramas, []);
  });

  it("createCareer starts with empty dramas", () => {
    const save = createCareer(miniPack, "c1", "Boss", 4);
    assert.deepEqual(save.squadDramas, []);
  });

  it("spawn rate stays near ~1.5/month over a long daily sim", () => {
    const save = createCareer(miniPack, "c1", "Boss", 11);
    let spawned = 0;
    for (let day = 0; day < 360; day++) {
      // Isolate daily Bernoulli trials (no concurrent cap / cooldown pressure)
      save.squadDramas = [];
      const before = (save.squadDramas ?? []).length;
      tickSquadDramas(miniPack, save, new Rng(1000 + day * 17));
      const after = (save.squadDramas ?? []).filter((d) => d.status === "active").length;
      if (after > before) spawned += after - before;
      const d = new Date(save.currentDate);
      d.setDate(d.getDate() + 1);
      save.currentDate = d.toISOString().slice(0, 10);
    }
    const expected = 360 * DRAMA_SPAWN_CHANCE_PER_DAY;
    assert.ok(spawned >= expected * 0.35, `too few spawns: ${spawned} vs ~${expected}`);
    assert.ok(spawned <= expected * 2.2, `too many spawns: ${spawned} vs ~${expected}`);
    assert.equal(DRAMA_SPAWN_CHANCE_PER_DAY, 0.05);
    assert.equal(DRAMA_MAX_ACTIVE, 2);
  });

  it("caps concurrent active dramas", () => {
    const save = createCareer(miniPack, "c1", "Boss", 5);
    const squad = save.players.filter((p) => p.clubId === "c1" && !p.loan);
    forceSpawnDrama(save, "playing_time", [squad[0]!.id], "Alpha");
    forceSpawnDrama(save, "coach_clash", [squad[1]!.id], "Alpha");
    assert.equal((save.squadDramas ?? []).filter((d) => d.status === "active").length, 2);

    // Tick with guaranteed chance still cannot exceed cap
    for (let i = 0; i < 30; i++) {
      const rng = new Rng(999 + i);
      // Bypass daily chance by calling tick many times — cap must hold
      tickSquadDramas(miniPack, save, rng);
    }
    assert.ok(
      (save.squadDramas ?? []).filter((d) => d.status === "active").length <= DRAMA_MAX_ACTIVE
    );
  });

  it("drops overall when drama is ignored (not in XI)", () => {
    const save = createCareer(miniPack, "c1", "Boss", 6);
    const victim = fringePlayer(save);
    // Ensure not in XI
    save.userTactics = {
      ...save.userTactics,
      lineup: save.userTactics.lineup.filter((id) => id !== victim.id),
    };
    const drama = forceSpawnDrama(save, "playing_time", [victim.id], "Alpha");
    const before = victim.overall;
    // Jump clock so penalty window is due
    drama.lastPenaltyOn = undefined;
    drama.startedOn = "2025-08-01";
    save.currentDate = "2025-08-10";
    const applied = applyDramaPenalty(save, drama);
    assert.equal(applied, true);
    const after = save.players.find((p) => p.id === victim.id)!.overall;
    assert.ok(after < before, `overall should drop (${before} → ${after})`);
  });

  it("does not drop overall while player is in starting XI", () => {
    const save = createCareer(miniPack, "c1", "Boss", 7);
    const starterId = save.userTactics.lineup[0]!;
    const starter = save.players.find((p) => p.id === starterId)!;
    const drama = forceSpawnDrama(save, "playing_time", [starter.id], "Alpha");
    const before = starter.overall;
    const applied = applyDramaPenalty(save, drama);
    assert.equal(applied, false);
    assert.equal(save.players.find((p) => p.id === starterId)!.overall, before);
  });

  it("clears drama after enough consecutive XI starts", () => {
    const save = createCareer(miniPack, "c1", "Boss", 8);
    const victim = fringePlayer(save);
    const drama = forceSpawnDrama(save, "playing_time", [victim.id], "Alpha");
    assert.equal(drama.status, "active");

    for (let i = 0; i < DRAMA_XI_STARTS_TO_RESOLVE; i++) {
      noteSquadDramaMatchStarts(save, [victim.id], save.clubId);
    }
    assert.equal(drama.status, "resolved");
    assert.equal(drama.resolvedReason, "starting_xi");
  });

  it("clears drama when player is sold", () => {
    const save = createCareer(miniPack, "c1", "Boss", 9);
    const victim = fringePlayer(save);
    const drama = forceSpawnDrama(save, "wants_transfer", [victim.id], "Alpha");
    victim.clubId = "c2";
    clearSquadDramasForPlayers(save, [victim.id], "sold");
    assert.equal(drama.status, "resolved");
    assert.equal(drama.resolvedReason, "sold");
  });

  it("clears drama when player is loaned out", () => {
    const save = createCareer(miniPack, "c1", "Boss", 10);
    const victim = fringePlayer(save);
    const drama = forceSpawnDrama(save, "coach_clash", [victim.id], "Alpha");
    victim.loan = { parentClubId: "c1", fee: 1, until: "2026-06-30" };
    victim.clubId = "c2";
    clearSquadDramasForPlayers(save, [victim.id], "loaned");
    assert.equal(drama.status, "resolved");
    assert.equal(drama.resolvedReason, "loaned");
  });

  it("solo club-conflict news names the player and the club clearly", () => {
    const save = createCareer(miniPack, "c1", "Boss", 12);
    const victim = fringePlayer(save);
    forceSpawnDrama(save, "playing_time", [victim.id], "Alpha");
    const item = save.news.find((n) => n.category === "drama");
    assert.ok(item);
    assert.ok(/клуб|штаб|скамейк/i.test(`${item!.headline} ${item!.body}`));
    assert.ok(/конфликт|против|недоволен|ультиматум|требует/i.test(`${item!.headline} ${item!.body}`));
    assert.ok(item!.relatedPlayerIds?.includes(victim.id));
    assert.equal(item!.relatedPlayerIds?.length, 1);
    assert.equal(newsComparePlayerIds(item!, save), null);
  });

  it("two-player fight news opens compare; solo does not", () => {
    const save = createCareer(miniPack, "c1", "Boss", 21);
    const squad = save.players.filter((p) => p.clubId === save.clubId && !p.loan);
    forceSpawnDrama(save, "dressing_room_fight", [squad[0]!.id, squad[1]!.id], "Alpha");
    const fight = save.news.find((n) => n.category === "drama");
    assert.ok(newsComparePlayerIds(fight!, save));
  });

  it("two-player fight news carries both relatedPlayerIds", () => {
    const save = createCareer(miniPack, "c1", "Boss", 13);
    const squad = save.players.filter((p) => p.clubId === save.clubId && !p.loan);
    const a = squad[0]!;
    const b = squad[1]!;
    forceSpawnDrama(save, "dressing_room_fight", [a.id, b.id], "Alpha");
    const item = save.news.find((n) => n.category === "drama");
    assert.ok(item);
    assert.deepEqual(item!.relatedPlayerIds, [a.id, b.id]);
    const pair = newsComparePlayerIds(item!, save);
    assert.deepEqual(pair, [a.id, b.id]);
  });

  it("enriches truncated drama news from squadDramas on normalize", () => {
    const save = createCareer(miniPack, "c1", "Boss", 14);
    const squad = save.players.filter((p) => p.clubId === save.clubId && !p.loan);
    const a = squad[0]!;
    const b = squad[1]!;
    const drama = forceSpawnDrama(save, "clique_conflict", [a.id, b.id], "Alpha");
    const item = save.news.find((n) => n.id === `news-drama-${drama.id}`)!;
    item.relatedPlayerIds = [a.id]; // simulate legacy truncation
    const normalized = normalizeCareerSave(miniPack, save);
    assert.ok(normalized);
    const fixed = normalized!.news.find((n) => n.id === item.id);
    assert.deepEqual(fixed?.relatedPlayerIds, [a.id, b.id]);
  });
});
