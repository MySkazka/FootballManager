import type {
  Club,
  Player,
  PlayerAttributes,
  PlayerSeasonStats,
  PlayerTrait,
  Position,
  PreferredFoot,
  RoleId,
  WorldPack,
} from "./types";
import { computeOverall, roleToLine } from "./labels";
import { assignSquadPortraits, portraitIdForPlayer } from "./portraits";
import { Rng } from "./rng";

function roleFlankLocal(role: RoleId): "L" | "R" | "C" {
  if (["LB", "LWB", "LM", "LW"].includes(role)) return "L";
  if (["RB", "RWB", "RM", "RW"].includes(role)) return "R";
  return "C";
}

/** All name banks are Cyrillic (transliterated where needed). */
const FIRST: Record<string, string[]> = {
  RUS: [
    "Артём", "Даниил", "Илья", "Максим", "Кирилл", "Андрей", "Никита", "Роман", "Егор", "Павел",
    "Дмитрий", "Алексей", "Сергей", "Владимир", "Игорь", "Олег", "Виктор", "Юрий", "Денис", "Глеб",
    "Тимур", "Руслан", "Захар", "Матвей", "Лев", "Марк", "Фёдор", "Степан", "Арсений", "Константин",
    "Михаил", "Антон", "Валерий", "Георгий", "Борис", "Вячеслав", "Станислав", "Платон", "Савелий", "Родион",
    "Григорий", "Ярослав", "Семён", "Вадим", "Эдуард", "Аркадий", "Иннокентий", "Тимофей", "Всеволод", "Прохор",
  ],
  ENG: [
    "Джеймс", "Оливер", "Гарри", "Джордж", "Джек", "Чарли", "Томас", "Джейкоб", "Ноа", "Лео",
    "Оскар", "Генри", "Артур", "Фредди", "Арчи", "Тедди", "Алфи", "Финли", "Мейсон", "Лукас",
    "Итан", "Логан", "Джейми", "Каллум", "Райан", "Коннор", "Дилан", "Рис", "Харви", "Тоби",
    "Альфред", "Эдвард", "Уильям", "Бенджамин", "Сэмюэл", "Джозеф", "Майкл", "Дэниел", "Люк", "Адам",
    "Кайл", "Брэдли", "Найджел", "Тревор", "Гэри", "Шон", "Патрик", "Кристофер", "Эндрю", "Питер",
  ],
  ESP: [
    "Карлос", "Диего", "Пабло", "Альваро", "Уго", "Марио", "Иван", "Серхио", "Хавьер", "Лукас",
    "Мартин", "Адриан", "Даниэль", "Мигель", "Педро", "Рауль", "Алекс", "Николас", "Эктор", "Бруно",
    "Икер", "Унай", "Айтор", "Асьер", "Марк", "Пол", "Нил", "Ориоль", "Жерар", "Ферран",
    "Алехандро", "Фернандо", "Рикардо", "Мануэль", "Хосе", "Антонио", "Франсиско", "Давид", "Самуэль", "Исхак",
    "Габи", "Кике", "Борахна", "Иньиго", "Унай", "Хави", "Пепе", "Чичи", "Начо", "Серхи",
  ],
  GER: [
    "Леон", "Пауль", "Йонас", "Финн", "Лукас", "Никлас", "Тим", "Феликс", "Макс", "Ян",
    "Бен", "Ноа", "Эмиль", "Луис", "Элиас", "Генри", "Оскар", "Тео", "Матс", "Кай",
    "Юлиан", "Марио", "Свен", "Тимо", "Марко", "Флориан", "Нико", "Янник", "Фабиан", "Филипп",
    "Томас", "Штефан", "Андреас", "Кристоф", "Себастьян", "Тобиас", "Даниэль", "Мартин", "Петер", "Йенс",
    "Ларс", "Уве", "Ральф", "Хельмут", "Дирк", "Бернд", "Оливер", "Мирко", "Торстен", "Карстен",
  ],
  ITA: [
    "Марко", "Лука", "Андреа", "Матео", "Алессандро", "Франческо", "Лоренцо", "Джованни", "Давиде", "Симоне",
    "Риккардо", "Габриэле", "Томмазо", "Федерико", "Никола", "Стефано", "Антонио", "Джузеппе", "Сальваторе", "Паоло",
    "Эмануэле", "Даниеле", "Самуэле", "Пьетро", "Кристиан", "Мануэль", "Фабио", "Роберто", "Джакомо", "Филиппо",
    "Массимо", "Винченцо", "Доменико", "Луиджи", "Карло", "Энрико", "Маттео", "Никколо", "Леонардо", "Микеле",
    "Чиро", "Дженнаро", "Сальво", "Энцо", "Нунцио", "Раффаэле", "Алессио", "Дарио", "Гвидо", "Уго",
  ],
  FRA: [
    "Люка", "Юго", "Луи", "Габриэль", "Артур", "Жюль", "Итан", "Натан", "Адам", "Поль",
    "Лео", "Рафаэль", "Маэль", "Ноа", "Лиам", "Энцо", "Матис", "Тео", "Натаниэль", "Саша",
    "Килиан", "Янис", "Амин", "Райан", "Илан", "Ноам", "Максим", "Антуан", "Жюльен", "Клеман",
    "Пьер", "Николя", "Оливье", "Себастьен", "Тома", "Бенжамен", "Квентин", "Александр", "Виктор", "Эдуар",
    "Мехди", "Карим", "Исса", "Малик", "Усман", "Тибо", "Батист", "Ромен", "Флоран", "Жереми",
  ],
  BRA: [
    "Лукас", "Габриэл", "Матеус", "Рафаэл", "Бруно", "Фелипе", "Густаво", "Диего", "Андре", "Педро",
    "Винисиус", "Родриго", "Каземиро", "Маркиньос", "Ришарлисон", "Антони", "Эндерсон", "Алиссон", "Эдерсон", "Тиаго",
    "Данило", "Жоау", "Кайо", "Игор", "Веллингтон", "Роналдо", "Роберто", "Жуниор", "Эвертон", "Фабиньо",
  ],
  ARG: [
    "Лионель", "Анхель", "Серхио", "Пауло", "Хулиан", "Энцо", "Родриго", "Леандро", "Николас", "Эмилиано",
    "Гонсало", "Франко", "Алехандро", "Мауро", "Диего", "Хавьер", "Карлос", "Мартин", "Факундо", "Томас",
    "Хуан", "Лукас", "Матиас", "Эзекьель", "Рамиро", "Агустин", "Валентин", "Тиаго", "Бенхамин", "Санти",
  ],
  SRB: [
    "Никола", "Лука", "Марко", "Стефан", "Александар", "Душан", "Неманья", "Милош", "Филип", "Иван",
    "Дарко", "Предраг", "Зоран", "Драган", "Владимир", "Боян", "Саша", "Деян", "Горан", "Ненад",
  ],
  CRO: [
    "Лука", "Иван", "Марко", "Матео", "Анте", "Марио", "Домагой", "Йошко", "Борна", "Никола",
    "Тони", "Иво", "Дарио", "Звонимир", "Игор", "Стипе", "Бруно", "Кристиян", "Филип", "Яков",
  ],
  NED: [
    "Френки", "Маттейс", "Вирджил", "Мемфис", "Коди", "Донни", "Райан", "Дэйви", "Юрриен", "Стевен",
    "Уэсли", "Арьен", "Класс-Ян", "Робин", "Дали", "Ноа", "Ксави", "Йоррел", "Квинси", "Тим",
  ],
  POR: [
    "Криштиану", "Бернарду", "Рубен", "Жоау", "Диогу", "Бруну", "Рафаэл", "Пепе", "Нелсон", "Гонсалу",
    "Андре", "Рикарду", "Нуну", "Тиагу", "Вильям", "Эдер", "Рафа", "Матеуш", "Франсишку", "Педру",
  ],
  UKR: [
    "Андрей", "Александр", "Тарас", "Руслан", "Виталий", "Сергей", "Игорь", "Артём", "Денис", "Роман",
    "Евгений", "Максим", "Олег", "Богдан", "Михаил", "Владислав", "Юрий", "Павел", "Никита", "Даниил",
  ],
  BLR: [
    "Александр", "Дмитрий", "Сергей", "Андрей", "Иван", "Максим", "Никита", "Павел", "Артём", "Егор",
    "Владимир", "Денис", "Роман", "Кирилл", "Олег", "Виктор", "Игорь", "Станислав", "Глеб", "Тимофей",
  ],
  KAZ: [
    "Асхат", "Бахтияр", "Нурлан", "Еркебулан", "Айдын", "Марат", "Серик", "Даулет", "Алишер", "Тимур",
    "Азат", "Кайрат", "Бекзат", "Жандос", "Олжас", "Руслан", "Аслан", "Ерлан", "Нурсултан", "Бауржан",
  ],
  SEN: [
    "Садио", "Калиду", "Идрисса", "Эдуар", "Исмаила", "Бакари", "Папе", "Шейх", "Никола", "Абдулай",
    "Мамаду", "Усман", "Алиу", "Шейху", "Диалло", "Фаделе", "Ламин", "Ибрагима", "Мохамед", "Амаду",
  ],
  NGA: [
    "Виктор", "Алекс", "Уилфред", "Келес", "Сэмюэл", "Адемола", "Тайво", "Оджон", "Джозеф", "Мозес",
    "Нванкво", "Джон", "Эммануэль", "Чиди", "Оби", "Икпеба", "Ая", "Стивен", "Генри", "Пол",
  ],
  COL: [
    "Хамес", "Радамель", "Хуан", "Давинсон", "Луис", "Карлос", "Мигель", "Андрес", "Фалько", "Йерри",
    "Даниэль", "Матеус", "Сантьяго", "Диего", "Хорхе", "Вильфмар", "Хулиан", "Рафаэл", "Эдер", "Куадрадо",
  ],
  DEFAULT: [
    "Алекс", "Сэм", "Крис", "Игорь", "Роман", "Максим", "Даниил", "Артём", "Никита", "Павел",
  ],
};

