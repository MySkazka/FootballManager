/**
 * Builds data/world/pack.v1.json with real top-flight sizes:
 * RPL 16, EPL 20, La Liga 20, Bundesliga 18, Serie A 20, Ligue 1 18
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function club(partial) {
  const reputation = partial.reputation ?? 60;
  return {
    stadium: partial.stadium ?? `${partial.city} Arena`,
    /** Abstract millions — seeded from reputation for career finances. */
    budget: partial.budget ?? Math.round(reputation * 0.55 + 8),
    ...partial,
  };
}

const clubs = [
  // RPL 16
  club({ id: "rus-rw", name: "Красно-белые", shortName: "Кр.-белые", city: "Москва", federationId: "RUS", stadium: "Открытие Арена*", reputation: 82, colors: ["#E31C23", "#FFFFFF"], vibe: "народный гигант", crest: "star" }),
  club({ id: "rus-army", name: "Армейцы", shortName: "Армейцы", city: "Москва", federationId: "RUS", stadium: "ВЭБ Арена*", reputation: 80, colors: ["#C4122E", "#0033A0"], vibe: "красно-синие", crest: "shield" }),
  club({ id: "rus-blue", name: "Питерские синие", shortName: "СБГ", city: "Санкт-Петербург", federationId: "RUS", stadium: "Газпром Арена*", reputation: 84, colors: ["#1C8BCC", "#FFFFFF"], vibe: "сине-бело-голубые", crest: "wave" }),
  club({ id: "rus-loco", name: "Железнодорожники", shortName: "ЖД", city: "Москва", federationId: "RUS", stadium: "РЖД Арена*", reputation: 76, colors: ["#C8102E", "#007A33"], vibe: "красно-зелёные", crest: "rail" }),
  club({ id: "rus-dinamo", name: "Бело-голубые", shortName: "Бел.-гол.", city: "Москва", federationId: "RUS", stadium: "ВТБ Арена*", reputation: 74, colors: ["#0033A0", "#FFFFFF"], vibe: "петровский парк", crest: "diamond" }),
  club({ id: "rus-kras", name: "Быки", shortName: "Быки", city: "Краснодар", federationId: "RUS", stadium: "Стадион Быков", reputation: 78, colors: ["#000000", "#78B833"], vibe: "южные чёрно-зелёные", crest: "bull" }),
  club({ id: "rus-kazan", name: "Рубиновые", shortName: "Рубиновые", city: "Казань", federationId: "RUS", stadium: "Центральный*", reputation: 70, colors: ["#8B0000", "#006633"], vibe: "татарстанские", crest: "gem" }),
  club({ id: "rus-rostov", name: "Жёлто-синие", shortName: "Жёлто-син.", city: "Ростов-на-Дону", federationId: "RUS", stadium: "Донская арена*", reputation: 68, colors: ["#FFD100", "#0033A0"], vibe: "донские", crest: "sun" }),
  club({ id: "rus-sochi", name: "Курортные синие", shortName: "Курортные", city: "Сочи", federationId: "RUS", reputation: 64, colors: ["#0077C8", "#FFFFFF"], vibe: "приморские", crest: "wave" }),
  club({ id: "rus-akron", name: "Волжские", shortName: "Волжские", city: "Тольятти", federationId: "RUS", reputation: 58, colors: ["#1B4F72", "#F4D03F"], vibe: "автоград", crest: "shield" }),
  club({ id: "rus-krylia", name: "Синекрылые", shortName: "Синекрылые", city: "Самара", federationId: "RUS", reputation: 66, colors: ["#00A3E0", "#FFFFFF"], vibe: "самарские", crest: "wing" }),
  club({ id: "rus-fakel", name: "Огонь", shortName: "Огонь", city: "Воронеж", federationId: "RUS", reputation: 57, colors: ["#E67E22", "#FFFFFF"], vibe: "воронежский огонь", crest: "flame" }),
  club({ id: "rus-orel", name: "Степные", shortName: "Степные", city: "Оренбург", federationId: "RUS", reputation: 56, colors: ["#1ABC9C", "#FFFFFF"], vibe: "уральские", crest: "sun" }),
  club({ id: "rus-pari", name: "Волжский берег", shortName: "Берег", city: "Нижний Новгород", federationId: "RUS", reputation: 60, colors: ["#16A085", "#FFFFFF"], vibe: "нижегородские", crest: "diamond" }),
  club({ id: "rus-baltika", name: "Янтарные", shortName: "Янтарные", city: "Калининград", federationId: "RUS", reputation: 59, colors: ["#2980B9", "#FFFFFF"], vibe: "янтарный берег", crest: "wave" }),
  club({ id: "rus-akhmat", name: "Грозненские зелёные", shortName: "Зелёные", city: "Грозный", federationId: "RUS", reputation: 65, colors: ["#27AE60", "#FFFFFF"], vibe: "кавказские", crest: "shield" }),

  // EPL 20
  club({ id: "eng-reds", name: "Красные дьяволы", shortName: "Дьяволы", city: "Манчестер", federationId: "ENG", stadium: "Театр Мечты*", reputation: 94, colors: ["#DA291C", "#FFFFFF"], vibe: "театр мечты", crest: "devil" }),
  club({ id: "eng-sky", name: "Горожане", shortName: "Горожане", city: "Манчестер", federationId: "ENG", stadium: "Этихад*", reputation: 96, colors: ["#6CABDD", "#FFFFFF"], vibe: "сити-голубые", crest: "eagle" }),
  club({ id: "eng-pool", name: "Красные с Энфилда", shortName: "Энфилд", city: "Ливерпуль", federationId: "ENG", stadium: "Энфилд*", reputation: 93, colors: ["#C8102E", "#FFFFFF"], vibe: "you'll never walk alone", crest: "bird" }),
  club({ id: "eng-blues", name: "Лондонские синие", shortName: "Синие", city: "Лондон", federationId: "ENG", stadium: "Стэмфорд*", reputation: 90, colors: ["#034694", "#FFFFFF"], vibe: "западный Лондон", crest: "lion" }),
  club({ id: "eng-gunners", name: "Канониры", shortName: "Канониры", city: "Лондон", federationId: "ENG", stadium: "Эмирейтс*", reputation: 91, colors: ["#EF0107", "#FFFFFF"], vibe: "северный Лондон", crest: "cannon" }),
  club({ id: "eng-spurs", name: "Шпоры", shortName: "Шпоры", city: "Лондон", federationId: "ENG", stadium: "Тоттенхэм*", reputation: 86, colors: ["#132257", "#FFFFFF"], vibe: "северный Лондон", crest: "cockerel" }),
  club({ id: "eng-west", name: "Молотобойцы", shortName: "Молоты", city: "Лондон", federationId: "ENG", reputation: 78, colors: ["#7A263A", "#1BB1E7"], vibe: "ист-энд", crest: "hammers" }),
  club({ id: "eng-newcastle", name: "Сороки", shortName: "Сороки", city: "Ньюкасл", federationId: "ENG", reputation: 84, colors: ["#241F20", "#FFFFFF"], vibe: "тоон", crest: "magpie" }),
  club({ id: "eng-villa", name: "Львы виллы", shortName: "Львы", city: "Бирмингем", federationId: "ENG", reputation: 82, colors: ["#670E36", "#95BFE5"], vibe: "бирмингемские", crest: "lion" }),
  club({ id: "eng-brighton", name: "Чайки", shortName: "Чайки", city: "Брайтон", federationId: "ENG", reputation: 79, colors: ["#0057B8", "#FFFFFF"], vibe: "южное побережье", crest: "gull" }),
  club({ id: "eng-palace", name: "Дворцовые орлы", shortName: "Орлы", city: "Лондон", federationId: "ENG", reputation: 76, colors: ["#1B458F", "#C4122E"], vibe: "селухёрст", crest: "eagle" }),
  club({ id: "eng-wolves", name: "Волки", shortName: "Волки", city: "Вулверхэмптон", federationId: "ENG", reputation: 77, colors: ["#FDB913", "#231F20"], vibe: "чёрно-золотые", crest: "wolf" }),
  club({ id: "eng-fulham", name: "Коттеджеры", shortName: "Коттедж", city: "Лондон", federationId: "ENG", reputation: 75, colors: ["#000000", "#FFFFFF"], vibe: "набережная Темзы", crest: "shield" }),
  club({ id: "eng-brentford", name: "Пчёлы", shortName: "Пчёлы", city: "Лондон", federationId: "ENG", reputation: 74, colors: ["#E30613", "#FFFFFF"], vibe: "западный Лондон", crest: "bee" }),
  club({ id: "eng-forest", name: "Лесные", shortName: "Лес", city: "Ноттингем", federationId: "ENG", reputation: 73, colors: ["#DD0000", "#FFFFFF"], vibe: "ноттингемские", crest: "tree" }),
  club({ id: "eng-bournemouth", name: "Вишни", shortName: "Вишни", city: "Борнмут", federationId: "ENG", reputation: 72, colors: ["#DA291C", "#000000"], vibe: "южное побережье", crest: "cherry" }),
  club({ id: "eng-everton", name: "Ириски", shortName: "Ириски", city: "Ливерпуль", federationId: "ENG", reputation: 78, colors: ["#003399", "#FFFFFF"], vibe: "синий мерсисайд", crest: "tower" }),
  club({ id: "eng-palace2", name: "Лисы", shortName: "Лисы", city: "Лестер", federationId: "ENG", reputation: 74, colors: ["#003090", "#FDBE11"], vibe: "королевство", crest: "fox" }),
  club({ id: "eng-ipswich", name: "Трактористы", shortName: "Тракторы", city: "Ипсвич", federationId: "ENG", reputation: 68, colors: ["#0033A0", "#FFFFFF"], vibe: "суффолк", crest: "shield" }),
  club({ id: "eng-southampton", name: "Святые", shortName: "Святые", city: "Саутгемптон", federationId: "ENG", reputation: 70, colors: ["#D71920", "#FFFFFF"], vibe: "южное побережье", crest: "halo" }),

  // La Liga 20
  club({ id: "esp-madrid", name: "Сливочные", shortName: "Сливочные", city: "Мадрид", federationId: "ESP", stadium: "Бернабеу*", reputation: 97, colors: ["#FFFFFF", "#00529F"], vibe: "королевские белые", crest: "crown" }),
  club({ id: "esp-barca", name: "Сине-гранатовые", shortName: "Блауграна", city: "Барселона", federationId: "ESP", stadium: "Камп Ноу*", reputation: 95, colors: ["#A50044", "#004D98"], vibe: "каталонские", crest: "cross" }),
  club({ id: "esp-atletico", name: "Матрасники", shortName: "Матрасники", city: "Мадрид", federationId: "ESP", stadium: "Метрополитано*", reputation: 90, colors: ["#CB3524", "#FFFFFF"], vibe: "красно-белые", crest: "bear" }),
  club({ id: "esp-sevilla", name: "Нервионцы", shortName: "Нервион", city: "Севилья", federationId: "ESP", stadium: "Пицхуан*", reputation: 82, colors: ["#D4A017", "#FFFFFF"], vibe: "андалузские", crest: "ball" }),
  club({ id: "esp-sociedad", name: "Тхаури", shortName: "Тхаури", city: "Сан-Себастьян", federationId: "ESP", reputation: 83, colors: ["#0067B1", "#FFFFFF"], vibe: "баскские", crest: "flag" }),
  club({ id: "esp-bilbao", name: "Львы", shortName: "Львы", city: "Бильбао", federationId: "ESP", reputation: 81, colors: ["#EE2523", "#FFFFFF"], vibe: "баскские", crest: "lion" }),
  club({ id: "esp-villarreal", name: "Жёлтая субмарина", shortName: "Субмарина", city: "Вильярреаль", federationId: "ESP", reputation: 80, colors: ["#FFE014", "#005187"], vibe: "кастельон", crest: "sub" }),
  club({ id: "esp-betis", name: "Зелёно-белые", shortName: "Зел.-бел.", city: "Севилья", federationId: "ESP", reputation: 79, colors: ["#0BB363", "#FFFFFF"], vibe: "севильские", crest: "diamond" }),
  club({ id: "esp-valencia", name: "Летучие мыши", shortName: "Мыши", city: "Валенсия", federationId: "ESP", reputation: 80, colors: ["#EE3524", "#FFFFFF"], vibe: "месталья", crest: "bat" }),
  club({ id: "esp-athletic2", name: "Гиронцы", shortName: "Гиронцы", city: "Жирона", federationId: "ESP", reputation: 76, colors: ["#CD2534", "#FFFFFF"], vibe: "каталонские", crest: "shield" }),
  club({ id: "esp-osasuna", name: "Рохильос", shortName: "Рохильос", city: "Памплона", federationId: "ESP", reputation: 72, colors: ["#0A3B6C", "#D50032"], vibe: "наваррские", crest: "oak" }),
  club({ id: "esp-mallorca", name: "Островные", shortName: "Островные", city: "Пальма", federationId: "ESP", reputation: 71, colors: ["#E20613", "#000000"], vibe: "балеарские", crest: "bat" }),
  club({ id: "esp-getafe", name: "Азулонес", shortName: "Азулонес", city: "Хетафе", federationId: "ESP", reputation: 70, colors: ["#0055A5", "#FFFFFF"], vibe: "южный Мадрид", crest: "shield" }),
  club({ id: "esp-celta", name: "Небесно-голубые", shortName: "Небесные", city: "Виго", federationId: "ESP", reputation: 73, colors: ["#8AC3E8", "#FFFFFF"], vibe: "галисийские", crest: "cross" }),
  club({ id: "esp-rayo", name: "Молния", shortName: "Молния", city: "Мадрид", federationId: "ESP", reputation: 69, colors: ["#E20613", "#FFFFFF"], vibe: "вальекас", crest: "bolt" }),
  club({ id: "esp-laspalmas", name: "Канарские", shortName: "Канарские", city: "Лас-Пальмас", federationId: "ESP", reputation: 68, colors: ["#FFE014", "#0057B8"], vibe: "жёлтые", crest: "palm" }),
  club({ id: "esp-alaves", name: "Бабазоррос", shortName: "Бабазоррос", city: "Витория", federationId: "ESP", reputation: 67, colors: ["#004B9B", "#FFFFFF"], vibe: "баскские", crest: "shield" }),
  club({ id: "esp-espanyol", name: "Попугаи", shortName: "Попугаи", city: "Барселона", federationId: "ESP", reputation: 72, colors: ["#1B449C", "#FFFFFF"], vibe: "барселонские", crest: "parrot" }),
  club({ id: "esp-valladolid", name: "Фиолетовые", shortName: "Пучилас", city: "Вальядолид", federationId: "ESP", reputation: 66, colors: ["#6C1D45", "#FFFFFF"], vibe: "кастильские", crest: "shield" }),
  club({ id: "esp-leganes", name: "Огурцы", shortName: "Огурцы", city: "Леганес", federationId: "ESP", reputation: 65, colors: ["#FFFFFF", "#0072BC"], vibe: "мадридские", crest: "pepper" }),

  // Bundesliga 18
  club({ id: "ger-bavaria", name: "Рекордмайстер", shortName: "Рекордм.", city: "Мюнхен", federationId: "GER", stadium: "Альянц*", reputation: 96, colors: ["#DC052D", "#FFFFFF"], vibe: "баварские", crest: "diamond" }),
  club({ id: "ger-dortmund", name: "Жёлто-чёрная стена", shortName: "Стена", city: "Дортмунд", federationId: "GER", stadium: "Сигнал Идуна*", reputation: 90, colors: ["#FDE100", "#000000"], vibe: "чёрно-жёлтые", crest: "ball" }),
  club({ id: "ger-leverkusen", name: "Аптекари", shortName: "Аптекари", city: "Леверкузен", federationId: "GER", stadium: "БайАрена*", reputation: 88, colors: ["#E32221", "#000000"], vibe: "аспириновые", crest: "cross" }),
  club({ id: "ger-leipzig", name: "Красные быки", shortName: "Быки", city: "Лейпциг", federationId: "GER", stadium: "Ред Булл*", reputation: 85, colors: ["#0A2240", "#DD074F"], vibe: "саксонские", crest: "bull" }),
  club({ id: "ger-frankfurt", name: "Орлы", shortName: "Орлы", city: "Франкфурт", federationId: "GER", reputation: 80, colors: ["#E1000F", "#000000"], vibe: "майнские", crest: "eagle" }),
  club({ id: "ger-freiburg", name: "Брайзгау", shortName: "Брайзгау", city: "Фрайбург", federationId: "GER", reputation: 76, colors: ["#000000", "#FFFFFF"], vibe: "шварцвальд", crest: "shield" }),
  club({ id: "ger-wolfsburg", name: "Волки", shortName: "Волки", city: "Вольфсбург", federationId: "GER", reputation: 77, colors: ["#65B32E", "#FFFFFF"], vibe: "нижняя Саксония", crest: "wolf" }),
  club({ id: "ger-gladbach", name: "Жеребцы", shortName: "Жеребцы", city: "Мёнхенгладбах", federationId: "GER", reputation: 78, colors: ["#000000", "#FFFFFF"], vibe: "рейнские", crest: "foal" }),
  club({ id: "ger-stuttgart", name: "Швабы", shortName: "Швабы", city: "Штутгарт", federationId: "GER", reputation: 79, colors: ["#E32219", "#FFFFFF"], vibe: "красно-белые", crest: "deer" }),
  club({ id: "ger-hoffenheim", name: "Хоффа", shortName: "Хоффа", city: "Зинсхайм", federationId: "GER", reputation: 74, colors: ["#1C63B7", "#FFFFFF"], vibe: "деревня на карте", crest: "shield" }),
  club({ id: "ger-bremen", name: "Зелёно-белые", shortName: "Зел.-бел.", city: "Бремен", federationId: "GER", reputation: 73, colors: ["#1A472A", "#FFFFFF"], vibe: "ганзейские", crest: "diamond" }),
  club({ id: "ger-augsburg", name: "Аугсбуржцы", shortName: "Шваб.южн.", city: "Аугсбург", federationId: "GER", reputation: 70, colors: ["#BA3733", "#006634"], vibe: "красно-зелёные", crest: "shield" }),
  club({ id: "ger-mainz", name: "Карета", shortName: "Карета", city: "Майнц", federationId: "GER", reputation: 71, colors: ["#C3102E", "#FFFFFF"], vibe: "рейнские", crest: "wheel" }),
  club({ id: "ger-union", name: "Айзерне", shortName: "Айзерне", city: "Берлин", federationId: "GER", reputation: 75, colors: ["#EB1923", "#FEFEFE"], vibe: "кёпеник", crest: "shield" }),
  club({ id: "ger-bochum", name: "Немуццы", shortName: "Немуццы", city: "Бохум", federationId: "GER", reputation: 68, colors: ["#005CA9", "#FFFFFF"], vibe: "рурские", crest: "shield" }),
  club({ id: "ger-heidenheim", name: "Хайден", shortName: "Хайден", city: "Хайденхайм", federationId: "GER", reputation: 67, colors: ["#E30613", "#0057A8"], vibe: "швабские", crest: "shield" }),
  club({ id: "ger-kiel", name: "Аисты", shortName: "Аисты", city: "Киль", federationId: "GER", reputation: 66, colors: ["#005CA9", "#FFFFFF"], vibe: "балтийские", crest: "stork" }),
  club({ id: "ger-stpauli", name: "Пираты", shortName: "Пираты", city: "Гамбург", federationId: "GER", reputation: 69, colors: ["#4C2E2B", "#FFFFFF"], vibe: "санкт-паули", crest: "skull" }),

  // Serie A 20
  club({ id: "ita-inter", name: "Нерадзурри", shortName: "Нерадзурри", city: "Милан", federationId: "ITA", stadium: "Сан Сиро*", reputation: 91, colors: ["#010E80", "#000000"], vibe: "чёрно-синие", crest: "snake" }),
  club({ id: "ita-milan", name: "Россонери", shortName: "Россонери", city: "Милан", federationId: "ITA", stadium: "Сан Сиро*", reputation: 90, colors: ["#FB090B", "#000000"], vibe: "красно-чёрные", crest: "cross" }),
  club({ id: "ita-juve", name: "Старая синьора", shortName: "Синьора", city: "Турин", federationId: "ITA", stadium: "Альянц Стадиум*", reputation: 92, colors: ["#000000", "#FFFFFF"], vibe: "зебры", crest: "zebra" }),
  club({ id: "ita-napoli", name: "Партенопеи", shortName: "Партенопеи", city: "Неаполь", federationId: "ITA", stadium: "Марадона*", reputation: 89, colors: ["#12A0D7", "#FFFFFF"], vibe: "азурри", crest: "horse" }),
  club({ id: "ita-roma", name: "Волчица", shortName: "Волчица", city: "Рим", federationId: "ITA", reputation: 86, colors: ["#8E1F2F", "#F0BC42"], vibe: "джаллоросси", crest: "wolf" }),
  club({ id: "ita-lazio", name: "Орлы", shortName: "Орлы", city: "Рим", federationId: "ITA", reputation: 82, colors: ["#87D8F7", "#FFFFFF"], vibe: "бьянкочелэсти", crest: "eagle" }),
  club({ id: "ita-fiorentina", name: "Фиалки", shortName: "Фиалки", city: "Флоренция", federationId: "ITA", reputation: 80, colors: ["#482E92", "#FFFFFF"], vibe: "тосканские", crest: "lily" }),
  club({ id: "ita-atalanta", name: "Богиня", shortName: "Богиня", city: "Бергамо", federationId: "ITA", reputation: 85, colors: ["#1E71B8", "#000000"], vibe: "бергамские", crest: "goddess" }),
  club({ id: "ita-bologna", name: "Россоблу", shortName: "Россоблу", city: "Болонья", federationId: "ITA", reputation: 78, colors: ["#A51A2E", "#1A2F6B"], vibe: "эмилианские", crest: "shield" }),
  club({ id: "ita-torino", name: "Быки", shortName: "Быки", city: "Турин", federationId: "ITA", reputation: 76, colors: ["#8B1A1A", "#FFFFFF"], vibe: "гранатовые", crest: "bull" }),
  club({ id: "ita-udinese", name: "Фриулы", shortName: "Фриулы", city: "Удине", federationId: "ITA", reputation: 72, colors: ["#000000", "#FFFFFF"], vibe: "чёрно-белые", crest: "zebra" }),
  club({ id: "ita-genoa", name: "Грифоны", shortName: "Грифоны", city: "Генуя", federationId: "ITA", reputation: 71, colors: ["#C8102E", "#0033A0"], vibe: "лигурийские", crest: "griffin" }),
  club({ id: "ita-cagliari", name: "Островные", shortName: "Сардинцы", city: "Кальяри", federationId: "ITA", reputation: 70, colors: ["#AE161C", "#1B3E8A"], vibe: "сардинские", crest: "shield" }),
  club({ id: "ita-empoli", name: "Эмполезцы", shortName: "Эмполезцы", city: "Эмполи", federationId: "ITA", reputation: 68, colors: ["#0055A4", "#FFFFFF"], vibe: "тосканские", crest: "shield" }),
  club({ id: "ita-monza", name: "Брианца", shortName: "Брианца", city: "Монца", federationId: "ITA", reputation: 69, colors: ["#E30613", "#FFFFFF"], vibe: "ломбардские", crest: "shield" }),
  club({ id: "ita-lecce", name: "Саленто", shortName: "Саленто", city: "Лечче", federationId: "ITA", reputation: 67, colors: ["#FFD100", "#E30613"], vibe: "жёлто-красные", crest: "shield" }),
  club({ id: "ita-verona", name: "Скалигеры", shortName: "Скалигеры", city: "Верона", federationId: "ITA", reputation: 70, colors: ["#FCE700", "#1B3E8A"], vibe: "джэллоблу", crest: "ladder" }),
  club({ id: "ita-parma", name: "Крестоносцы", shortName: "Крестоносцы", city: "Парма", federationId: "ITA", reputation: 71, colors: ["#FFFFFF", "#000000"], vibe: "эмилианские", crest: "cross" }),
  club({ id: "ita-como", name: "Лазурные", shortName: "Лазурные", city: "Комо", federationId: "ITA", reputation: 68, colors: ["#0033A0", "#FFFFFF"], vibe: "озеро Комо", crest: "wave" }),
  club({ id: "ita-venezia", name: "Лагуна", shortName: "Лагуна", city: "Венеция", federationId: "ITA", reputation: 66, colors: ["#F7941D", "#006633"], vibe: "оранжево-зелёные", crest: "wing" }),

  // Ligue 1 18
  club({ id: "fra-psg", name: "Парижане", shortName: "Парижане", city: "Париж", federationId: "FRA", stadium: "Парк де Пренс*", reputation: 94, colors: ["#004170", "#DA291C"], vibe: "иль-де-франс", crest: "eiffel" }),
  club({ id: "fra-marseille", name: "Фокейцы", shortName: "ОМ", city: "Марсель", federationId: "FRA", stadium: "Велодром*", reputation: 84, colors: ["#2FAEE0", "#FFFFFF"], vibe: "велодром", crest: "star" }),
  club({ id: "fra-lyon", name: "Роданские", shortName: "ОЛ", city: "Лион", federationId: "FRA", stadium: "Группама*", reputation: 80, colors: ["#FFFFFF", "#E5002C"], vibe: "львы Лиона", crest: "lion" }),
  club({ id: "fra-monaco", name: "Княжеские", shortName: "Княжеские", city: "Монако", federationId: "FRA", stadium: "Луи II*", reputation: 83, colors: ["#E20010", "#FFFFFF"], vibe: "красно-белые", crest: "crown" }),
  club({ id: "fra-lille", name: "Доги", shortName: "Доги", city: "Лилль", federationId: "FRA", reputation: 81, colors: ["#E01A22", "#FFFFFF"], vibe: "северяне", crest: "dog" }),
  club({ id: "fra-nice", name: "Ниццские орлы", shortName: "Орлы Юга", city: "Ницца", federationId: "FRA", reputation: 78, colors: ["#000000", "#E30613"], vibe: "лазурный берег", crest: "eagle" }),
  club({ id: "fra-rennes", name: "Бретонцы", shortName: "Бретонцы", city: "Ренн", federationId: "FRA", reputation: 77, colors: ["#E30613", "#000000"], vibe: "красно-чёрные", crest: "ermine" }),
  club({ id: "fra-lens", name: "Кроваво-золотые", shortName: "Горняки", city: "Ланс", federationId: "FRA", reputation: 79, colors: ["#E30613", "#F7C511"], vibe: "горняки", crest: "shield" }),
  club({ id: "fra-strasbourg", name: "Рейнские", shortName: "Рейн", city: "Страсбург", federationId: "FRA", reputation: 74, colors: ["#009FE3", "#FFFFFF"], vibe: "эльзасские", crest: "wave" }),
  club({ id: "fra-nantes", name: "Канарейки", shortName: "Канарейки", city: "Нант", federationId: "FRA", reputation: 73, colors: ["#FFE014", "#006633"], vibe: "атлантические", crest: "boat" }),
  club({ id: "fra-reims", name: "Реймсские", shortName: "Шампань", city: "Реймс", federationId: "FRA", reputation: 72, colors: ["#E30613", "#FFFFFF"], vibe: "шампанские", crest: "shield" }),
  club({ id: "fra-toulouse", name: "Тулузские фиолетовые", shortName: "Фиолет.", city: "Тулуза", federationId: "FRA", reputation: 71, colors: ["#5A2D81", "#FFFFFF"], vibe: "окситанские", crest: "shield" }),
  club({ id: "fra-brest", name: "Брестские пираты", shortName: "Пираты", city: "Брест", federationId: "FRA", reputation: 74, colors: ["#E30613", "#FFFFFF"], vibe: "бретонские", crest: "anchor" }),
  club({ id: "fra-auxerre", name: "Бургундцы", shortName: "Бургундцы", city: "Осер", federationId: "FRA", reputation: 69, colors: ["#FFFFFF", "#0055A4"], vibe: "бело-синие", crest: "shield" }),
  club({ id: "fra-angers", name: "Чёрно-белые", shortName: "Чёрн.-бел.", city: "Анже", federationId: "FRA", reputation: 68, colors: ["#000000", "#FFFFFF"], vibe: "луарские", crest: "shield" }),
  club({ id: "fra-lehavre", name: "Небесные", shortName: "Небесные", city: "Гавр", federationId: "FRA", reputation: 67, colors: ["#79C3E8", "#FFFFFF"], vibe: "нормандские", crest: "wave" }),
  club({ id: "fra-saintet", name: "Зелёные", shortName: "Зелёные", city: "Сент-Этьен", federationId: "FRA", reputation: 72, colors: ["#00843D", "#FFFFFF"], vibe: "форест", crest: "shield" }),
  club({ id: "fra-montpellier", name: "Оранжевые", shortName: "Оранжевые", city: "Монпелье", federationId: "FRA", reputation: 70, colors: ["#F7941D", "#0033A0"], vibe: "лангедок", crest: "shield" }),

  // --- Euro guest pool (no playable league; rotate into UCL/UEL by season) ---
  // Names = fan slang only (no real club brands in name/shortName).
  // Portugal
  club({ id: "por-eagles", name: "Орлы Лиссабона", shortName: "Орлы", city: "Лиссабон", federationId: "POR", reputation: 86, colors: ["#E30613", "#FFFFFF"], vibe: "агуйаш", crest: "eagle", guest: true }),
  club({ id: "por-dragons", name: "Драконы Порту", shortName: "Драконы", city: "Порту", federationId: "POR", reputation: 85, colors: ["#0033A0", "#FFFFFF"], vibe: "драгойнш", crest: "dragon", guest: true }),
  club({ id: "por-lions", name: "Львы Алваладе", shortName: "Львы", city: "Лиссабон", federationId: "POR", reputation: 83, colors: ["#008057", "#FFFFFF"], vibe: "леойш", crest: "lion", guest: true }),
  club({ id: "por-archbishops", name: "Архиепископы", shortName: "Архиеп.", city: "Брага", federationId: "POR", reputation: 78, colors: ["#E30613", "#FFFFFF"], vibe: "архиепископы Миньо", crest: "shield", guest: true }),
  // Netherlands
  club({ id: "ned-ajax", name: "Божественные", shortName: "Божеств.", city: "Амстердам", federationId: "NED", reputation: 84, colors: ["#FFFFFF", "#C8102E"], vibe: "годензонен", crest: "ball", guest: true }),
  club({ id: "ned-farmers", name: "Фермеры", shortName: "Фермеры", city: "Эйндховен", federationId: "NED", reputation: 83, colors: ["#E30613", "#FFFFFF"], vibe: "бурен", crest: "shield", guest: true }),
  club({ id: "ned-cupe", name: "Купе", shortName: "Купе", city: "Роттердам", federationId: "NED", reputation: 81, colors: ["#E30613", "#FFFFFF"], vibe: "народ с Куйпа", crest: "ball", guest: true }),
  club({ id: "ned-cheese", name: "Сыры", shortName: "Сыры", city: "Алкмар", federationId: "NED", reputation: 76, colors: ["#E30613", "#FFFFFF"], vibe: "кааскопы", crest: "shield", guest: true }),
  // Belgium
  club({ id: "bel-blugge", name: "Чёрно-синие", shortName: "Чёрн.-син.", city: "Брюгге", federationId: "BEL", reputation: 80, colors: ["#0033A0", "#000000"], vibe: "блаув-зварт", crest: "shield", guest: true }),
  club({ id: "bel-violet", name: "Фиолетовые", shortName: "Фиолет.", city: "Брюссель", federationId: "BEL", reputation: 77, colors: ["#5A2D81", "#FFFFFF"], vibe: "паарс-вит", crest: "shield", guest: true }),
  club({ id: "bel-union", name: "Юнионисты", shortName: "Юнионисты", city: "Брюссель", federationId: "BEL", reputation: 78, colors: ["#FFD100", "#0033A0"], vibe: "сен-жильские", crest: "shield", guest: true }),
  // Turkey
  club({ id: "tur-lions", name: "Львы Стамбула", shortName: "Львы", city: "Стамбул", federationId: "TUR", reputation: 82, colors: ["#E30613", "#FFD100"], vibe: "асланлар", crest: "lion", guest: true }),
  club({ id: "tur-yellow", name: "Жёлтые канарейки", shortName: "Канарейки", city: "Стамбул", federationId: "TUR", reputation: 81, colors: ["#FFE014", "#00205B"], vibe: "сары канарьялар", crest: "shield", guest: true }),
  club({ id: "tur-beo", name: "Чёрные орлы", shortName: "Орлы", city: "Стамбул", federationId: "TUR", reputation: 79, colors: ["#000000", "#FFFFFF"], vibe: "кара карталлар", crest: "eagle", guest: true }),
  club({ id: "tur-bordo", name: "Бордово-синие", shortName: "Бордо-син.", city: "Трабзон", federationId: "TUR", reputation: 76, colors: ["#6B0F2B", "#0033A0"], vibe: "карадениз", crest: "shield", guest: true }),
  // Austria
  club({ id: "aut-bulls", name: "Зальцбургские быки", shortName: "Быки", city: "Зальцбург", federationId: "AUT", reputation: 82, colors: ["#E30613", "#FFFFFF"], vibe: "буллен", crest: "bull", guest: true }),
  club({ id: "aut-sturm", name: "Чёрные Штирии", shortName: "Штирия", city: "Грац", federationId: "AUT", reputation: 74, colors: ["#000000", "#FFFFFF"], vibe: "шварце", crest: "shield", guest: true }),
  club({ id: "aut-rapid", name: "Зелёно-белые Вены", shortName: "Зел.-бел.", city: "Вена", federationId: "AUT", reputation: 75, colors: ["#008057", "#FFFFFF"], vibe: "грюн-вайс", crest: "shield", guest: true }),
  // Scotland
  club({ id: "sco-celtic", name: "Обручи", shortName: "Обручи", city: "Глазго", federationId: "SCO", reputation: 81, colors: ["#008057", "#FFFFFF"], vibe: "бойз", crest: "clover", guest: true }),
  club({ id: "sco-rangers", name: "Синие медведи", shortName: "Медведи", city: "Глазго", federationId: "SCO", reputation: 80, colors: ["#0033A0", "#FFFFFF"], vibe: "тедди бэарс", crest: "ball", guest: true }),
  club({ id: "sco-hearts", name: "Джемовые пироги", shortName: "Джемы", city: "Эдинбург", federationId: "SCO", reputation: 72, colors: ["#7A003C", "#FFFFFF"], vibe: "джем тартс", crest: "heart", guest: true }),
  // Czechia
  club({ id: "cze-sparta", name: "Железные", shortName: "Железные", city: "Прага", federationId: "CZE", reputation: 77, colors: ["#E30613", "#FFFFFF"], vibe: "железная гвардия", crest: "shield", guest: true }),
  club({ id: "cze-slavia", name: "Сшитые", shortName: "Сшитые", city: "Прага", federationId: "CZE", reputation: 78, colors: ["#E30613", "#FFFFFF"], vibe: "сешивани", crest: "shield", guest: true }),
  club({ id: "cze-plzen", name: "Пивовары", shortName: "Пивовары", city: "Пльзень", federationId: "CZE", reputation: 75, colors: ["#E30613", "#0033A0"], vibe: "пильзеньские", crest: "shield", guest: true }),
  // Greece
  club({ id: "gre-olymp", name: "Легенда Пирея", shortName: "Легенда", city: "Пирей", federationId: "GRE", reputation: 79, colors: ["#E30613", "#FFFFFF"], vibe: "трилос", crest: "laurel", guest: true }),
  club({ id: "gre-paok", name: "Двуглавые", shortName: "Двуглавые", city: "Салоники", federationId: "GRE", reputation: 76, colors: ["#000000", "#FFFFFF"], vibe: "дикефалос", crest: "eagle", guest: true }),
  club({ id: "gre-aek", name: "Жёлто-чёрные Афин", shortName: "Жёлт.-чёрн.", city: "Афины", federationId: "GRE", reputation: 74, colors: ["#FFD100", "#000000"], vibe: "китриномаври", crest: "shield", guest: true }),
  // Switzerland
  club({ id: "sui-yb", name: "Жёлто-чёрные Берна", shortName: "Жёлт.-чёрн.", city: "Берн", federationId: "SUI", reputation: 77, colors: ["#FFD100", "#000000"], vibe: "юнге", crest: "bull", guest: true }),
  club({ id: "sui-basel", name: "Бебби", shortName: "Бебби", city: "Базель", federationId: "SUI", reputation: 75, colors: ["#E30613", "#0033A0"], vibe: "бебби", crest: "shield", guest: true }),
  club({ id: "sui-lugano", name: "Чёрно-белые Тичино", shortName: "Тичино", city: "Лугано", federationId: "SUI", reputation: 72, colors: ["#000000", "#FFFFFF"], vibe: "бьянконери", crest: "shield", guest: true }),
  // Denmark
  club({ id: "den-lions", name: "Львы Копенгагена", shortName: "Львы", city: "Копенгаген", federationId: "DEN", reputation: 78, colors: ["#FFFFFF", "#0033A0"], vibe: "лёверне", crest: "lion", guest: true }),
  club({ id: "den-wolves", name: "Волки Ютландии", shortName: "Волки", city: "Хернинг", federationId: "DEN", reputation: 76, colors: ["#000000", "#FFFFFF"], vibe: "ульвене", crest: "wolf", guest: true }),
  club({ id: "den-yellow", name: "Жёлтые пригорода", shortName: "Жёлтые", city: "Брённбю", federationId: "DEN", reputation: 73, colors: ["#FFD100", "#0033A0"], vibe: "гуле", crest: "shield", guest: true }),
  // Croatia
  club({ id: "cro-modra", name: "Модра", shortName: "Модра", city: "Загреб", federationId: "CRO", reputation: 77, colors: ["#0033A0", "#FFFFFF"], vibe: "модри", crest: "shield", guest: true }),
  club({ id: "cro-hajduk", name: "Белые Сплита", shortName: "Белые", city: "Сплит", federationId: "CRO", reputation: 74, colors: ["#FFFFFF", "#0033A0"], vibe: "били", crest: "shield", guest: true }),
  // Ukraine
  club({ id: "ukr-miners", name: "Горняки Донбасса", shortName: "Горняки", city: "Донецк", federationId: "UKR", reputation: 80, colors: ["#FF6600", "#000000"], vibe: "гірники", crest: "pickaxe", guest: true }),
  club({ id: "ukr-kyiv", name: "Бело-синие Киева", shortName: "Бел.-син.", city: "Киев", federationId: "UKR", reputation: 79, colors: ["#FFFFFF", "#0033A0"], vibe: "біло-сині", crest: "shield", guest: true }),
  // Serbia
  club({ id: "srb-zvezda", name: "Делие", shortName: "Делие", city: "Белград", federationId: "SRB", reputation: 78, colors: ["#E30613", "#FFFFFF"], vibe: "црвено-бели", crest: "star", guest: true }),
  club({ id: "srb-partizan", name: "Гробари", shortName: "Гробари", city: "Белград", federationId: "SRB", reputation: 76, colors: ["#000000", "#FFFFFF"], vibe: "гробари", crest: "shield", guest: true }),
  // Norway
  club({ id: "nor-glimt", name: "Северное сияние", shortName: "Сияние", city: "Будё", federationId: "NOR", reputation: 75, colors: ["#FFD100", "#000000"], vibe: "жёлтые севера", crest: "sun", guest: true }),
  club({ id: "nor-molde", name: "Фиорды", shortName: "Фиорды", city: "Мольде", federationId: "NOR", reputation: 73, colors: ["#0033A0", "#FFFFFF"], vibe: "фьорды", crest: "wave", guest: true }),

];

