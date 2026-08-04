import { quoteFingerprint } from "./matchReactions";
import { rollCyrillicName } from "./players";
import type { Club, Fixture, MatchResult, NewsItem, Player } from "./types";
import { Rng } from "./rng";

/** Varied presidential tones: dry, witty, blunt, diplomatic, media-savvy, visionary. */
const PRESIDENT_QUOTES = [
  "Таблицы лгут чаще, чем журналисты. Наша планка — выше цифр на сегодня.",
  "Трансферное окно — не ярмарка тщеславия. Покупаем смысл, а не шум.",
  "Проект строится на годах, а не на одном красивом заголовке в понедельник.",
  "Если хотите шоу — купите билет в цирк. Мы продаём результат и характер.",
  "Я не комментирую слухи. Комментирую бюджет, контракты и лицо клуба.",
  "Кричать про «революцию» легко. Сложнее неделю за неделей не ломать курс.",
  "Мы уважаем болельщика достаточно, чтобы не кормить его сказками про чудеса.",
  "Рынок горячий — голова должна быть холодной. Иначе сгорим вместе с деньгами.",
  "Поражение — это данные. Паника — это выбор. Мы выбираем данные.",
  "Состав — не коллекция звёзд. Это оркестр. Дирижёр отвечает за партитуру.",
  "Дипломатия хороша в кулуарах. На поле нужна злость и дисциплина.",
  "Медиа любят драму. Мы любим три очка. Интересы редко совпадают.",
  "Долгий контракт важнее громкого имени. Имя уезжает — система остаётся.",
  "Я сухой в интервью, потому что мокрые обещания дорого обходятся клубу.",
  "Если кто-то ждёт «вау-трансфер» ради лайков — вы не туда пришли.",
  "Стратегия не меняется от одного матча. Меняется тон тех, кто не читал план.",
  "Бюджет — это мораль в цифрах. Тратим так, чтобы стыдно не было через год.",
  "Клуб — не мой личный блог. Это институт. Я отвечаю за институт.",
  "Острые вопросы принимаю. Глупые — тоже, но короче.",
  "Мы не прячемся от критики. Прячемся только от импульсивных покупок.",
];

/** Sporting-director tones: blunt scouting, contract poker, wry market talk. */
const SD_QUOTES = [
  "Скаутинг уже копает атаку. Не списки из Twitter — живые минуты и профиль.",
  "Ключевые контракты под контролем. Паника агентов нас не развлекает.",
  "Рынок шумит громче, чем наши звонки. Так и должно быть.",
  "Ищем не «имя», а решение проблемы на конкретной позиции.",
  "Если игрок дороже пользы — это не трансфер, это сувенир.",
  "Аренда, опцион, зарплата — три кнопки. Нажимаем только две из трёх.",
  "Я не торгуюсь на камеру. Камера любит цену, клуб любит условия.",
  "Глубина состава важнее одного красивого подписания в последний день.",
  "Смотрим характер так же жёстко, как смотрим удар и пас.",
  "Окно короткое. Ошибки длинные. Поэтому темп спокойный, а фильтр жёсткий.",
  "Есть интерес к нам — отлично. Есть интерес от нас — тишина до бумаги.",
  "Молодые с потолком важнее возрастных с резюме. Резюме не бегает.",
  "Скаут сказал «может». Я спрашиваю «когда и против кого».",
  "Контракт — это обещание в обе стороны. Мы умеем читать мелкий шрифт.",
  "Не каждый слух — работа. Иногда это просто кто-то хочет внимания.",
  "Линия атаки — приоритет. Но не ценой дыры в центре, которую потом заклеим лентой.",
];

const RUMOURS = [
  "источники связывают {player} («{from}») с переходом в «{club}»",
  "агент {player} («{from}») якобы зондирует интерес со стороны «{club}»",
  "в раздевалке «{from}» поговаривают о возможном уходе {player}",
  "в окружении {player} («{from}») не исключают переговоры с «{club}»",
  "инсайдеры намекают: «{club}» уже прощупывали цену на {player} из «{from}»",
];

const JOURNALISTS = ["Илья Репортёров", "Анна Спортивная", "Максим Инсайдов", "Кирилл Хроникёр", "Ольга Пресс"];

const FED_FROM_CLUB_PREFIX: Record<string, string> = {
  rus: "RUS",
  eng: "ENG",
  esp: "ESP",
  ger: "GER",
  ita: "ITA",
  fra: "FRA",
};

type QuoteBag = { used: Set<string>; rng: Rng };

function federationForClub(clubId: string): string {
  const prefix = clubId.split("-")[0]?.toLowerCase() ?? "";
  return FED_FROM_CLUB_PREFIX[prefix] ?? "RUS";
}

function staffName(role: "president" | "sporting_director", clubId: string): string {
  const { firstName, lastName } = rollCyrillicName(
    federationForClub(clubId),
    `${role}:${clubId}`
  );
  return `${firstName} ${lastName}`;
}

function pickFresh(pool: string[], bag: QuoteBag): string {
  const free = pool.filter((q) => !bag.used.has(quoteFingerprint(q)));
  if (!free.length) return bag.rng.pick(pool);
  const chosen = bag.rng.pick(free);
  bag.used.add(quoteFingerprint(chosen));
  return chosen;
}

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
  const bag: QuoteBag = { used: new Set(), rng };
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
    const quote = pickFresh(PRESIDENT_QUOTES, bag);
    items.push({
      id: `news-pres-${fixture.id}`,
      date: fixture.date,
      category: "quote",
      headline: `Президент «${club.shortName}»: «${quote}»`,
      body: `Руководство ${club.name} вышло с публичным комментарием.`,
      relatedClubIds: [club.id],
      speaker: { role: "president", name: staffName("president", club.id), clubId: club.id },
    });
  }

  if (rng.chance(0.12)) {
    const club = rng.pick([home, away]);
    const quote = pickFresh(SD_QUOTES, bag);
    items.push({
      id: `news-sd-${fixture.id}`,
      date: fixture.date,
      category: "insight",
      headline: `Спортдир «${club.shortName}»: «${quote}»`,
      body: `В клубе комментируют кадровые планы.`,
      relatedClubIds: [club.id],
      speaker: {
        role: "sporting_director",
        name: staffName("sporting_director", club.id),
        clubId: club.id,
      },
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