const LAST: Record<string, string[]> = {
  RUS: [
    "Иванов", "Смирнов", "Кузнецов", "Попов", "Васильев", "Петров", "Соколов", "Михайлов", "Новиков", "Фёдоров",
    "Морозов", "Волков", "Алексеев", "Лебедев", "Семёнов", "Егоров", "Павлов", "Козлов", "Степанов", "Николаев",
    "Орлов", "Андреев", "Макаров", "Никитин", "Захаров", "Зайцев", "Соловьёв", "Борисов", "Яковлев", "Григорьев",
    "Романов", "Воробьёв", "Сергеев", "Фролов", "Александров", "Дмитриев", "Королёв", "Гусев", "Киселёв", "Ильин",
    "Белов", "Комаров", "Одинцов", "Тарасов", "Баранов", "Крылов", "Титов", "Медведев", "Ершов", "Щукин",
    "Калинин", "Голубев", "Виноградов", "Богданов", "Воронов", "Ларионов", "Савельев", "Громов", "Кудрявцев", "Беляев",
  ],
  ENG: [
    "Смит", "Джонс", "Уильямс", "Браун", "Тейлор", "Уилсон", "Дэвис", "Эванс", "Томас", "Джонсон",
    "Робертс", "Уокер", "Райт", "Робинсон", "Томпсон", "Уайт", "Хьюз", "Эдвардс", "Грин", "Холл",
    "Кларк", "Джексон", "Вуд", "Харрис", "Льюис", "Скотт", "Мур", "Купер", "Кинг", "Бейкер",
    "Паркер", "Беннетт", "Морган", "Бейли", "Рид", "Коулман", "Хейс", "Мюррей", "Фокс", "Хьюз",
    "Кэмпбелл", "Миллер", "Андерсон", "Митчелл", "Фостер", "Грэм", "Батлер", "Коллинз", "Прайс", "Хант",
  ],
  ESP: [
    "Гарсия", "Родригес", "Мартинес", "Лопес", "Санчес", "Перес", "Гонсалес", "Руис", "Диас", "Торрес",
    "Хименес", "Морено", "Муньос", "Альварес", "Ромеро", "Алонсо", "Гутьеррес", "Наварро", "Рамос", "Хиль",
    "Серрано", "Бланко", "Молина", "Моралес", "Суарес", "Ортега", "Дельгадо", "Кастро", "Ортис", "Рубио",
    "Марин", "Санс", "Иглесиас", "Нуньес", "Медина", "Гарридо", "Кортес", "Кастильо", "Рейес", "Вега",
    "Эррера", "Васкес", "Фернандес", "Домингес", "Кальво", "Паскуаль", "Сото", "Прието", "Креспо", "Лара",
  ],
  GER: [
    "Мюллер", "Шмидт", "Шнайдер", "Фишер", "Вебер", "Вагнер", "Беккер", "Хоффманн", "Шефер", "Кох",
    "Бауэр", "Рихтер", "Кляйн", "Вольф", "Шрёдер", "Нойманн", "Шварц", "Циммерманн", "Браун", "Крюгер",
    "Хартманн", "Ланге", "Шмитт", "Вернер", "Шмитц", "Краузе", "Майер", "Леманн", "Шульц", "Кёлер",
    "Херрманн", "Кёниг", "Вальтер", "Хубер", "Кайзер", "Фукс", "Берг", "Фогель", "Граф", "Зееле",
    "Брандт", "Фогельс", "Клозе", "Баллак", "Нойер", "Кройц", "Штайн", "Бауманн", "Дитрих", "Фольмер",
  ],
  ITA: [
    "Росси", "Руссо", "Феррари", "Эспозито", "Бьянки", "Романо", "Коломбо", "Риччи", "Марино", "Греко",
    "Бруно", "Галло", "Конти", "Де Лука", "Манчини", "Коста", "Джордано", "Риццо", "Ломбарди", "Моретти",
    "Барбьери", "Фонтана", "Санторо", "Мариани", "Ринальди", "Карузо", "Феррара", "Галли", "Мартини", "Леоне",
    "Лонго", "Джентиле", "Мартинелли", "Витале", "Ломбардо", "Серра", "Коппола", "Де Сантис", "Маркетти", "Пеллегрини",
    "Бернарди", "Каппелло", "Тоди", "Паван", "Ферри", "Белло", "Нери", "Россини", "Каттанео", "Базиле",
  ],
  FRA: [
    "Мартен", "Бернар", "Дюбуа", "Тома", "Робер", "Ришар", "Пти", "Дюран", "Леруа", "Моро",
    "Симон", "Лоран", "Лефевр", "Мишель", "Гарсия", "Давид", "Бертран", "Ру", "Венсан", "Фурнье",
    "Морель", "Жирар", "Андре", "Мерсье", "Дюпон", "Ламбер", "Бонне", "Франсуа", "Легран", "Гарнье",
    "Фор", "Руссо", "Блан", "Герен", "Мюллер", "Анри", "Руссель", "Николя", "Шарль", "Пикар",
    "Диалло", "Траоре", "Камара", "Ндиайе", "Сиссе", "Бенжема", "Жиру", "Погба", "Мбаппе", "Гризманн",
  ],
  BRA: [
    "Силва", "Сантос", "Оливейра", "Соуза", "Родригес", "Феррейра", "Алвес", "Перейра", "Лима", "Гомес",
    "Кошта", "Рибейро", "Мартинс", "Карвальо", "Араужо", "Фернандес", "Барбоза", "Роша", "Диас", "Нунис",
    "Тешейра", "Коррейа", "Мендес", "Кампос", "Батиста", "Мораес", "Виейра", "Кардозу", "Пирес", "Невес",
  ],
  ARG: [
    "Гонсалес", "Родригес", "Фернандес", "Лопес", "Мартинес", "Гарсия", "Перес", "Ромеро", "Диас", "Альварес",
    "Суарес", "Акунья", "Де Пауль", "Паредес", "Отаменди", "Ди Мария", "Дыбала", "Молина", "Таглиафико", "МакАллистер",
    "Альмада", "Лисандро", "Ролон", "Паласиос", "Буэндия", "Лаутаро", "Корсо", "Рикельме", "Айяла", "Самуэль",
  ],
  SRB: [
    "Йович", "Митрович", "Тадич", "Костич", "Миленкович", "Геделько", "Влахович", "Павлович", "Радонич", "Илич",
    "Николич", "Петрович", "Йованович", "Стойкович", "Джурич", "Савич", "Лукич", "Живкович", "Станкович", "Маркович",
  ],
  CRO: [
    "Модрич", "Перишич", "Брозович", "Ковачич", "Гвардиол", "Ливакович", "Влашич", "Пашалич", "Крамарич", "Брекало",
    "Ракитич", "Манджукич", "Субашич", "Ловрен", "Вида", "Ребич", "Оршич", "Якич", "Майер", "Будимир",
  ],
  NED: [
    "де Йонг", "де Лихт", "ван Дейк", "Депай", "Гакпо", "Симонс", "Бабел", "Клюйверт", "Снейдер", "Роббен",
    "ван Перси", "Блинд", "Думфрис", "Френки", "Тимбер", "Схаутен", "Райккаард", "Круифф", "Бергкамп", "Нескенс",
  ],
  POR: [
    "Силва", "Сантуш", "Феррейра", "Кошта", "Перейра", "Оливейра", "Родригеш", "Мартинш", "Альвеш", "Карвалью",
    "Феликс", "Жота", "Бернарду", "Рубен", "Пепе", "Роналду", "Канселу", "Далот", "Невеш", "Леан",
  ],
  UKR: [
    "Шевченко", "Ярмоленко", "Мудрик", "Зинченко", "Малиновский", "Яремчук", "Цыганков", "Миколенко", "Трубин", "Довбик",
    "Коваленко", "Бондарь", "Мельник", "Кравченко", "Петренко", "Сидоренко", "Ткаченко", "Бойко", "Лысенко", "Мороз",
  ],
  BLR: [
    "Ковалев", "Новик", "Жуков", "Савицкий", "Глеб", "Корниленко", "Верховцов", "Мартынович", "Стрельцов", "Драгун",
    "Иванов", "Петров", "Смирнов", "Кузнецов", "Попов", "Васильев", "Соколов", "Михайлов", "Новиков", "Фёдоров",
  ],
  KAZ: [
    "Абикенов", "Байтасов", "Нурмагамбетов", "Сейдахметов", "Кайратов", "Тулеуов", "Жумабеков", "Оразов", "Алиев", "Беков",
    "Ибраев", "Садыков", "Есенов", "Каримов", "Рахимов", "Умаров", "Хасанов", "Назаров", "Юсупов", "Исмаилов",
  ],
  SEN: [
    "Мане", "Кулибали", "Гейе", "Менди", "Сарр", "Диалло", "Ндиайе", "Ба", "Диуф", "Сиссе",
    "Камара", "Траоре", "Кебе", "Фаэль", "Гуэйе", "Сако", "Дженг", "Ваде", "Тиам", "Сы",
  ],
  NGA: [
    "Осимхен", "Ивоби", "Ндиайе", "Ихеаначо", "Чуквуезе", "Аина", "Окоча", "Кану", "Якубу", "Мартинс",
    "Оби", "Эменике", "Симон", "Нвакаеме", "Муса", "Игхало", "Ндонгу", "Онуачу", "Окоча", "Эзе",
  ],
  COL: [
    "Родригес", "Фалькао", "Куадрадо", "Санчес", "Мура", "Мина", "Урибе", "Кинтеро", "Боре", "Запата",
    "Бака", "Хаймес", "Кардона", "Агудело", "Тесорильо", "Лерма", "Диас", "Борель", "Боре", "Давинсон",
  ],
  DEFAULT: [
    "Иванов", "Петров", "Смирнов", "Козлов", "Новиков", "Морозов", "Волков", "Соколов", "Лебедев", "Козлов",
  ],
};