const leagues = [
  { id: "rpl", name: "Российская Премьер-лига", federationId: "RUS", tier: 1, size: 16, prefix: "rus-" },
  { id: "epl", name: "Английская Премьер-лига", federationId: "ENG", tier: 1, size: 20, prefix: "eng-" },
  { id: "laliga", name: "Ла Лига", federationId: "ESP", tier: 1, size: 20, prefix: "esp-" },
  { id: "bundesliga", name: "Бундеслига", federationId: "GER", tier: 1, size: 18, prefix: "ger-" },
  { id: "seriea", name: "Серия А", federationId: "ITA", tier: 1, size: 20, prefix: "ita-" },
  { id: "ligue1", name: "Лига 1", federationId: "FRA", tier: 1, size: 18, prefix: "fra-" },
];

const pack = {
  version: "0.3.0",
  season: "2025/26",
  federations: [
    { id: "RUS", name: "Россия", confederation: "UEFA", coefficient: 22.5 },
    { id: "ENG", name: "Англия", confederation: "UEFA", coefficient: 94.0 },
    { id: "ESP", name: "Испания", confederation: "UEFA", coefficient: 88.0 },
    { id: "GER", name: "Германия", confederation: "UEFA", coefficient: 84.0 },
    { id: "ITA", name: "Италия", confederation: "UEFA", coefficient: 86.0 },
    { id: "FRA", name: "Франция", confederation: "UEFA", coefficient: 72.0 },
    { id: "POR", name: "Португалия", confederation: "UEFA", coefficient: 56.0 },
    { id: "NED", name: "Нидерланды", confederation: "UEFA", coefficient: 54.0 },
    { id: "BEL", name: "Бельгия", confederation: "UEFA", coefficient: 48.0 },
    { id: "TUR", name: "Турция", confederation: "UEFA", coefficient: 38.0 },
    { id: "AUT", name: "Австрия", confederation: "UEFA", coefficient: 34.0 },
    { id: "SCO", name: "Шотландия", confederation: "UEFA", coefficient: 32.0 },
    { id: "CZE", name: "Чехия", confederation: "UEFA", coefficient: 30.0 },
    { id: "GRE", name: "Греция", confederation: "UEFA", coefficient: 28.0 },
    { id: "SUI", name: "Швейцария", confederation: "UEFA", coefficient: 31.0 },
    { id: "DEN", name: "Дания", confederation: "UEFA", coefficient: 29.0 },
    { id: "CRO", name: "Хорватия", confederation: "UEFA", coefficient: 26.0 },
    { id: "UKR", name: "Украина", confederation: "UEFA", coefficient: 27.0 },
    { id: "SRB", name: "Сербия", confederation: "UEFA", coefficient: 25.0 },
    { id: "NOR", name: "Норвегия", confederation: "UEFA", coefficient: 24.0 },
  ],
  continentalAccess: [
    {
      federationId: "RUS",
      confederation: "UEFA",
      allowed: false,
      range: { fromSeason: "2022/23", toSeason: "2024/25" },
      note: "Suspension through 2024/25",
    },
    {
      federationId: "RUS",
      confederation: "UEFA",
      allowed: true,
      range: { fromSeason: "2025/26", toSeason: null },
      note: "Reinstated — Russian clubs return to UEFA competitions",
    },
  ],
  tournaments: [
    {
      id: "ucl",
      kind: "continental",
      name: "Лига чемпионов",
      confederation: "UEFA",
      fromSeason: "2024/25",
      slotsByFederation: {
        ENG: 3, ESP: 3, GER: 3, ITA: 3, FRA: 2, RUS: 2,
        POR: 1, NED: 1, BEL: 1, TUR: 1, AUT: 1, SCO: 1, CZE: 1, UKR: 1,
      },
    },
    {
      id: "uel",
      kind: "continental",
      name: "Лига Европы",
      confederation: "UEFA",
      fromSeason: "2024/25",
      slotsByFederation: {
        ENG: 2, ESP: 2, GER: 2, ITA: 2, FRA: 2, RUS: 1,
        POR: 1, NED: 1, BEL: 1, TUR: 1, GRE: 1, SUI: 1, DEN: 1, CRO: 1, SRB: 1, NOR: 1,
      },
    },
    {
      id: "uecl",
      kind: "continental",
      name: "Лига конференций",
      confederation: "UEFA",
      fromSeason: "2024/25",
      slotsByFederation: { FRA: 1, RUS: 1, AUT: 1, SCO: 1, NOR: 1, SUI: 1 },
    },
  ],
  clubs,
  leagues: leagues.map((l) => {
    const clubIds = clubs.filter((c) => c.id.startsWith(l.prefix)).map((c) => c.id);
    const unique = [...new Set(clubIds)];
    if (unique.length !== clubIds.length) {
      const dups = clubIds.filter((id, i) => clubIds.indexOf(id) !== i);
      throw new Error(`${l.id}: duplicate clubIds ${[...new Set(dups)].join(", ")}`);
    }
    if (clubIds.length !== l.size) {
      throw new Error(`${l.id}: expected ${l.size}, got ${clubIds.length}`);
    }
    return {
      id: l.id,
      name: l.name,
      federationId: l.federationId,
      tier: l.tier,
      teamCount: l.size,
      clubIds,
    };
  }),
};

const seenClubIds = new Set();
for (const c of clubs) {
  if (seenClubIds.has(c.id)) throw new Error(`Duplicate club id: ${c.id}`);
  seenClubIds.add(c.id);
}

const out1 = join(root, "data/world/pack.v1.json");
const out2 = join(root, "apps/mobile/assets/world/pack.v1.json");
const json = JSON.stringify(pack, null, 2);
writeFileSync(out1, json);
writeFileSync(out2, json);
console.log(`Wrote ${clubs.length} clubs → ${out1}`);
