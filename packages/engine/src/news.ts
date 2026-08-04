import type { Club, Fixture, MatchResult, NewsItem, Player } from "./types";
import { Rng } from "./rng";

const PRESIDENT_QUOTES = [
  "Клуб должен бороться выше, чем позволяют таблицы.",
  "Трансферное окно будет точечным, без шоу ради шоу.",
  "Мы строим проект на годы, а не на один всплеск.",
];

const SD_QUOTES = [
  "Скаутинг уже смотрит усиление линии атаки.",
  "Контракты ключевых игроков под контролем.",
];

const RUMOURS = [
  "источники связывают {player} («{from}») с переходом в «{club}»",
  "агент {player} («{from}») якобы зондирует интерес со стороны «{club}»",
  "в раздевалке «{from}» поговаривают о возможном уходе {player}",
];

const PRES_NAMES = ["Александр Морозов", "Виктор Лебедев", "Дмитрий Соколов"];
const SD_NAMES = ["Роман Киселёв", "Евгений Макаров", "Никита Фролов"];
const JOURNALISTS = ["Илья Репортёров", "Анна Спортивная", "Максим Инсайдов"];

function playerName(p: Player): string {
  return `${p.firstName} ${p.lastName}`;
}

function fillRumour(
  template: string,
  player: Player,
  fromClub: Club,
  toClub: Club
): string {
  return template
    .replace(/\{player\}/g, playerName(player))
    .replace(/\{from\}/g, fromClub.name)
    .replace(/\{club\}/g, toClub.name);
}

export function newsFromMatch(
  fixture: Fixture,
  result: MatchResult,
  home: Club,
  away: Club,
  players: Player[],
  rng: Rng
): NewsItem[] {
  const items: NewsItem[] = [];
  const score = `${result.homeGoals}:${result.awayGoals}`;
  items.push({
    id: `news-match-${fixture.id}`,
    date: fixture.date,
    category: "match",
    headline: `${home.shortName} ${score} ${away.shortName}`,
    body: `${home.name} приняли ${away.name}. Финальный счёт ${score}. Удары: ${result.homeShots}–${result.awayShots}.`,
    relatedClubIds: [home.id, away.id],
  });

  if (rng.chance(0.15)) {
    const club = rng.pick([home, away]);
    const quote = rng.pick(PRESIDENT_QUOTES);
    items.push({
      id: `news-pres-${fixture.id}`,
      date: fixture.date,
      category: "quote",
      headline: `Президент «${club.shortName}»: «${quote}»`,
      body: `Руководство ${club.name} вышло с публичным комментарием.`,
      relatedClubIds: [club.id],
      speaker: { role: "president", name: rng.pick(PRES_NAMES), clubId: club.id },
    });
  }

  if (rng.chance(0.12)) {
    const club = rng.pick([home, away]);
    items.push({
      id: `news-sd-${fixture.id}`,
      date: fixture.date,
      category: "insight",
      headline: `Спортдир «${club.shortName}»: «${rng.pick(SD_QUOTES)}»`,
      body: `В клубе комментируют кадровые планы.`,
      relatedClubIds: [club.id],
      speaker: { role: "sporting_director", name: rng.pick(SD_NAMES), clubId: club.id },
    });
  }

  return items;
}

export function newsNationalTeam(
  date: string,
  federationName: string,
  opponentName: string,
  score: string,
  rng: Rng
): NewsItem {
  return {
    id: `news-nt-${date}-${federationName}-${rng.int(1, 99999)}`,
    date,
    category: "national_team",
    headline: `Сборная ${federationName} ${score} ${opponentName}`,
    body: `В окне сборных ${federationName} провела матч против ${opponentName}. Счёт ${score}.`,
    speaker: { role: "journalist", name: rng.pick(JOURNALISTS) },
  };
}

/**
 * Sparse transfer-window rumours (1 item, not every day).
 * Prefer clubs in the user's league.
 */
export function generateWindowRumours(
  pack: { clubs: Club[]; leagues: { id: string; clubIds: string[] }[] },
  players: Player[],
  userClubId: string,
  date: string,
  existingNews: NewsItem[],
  rng: Rng
): NewsItem[] {
  const recentRumour = existingNews.some(
    (n) => n.category === "transfer_rumour" && n.date === date
  );
  if (recentRumour) return [];
  // Roughly every 3–4 open-window days
  if (!rng.chance(0.32)) return [];

  const league = pack.leagues.find((l) => l.clubIds.includes(userClubId));
  const clubIds = league?.clubIds ?? pack.clubs.map((c) => c.id);
  const clubs = pack.clubs.filter((c) => clubIds.includes(c.id));
  if (clubs.length < 2) return [];

  const pool = players.filter(
    (p) => p.clubId && clubIds.includes(p.clubId) && p.overall >= 66 && p.overall <= 84
  );
  if (!pool.length) return [];

  const p = rng.pick(pool);
  const from = clubs.find((c) => c.id === p.clubId);
  const others = clubs.filter((c) => c.id !== p.clubId);
  if (!from || !others.length) return [];
  const to = rng.pick(others);
  const template = rng.pick(RUMOURS);

  return [
    {
      id: `news-rumour-win-${date}-${p.id}-${rng.int(1, 9999)}`,
      date,
      category: "transfer_rumour",
      headline: "Слухи трансферного окна",
      body: fillRumour(template, p, from, to) + ".",
      relatedClubIds: [from.id, to.id],
      relatedPlayerIds: [p.id],
      speaker: {
        role: "journalist",
        name: rng.pick(JOURNALISTS),
        clubId: from.id,
        playerId: p.id,
      },
    },
  ];
}

/** Rumours / deals to show before a match (window period, small curated set). */
export function transferBuzzForPrematch(
  news: NewsItem[],
  currentDate: string,
  relatedClubIds: string[],
  limit = 3
): NewsItem[] {
  const related = new Set(relatedClubIds);
  const windowish = news.filter(
    (n) =>
      (n.category === "transfer_rumour" || n.category === "transfer") &&
      n.date <= currentDate &&
      (!n.relatedClubIds?.length || n.relatedClubIds.some((id) => related.has(id)))
  );
  // Prefer newest; cap tightly
  return windowish.slice(0, limit);
}