const LATIN_RE = /[A-Za-z]/;

export function hasLatinLetters(text: string): boolean {
  return LATIN_RE.test(text);
}

/** Extra nations used as legionnaires (beyond pack federations). */
export const LEGIONNAIRE_NATIONS = [
  "BRA", "ARG", "SRB", "CRO", "NED", "POR", "UKR", "BLR", "KAZ", "SEN", "NGA", "COL",
] as const;

const PACK_NATIONS = ["RUS", "ENG", "ESP", "GER", "ITA", "FRA"] as const;

/** Share of home-grown players by club federation. */
function homeNationalityRate(homeFed: string): number {
  switch (homeFed) {
    case "RUS":
      return 0.7; // ~30% legionnaires — typical RPL mix
    case "ENG":
      return 0.4;
    case "ESP":
    case "ITA":
      return 0.48;
    case "GER":
      return 0.5;
    case "FRA":
      return 0.45;
    default:
      return 0.55;
  }
}

function legionnairePool(homeFed: string): string[] {
  const euro = PACK_NATIONS.filter((id) => id !== homeFed);
  if (homeFed === "RUS") {
    return [...LEGIONNAIRE_NATIONS, ...euro];
  }
  return [
    "BRA", "ARG", "POR", "NED", "SEN", "NGA", "COL", "CRO", "SRB",
    ...euro,
  ];
}

/** Pick player nationality for a club (home majority + legionnaires). */
export function rollNationality(homeFederationId: string, rng: Rng): string {
  if (rng.chance(homeNationalityRate(homeFederationId))) {
    return homeFederationId;
  }
  return rng.pick(legionnairePool(homeFederationId));
}

const SQUAD_SHAPE: Position[] = [
  "GK", "GK", "GK",
  "DF", "DF", "DF", "DF", "DF", "DF", "DF",
  "MF", "MF", "MF", "MF", "MF", "MF", "MF",
  "FW", "FW", "FW", "FW", "FW",
];

const DF_ROLES: RoleId[] = ["LB", "CB", "CB", "CB", "RB", "LWB", "RWB"];
const MF_ROLES: RoleId[] = ["CDM", "CM", "CM", "CAM", "LM", "RM"];
const FW_ROLES: RoleId[] = ["LW", "ST", "ST", "CF", "RW"];

function relatedRoles(primary: RoleId): RoleId[] {
  const line = roleToLine(primary);
  if (line === "GK") return ["GK"];
  if (line === "DF") {
    if (primary === "LB" || primary === "LWB") return [primary, "CB", "LM"];
    if (primary === "RB" || primary === "RWB") return [primary, "CB", "RM"];
    return ["CB", "LB", "RB"];
  }
  if (line === "MF") {
    if (primary === "LM") return ["LM", "CM", "LW"];
    if (primary === "RM") return ["RM", "CM", "RW"];
    if (primary === "CAM") return ["CAM", "CM", "CF"];
    if (primary === "CDM") return ["CDM", "CM", "CB"];
    return ["CM", "CDM", "CAM"];
  }
  if (primary === "LW") return ["LW", "LM", "ST"];
  if (primary === "RW") return ["RW", "RM", "ST"];
  if (primary === "CF") return ["CF", "ST", "CAM"];
  return ["ST", "CF", "LW"];
}

function footForRole(role: RoleId, rng: Rng): PreferredFoot {
  const side = roleFlankLocal(role);
  if (side === "L") {
    if (rng.chance(0.55)) return "L";
    if (rng.chance(0.35)) return "B";
    return "R";
  }
  if (side === "R") {
    if (rng.chance(0.55)) return "R";
    if (rng.chance(0.35)) return "B";
    return "L";
  }
  if (rng.chance(0.12)) return "L";
  if (rng.chance(0.18)) return "B";
  return "R";
}

/** Detailed roles + preferred foot for a coarse line position. */
export function rollRolesAndFoot(
  position: Position,
  rng: Rng
): { roles: RoleId[]; preferredRole: RoleId; preferredFoot: PreferredFoot } {
  let preferredRole: RoleId;
  if (position === "GK") preferredRole = "GK";
  else if (position === "DF") preferredRole = rng.pick(DF_ROLES);
  else if (position === "MF") preferredRole = rng.pick(MF_ROLES);
  else preferredRole = rng.pick(FW_ROLES);

  const related = relatedRoles(preferredRole).filter((r) => r !== preferredRole);
  const roles: RoleId[] = [preferredRole];
  if (related.length && rng.chance(0.55)) {
    roles.push(rng.pick(related));
  }
  if (related.length > 1 && rng.chance(0.2)) {
    const extra = related.find((r) => !roles.includes(r));
    if (extra) roles.push(extra);
  }

  return {
    preferredRole,
    roles,
    preferredFoot: footForRole(preferredRole, rng),
  };
}

function namesFor(federationId: string): { first: string[]; last: string[] } {
  const alias: Record<string, string> = {
    POR: "ESP",
    NED: "GER",
    BEL: "FRA",
    TUR: "DEFAULT",
    AUT: "GER",
    SCO: "ENG",
    CZE: "GER",
    GRE: "DEFAULT",
    SUI: "GER",
    DEN: "GER",
    NOR: "GER",
    UKR: "RUS",
    SRB: "SRB",
    CRO: "CRO",
  };
  const key = FIRST[federationId] ? federationId : alias[federationId] ?? "DEFAULT";
  return {
    first: FIRST[key] ?? FIRST.DEFAULT,
    last: LAST[key] ?? LAST.DEFAULT,
  };
}

function clamp(n: number): number {
  return Math.min(95, Math.max(35, Math.round(n)));
}

function rollAttrs(position: Position, base: number, rng: Rng): PlayerAttributes {
  const jitter = () => base + rng.int(-10, 10);
  const low = () => 30 + rng.int(0, 18);
  if (position === "GK") {
    return {
      pace: clamp(base - 8 + rng.int(-6, 6)),
      shooting: clamp(low()),
      passing: clamp(jitter() - 5),
      dribbling: clamp(low()),
      defending: clamp(base - 15 + rng.int(-5, 8)),
      physical: clamp(jitter()),
      goalkeeping: clamp(base + rng.int(-4, 10)),
    };
  }
  if (position === "DF") {
    return {
      pace: clamp(jitter() - 2),
      shooting: clamp(low() + 5),
      passing: clamp(jitter() - 3),
      dribbling: clamp(base - 12 + rng.int(-5, 8)),
      defending: clamp(base + rng.int(-3, 10)),
      physical: clamp(base + rng.int(-4, 8)),
      goalkeeping: clamp(low()),
    };
  }
  if (position === "MF") {
    return {
      pace: clamp(jitter()),
      shooting: clamp(jitter() - 4),
      passing: clamp(base + rng.int(-3, 10)),
      dribbling: clamp(jitter()),
      defending: clamp(base - 10 + rng.int(-5, 10)),
      physical: clamp(jitter() - 2),
      goalkeeping: clamp(low()),
    };
  }
  return {
    pace: clamp(base + rng.int(-4, 10)),
    shooting: clamp(base + rng.int(-2, 10)),
    passing: clamp(jitter() - 5),
    dribbling: clamp(jitter()),
    defending: clamp(low()),
    physical: clamp(jitter()),
    goalkeeping: clamp(low()),
  };
}

function pickTraits(position: Position, attrs: PlayerAttributes, rng: Rng): PlayerTrait[] {
  const pool: PlayerTrait[] = [];
  if (position === "GK" && attrs.goalkeeping >= 72) pool.push("sweeper_keeper");
  if (attrs.shooting >= 75) pool.push("finisher", "poacher");
  if (attrs.passing >= 75) pool.push("playmaker");
  if (attrs.pace >= 78) pool.push("speedster");
  if (attrs.physical >= 78) pool.push("tank");
  if (attrs.defending >= 76) pool.push("wall");
  if (attrs.dribbling >= 76) pool.push("dribbler");
  if (attrs.physical >= 70 && attrs.pace >= 70) pool.push("engine");
  if (rng.chance(0.2)) pool.push("leader");

  const unique = [...new Set(pool)];
  if (unique.length === 0) return [];
  const count = rng.chance(0.35) ? 2 : 1;
  const traits: PlayerTrait[] = [];
  for (let i = 0; i < count && unique.length; i++) {
    const t = rng.pick(unique);
    traits.push(t);
    unique.splice(unique.indexOf(t), 1);
  }
  return traits;
}

/** Realistic height (cm) / weight (kg) by position. */
export function rollBody(position: Position, rng: Rng): { height: number; weight: number } {
  if (position === "GK") {
    const height = rng.int(186, 198);
    return { height, weight: rng.int(78, 92) + Math.round((height - 190) * 0.4) };
  }
  if (position === "DF") {
    const height = rng.int(178, 194);
    return { height, weight: rng.int(72, 88) + Math.round((height - 184) * 0.35) };
  }
  if (position === "MF") {
    const height = rng.int(170, 186);
    return { height, weight: rng.int(65, 80) + Math.round((height - 178) * 0.3) };
  }
  const height = rng.int(168, 188);
  return { height, weight: rng.int(64, 84) + Math.round((height - 178) * 0.3) };
}

/**
 * Market value in abstract millions from overall, age, potential, season form.
 */
export function recomputeMarketValue(
  player: Pick<Player, "overall" | "age" | "potential" | "positions">,
  stats?: PlayerSeasonStats | null
): number {
  const ovr = player.overall;
  const pot = player.potential;
  const age = player.age;
  let value = Math.pow(Math.max(40, ovr) / 10, 2.15) * 0.35;

  // Youth / peak / decline — older players get sharply cheaper
  if (age <= 21) value *= 1.15 + (pot - ovr) * 0.02;
  else if (age <= 27) value *= 1.2;
  else if (age <= 30) value *= 1.0;
  else if (age <= 32) value *= 0.72;
  else if (age <= 34) value *= 0.48;
  else if (age <= 36) value *= 0.28;
  else value *= 0.12;

  value *= 1 + Math.max(0, pot - ovr) * 0.025;

  if (stats && stats.appearances > 0) {
    const apps = stats.appearances;
    const g = stats.goals;
    const a = stats.assists;
    const avg = stats.ratingCount > 0 ? stats.ratingSum / stats.ratingCount : 6.5;
    value *= 1 + Math.min(0.35, apps * 0.012);
    value *= 1 + Math.min(0.4, (g * 0.04 + a * 0.025));
    value *= 1 + Math.max(-0.15, Math.min(0.25, (avg - 6.5) * 0.12));
  }

  return Math.max(0.1, Math.round(value * 10) / 10);
}

/**
 * Seasonal wage in abstract millions — scales with overall / age / club rep / league wealth.
 * Tuned so a full squad wage bill stays well below typical transfer budgets (no start-of-career debt).
 */
export function computePlayerWage(
  player: Pick<Player, "overall" | "age" | "potential">,
  club?: Pick<Club, "reputation"> | null,
  leagueId?: string | null
): number {
  const ovr = player.overall;
  const age = player.age;
  const pot = player.potential;
  // Soft curve: 60 OVR ≈ 0.08, 75 ≈ 0.28, 85 ≈ 0.7, 92 ≈ 1.4
  let wage = Math.pow(Math.max(45, ovr) / 55, 3.1) * 0.22;

  if (age <= 20) wage *= 0.72;
  else if (age <= 23) wage *= 0.88;
  else if (age <= 29) wage *= 1.08;
  else if (age <= 32) wage *= 1.0;
  else if (age <= 34) wage *= 0.82;
  else wage *= 0.55;

  if (pot - ovr >= 8 && age <= 23) wage *= 1.08;

  const rep = club?.reputation ?? 70;
  wage *= 0.72 + rep / 220;

  const leagueWealth: Record<string, number> = {
    epl: 1.28,
    laliga: 1.12,
    bundesliga: 1.08,
    seriea: 1.05,
    ligue1: 0.98,
    rpl: 0.78,
  };
  wage *= leagueId ? leagueWealth[leagueId] ?? 0.9 : 0.9;

  // Cap individual wages so even galacticos don't alone sink a mid budget (~50–60)
  wage = Math.min(wage, 2.8 + Math.max(0, rep - 85) * 0.04);
  return Math.max(0.02, Math.round(wage * 100) / 100);
}

/** Total seasonal wage bill for a club (abstract millions). */
export function clubWageBill(players: Player[], clubId: string): number {
  return Math.round(
    players
      .filter((p) => p.clubId === clubId && !p.loan)
      .reduce((s, p) => s + Math.max(0, p.wage ?? 0), 0) * 100
  ) / 100;
}

class UniqueNames {
  /** Per-federation uniqueness so foreign leagues don't starve Russian pools. */
  private usedByFed = new Map<string, Set<string>>();

  private used(federationId: string): Set<string> {
    let set = this.usedByFed.get(federationId);
    if (!set) {
      set = new Set();
      this.usedByFed.set(federationId, set);
    }
    return set;
  }

  next(federationId: string, rng: Rng): { firstName: string; lastName: string } {
    const { first, last } = namesFor(federationId);
    const used = this.used(federationId);
    for (let attempt = 0; attempt < 600; attempt++) {
      const firstName = rng.pick(first);
      const lastName = rng.pick(last);
      const key = `${firstName}:${lastName}`;
      if (!used.has(key)) {
        used.add(key);
        return { firstName, lastName };
      }
    }
    for (let n = 2; n < 80; n++) {
      const firstName = rng.pick(first);
      const lastName = `${rng.pick(last)}-${n}`;
      const key = `${firstName}:${lastName}`;
      if (!used.has(key)) {
        used.add(key);
        return { firstName, lastName };
      }
    }
    const firstName = rng.pick(first);
    const lastName = `${rng.pick(last)}-${used.size}`;
    used.add(`${firstName}:${lastName}`);
    return { firstName, lastName };
  }
}

/** Force a Cyrillic name for a nationality (used when migrating Latin leftovers). */
export function rollCyrillicName(
  nationalityId: string,
  seed: string
): { firstName: string; lastName: string } {
  const rng = new Rng(
    [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0
  );
  const { first, last } = namesFor(nationalityId);
  return { firstName: rng.pick(first), lastName: rng.pick(last) };
}

export function generateSquad(
  pack: WorldPack,
  clubId: string,
  rng: Rng,
  names: UniqueNames,
  size = 22
): Player[] {
  const club = pack.clubs.find((c) => c.id === clubId);
  if (!club) return [];
  const base = 55 + Math.floor(club.reputation / 3);
  const players: Player[] = [];
  const shape = SQUAD_SHAPE.slice(0, size);
  const nationalities = shape.map(() => rollNationality(club.federationId, rng));
  const portraitIds = assignSquadPortraits(nationalities, rng);

  for (let i = 0; i < shape.length; i++) {
    const position = shape[i];
    const nationalityId = nationalities[i] ?? club.federationId;
    const attributes = rollAttrs(position, base, rng);
    const overall = computeOverall(position, attributes);
    const secondary: Position[] =
      position === "MF" && rng.chance(0.25) ? ["MF", rng.chance(0.5) ? "FW" : "DF"] : [position];
    const { firstName, lastName } = names.next(nationalityId, rng);
    const age = rng.int(17, 34);
    const potential = Math.min(95, overall + rng.int(0, 12));
    const { height, weight } = rollBody(position, rng);
    const { roles, preferredRole, preferredFoot } = rollRolesAndFoot(position, rng);
    const leagueId = pack.leagues.find((l) => l.clubIds.includes(clubId))?.id;
    const draft: Omit<Player, "marketValue" | "wage"> & { marketValue?: number; wage?: number } = {
      id: `${clubId}-p${i + 1}`,
      firstName,
      lastName,
      age,
      nationalityId,
      clubId,
      positions: secondary,
      roles,
      preferredRole,
      preferredFoot,
      attributes,
      traits: pickTraits(position, attributes, rng),
      overall,
      potential,
      height,
      weight,
      portraitId: portraitIds[i] ?? portraitIdForPlayer(nationalityId, `${clubId}-p${i + 1}`),
    };
    players.push({
      ...draft,
      marketValue: recomputeMarketValue(draft, null),
      wage: computePlayerWage(draft, club, leagueId),
    });
  }
  return players;
}

export function generateWorldPlayers(pack: WorldPack, seed: number): Player[] {
  const rng = new Rng(seed);
  const names = new UniqueNames();
  return pack.clubs.flatMap((c) => generateSquad(pack, c.id, rng, names));
}

/** Append squads for pack clubs that have no players yet (e.g. new euro guests). */
export function ensureMissingClubSquads(
  pack: WorldPack,
  players: Player[],
  seed: number
): Player[] {
  const covered = new Set(
    players.map((p) => p.clubId).filter((id): id is string => !!id)
  );
  const missing = pack.clubs.filter((c) => !covered.has(c.id));
  if (!missing.length) return [...players];
  const rng = new Rng(seed ^ 0x6c7565);
  const names = new UniqueNames();
  // Avoid colliding with existing name pairs within this batch
  for (const p of players) {
    // UniqueNames is per-fed; seed used names lightly via next() only — skip
    void p;
  }
  const extras = missing.flatMap((c) => generateSquad(pack, c.id, rng, names));
  return [...players, ...extras];
}

/** Refresh stored market values after matches (mutates players in place). */
export function refreshMarketValues(
  players: Player[],
  stats: Record<string, PlayerSeasonStats>,
  playerIds?: string[]
): void {
  const ids = playerIds ? new Set(playerIds) : null;
  for (const p of players) {
    if (ids && !ids.has(p.id)) continue;
    p.marketValue = recomputeMarketValue(p, stats?.[p.id] ?? null);
  }
}

/** Ensure wage is set (migration / academy). Mutates player. */
export function ensurePlayerWage(
  player: Player,
  club?: Pick<Club, "reputation"> | null,
  leagueId?: string | null
): void {
  if (typeof player.wage === "number" && Number.isFinite(player.wage) && player.wage > 0) return;
  player.wage = computePlayerWage(player, club, leagueId);
}
