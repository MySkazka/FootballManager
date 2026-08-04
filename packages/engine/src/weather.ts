import { Rng } from "./rng";
import type {
  Club,
  ConfederationId,
  Federation,
  League,
  MatchAtmosphere,
} from "./types";

export type WeatherId = MatchAtmosphere["weather"];
export type { MatchAtmosphere };

export interface WeatherEffects {
  /** Extra per-minute slip chance on the pitch */
  slipChance: number;
  /** Extra injury chance when something goes wrong (slip / hard challenge) */
  injuryChance: number;
  /** Chance a GK mishandles (sun / wet ball) on a shot on target */
  gkErrorChance: number;
  /** Added to finish (goal) probability */
  finishMod: number;
  /** Added to GK save probability */
  saveMod: number;
  /** Multiplier for attack ratings (cold / wet slows play) */
  attackMod: number;
  /** Multiplier for defence ratings */
  defenceMod: number;
}

const WEATHER_META: Record<
  WeatherId,
  { label: string; hint: string; effects: WeatherEffects }
> = {
  clear: {
    label: "Ясно",
    hint: "Хорошие условия для игры",
    effects: {
      slipChance: 0.002,
      injuryChance: 0.008,
      gkErrorChance: 0.02,
      finishMod: 0,
      saveMod: 0,
      attackMod: 1,
      defenceMod: 1,
    },
  },
  sunny: {
    label: "Солнечно",
    hint: "Яркое солнце — вратарям тяжелее",
    effects: {
      slipChance: 0.002,
      injuryChance: 0.01,
      gkErrorChance: 0.09,
      finishMod: 0.02,
      saveMod: -0.08,
      attackMod: 1.02,
      defenceMod: 0.98,
    },
  },
  cloudy: {
    label: "Облачно",
    hint: "Нейтральная погода",
    effects: {
      slipChance: 0.004,
      injuryChance: 0.01,
      gkErrorChance: 0.03,
      finishMod: 0,
      saveMod: 0,
      attackMod: 1,
      defenceMod: 1,
    },
  },
  rain: {
    label: "Дождь",
    hint: "Мокрый газон — скользко",
    effects: {
      slipChance: 0.028,
      injuryChance: 0.022,
      gkErrorChance: 0.11,
      finishMod: -0.02,
      saveMod: -0.06,
      attackMod: 0.94,
      defenceMod: 0.96,
    },
  },
  heavy_rain: {
    label: "Ливень",
    hint: "Лужами по полю — риск травм и ошибок",
    effects: {
      slipChance: 0.045,
      injuryChance: 0.035,
      gkErrorChance: 0.16,
      finishMod: -0.04,
      saveMod: -0.1,
      attackMod: 0.88,
      defenceMod: 0.9,
    },
  },
  snow: {
    label: "Снег",
    hint: "Тяжёлый мяч, осторожный темп",
    effects: {
      slipChance: 0.038,
      injuryChance: 0.03,
      gkErrorChance: 0.08,
      finishMod: -0.05,
      saveMod: -0.04,
      attackMod: 0.86,
      defenceMod: 0.92,
    },
  },
  wind: {
    label: "Ветер",
    hint: "Мяч гуляет — удары непредсказуемы",
    effects: {
      slipChance: 0.01,
      injuryChance: 0.012,
      gkErrorChance: 0.05,
      finishMod: -0.03,
      saveMod: -0.03,
      attackMod: 0.95,
      defenceMod: 0.97,
    },
  },
};

/** Derive stadium capacity from club reputation (pack has name only). */
export function clubStadiumCapacity(club: Club): number {
  const r = Math.max(40, Math.min(99, club.reputation));
  // ~18k at rep 55 · ~45k at 82 · ~72k at 97
  const base = 10_000 + Math.pow(r - 45, 1.65) * 95;
  const bump = r >= 88 ? (r - 87) * 2200 : 0;
  return Math.round((base + bump) / 500) * 500;
}

export function weatherEffects(weather: WeatherId): WeatherEffects {
  return WEATHER_META[weather].effects;
}

export function weatherLabel(weather: WeatherId): string {
  return WEATHER_META[weather].label;
}

export function weatherHint(weather: WeatherId): string {
  return WEATHER_META[weather].hint;
}

function monthFromDate(date: string): number {
  const m = Number(date.slice(5, 7));
  return Number.isFinite(m) ? m : 8;
}

function climateBucket(federationId: string, confederation?: ConfederationId): "north" | "mild" | "south" {
  if (
    federationId === "RUS" ||
    federationId === "UKR" ||
    federationId === "BLR" ||
    federationId === "SWE" ||
    federationId === "NOR" ||
    federationId === "FIN" ||
    federationId === "POL"
  ) {
    return "north";
  }
  if (
    federationId === "ESP" ||
    federationId === "POR" ||
    federationId === "ITA" ||
    federationId === "GRE" ||
    federationId === "TUR" ||
    confederation === "CAF" ||
    confederation === "AFC"
  ) {
    return "south";
  }
  return "mild";
}

/** Weighted weather roll by month and home federation climate. */
export function rollWeather(
  date: string,
  homeFederationId: string,
  rng: Rng,
  confederation?: ConfederationId
): WeatherId {
  const month = monthFromDate(date);
  const climate = climateBucket(homeFederationId, confederation);
  const winter = month <= 2 || month === 12;
  const autumn = month >= 9 && month <= 11;
  const summer = month >= 6 && month <= 8;

  const weights: Record<WeatherId, number> = {
    clear: 18,
    sunny: 14,
    cloudy: 22,
    rain: 16,
    heavy_rain: 6,
    snow: 2,
    wind: 10,
  };

  if (climate === "north") {
    if (winter) {
      weights.snow = 28;
      weights.cloudy = 24;
      weights.clear = 8;
      weights.sunny = 4;
      weights.rain = 10;
      weights.heavy_rain = 4;
      weights.wind = 14;
    } else if (autumn) {
      weights.rain = 26;
      weights.heavy_rain = 12;
      weights.cloudy = 22;
      weights.wind = 14;
      weights.snow = 4;
    } else if (summer) {
      weights.sunny = 18;
      weights.clear = 22;
      weights.rain = 14;
      weights.heavy_rain = 6;
      weights.snow = 0;
    }
  } else if (climate === "south") {
    weights.snow = winter ? 1 : 0;
    if (summer) {
      weights.sunny = 42;
      weights.clear = 28;
      weights.rain = 8;
      weights.heavy_rain = 3;
      weights.cloudy = 12;
      weights.wind = 6;
    } else if (autumn || winter) {
      weights.rain = 18;
      weights.cloudy = 24;
      weights.sunny = 16;
      weights.clear = 18;
      weights.wind = 12;
    }
  } else {
    // mild (ENG, GER, FRA…)
    if (winter) {
      weights.rain = 24;
      weights.heavy_rain = 10;
      weights.cloudy = 26;
      weights.wind = 14;
      weights.snow = 6;
      weights.sunny = 6;
    } else if (autumn) {
      weights.rain = 22;
      weights.heavy_rain = 10;
      weights.cloudy = 24;
      weights.wind = 14;
    } else if (summer) {
      weights.sunny = 22;
      weights.clear = 24;
      weights.rain = 12;
    }
  }

  const entries = Object.entries(weights) as [WeatherId, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [id, w] of entries) {
    roll -= w;
    if (roll <= 0) return id;
  }
  return "cloudy";
}

export function estimateAttendance(
  home: Club,
  away: Club,
  capacity: number,
  weather: WeatherId,
  opts: {
    place?: number;
    euro?: boolean;
    rng: Rng;
  }
): number {
  const place = opts.place ?? 8;
  const formDemand = Math.max(0.52, 1.18 - (place - 1) * 0.03);
  const derbyBoost = home.federationId === away.federationId ? 1.04 : 1;
  const opponentPull = 0.88 + away.reputation / 400;
  let fill = (0.55 + home.reputation / 220) * formDemand * derbyBoost * opponentPull;
  if (opts.euro) fill *= 1.12;

  const weatherFill: Record<WeatherId, number> = {
    clear: 1.02,
    sunny: 1.04,
    cloudy: 0.98,
    rain: 0.88,
    heavy_rain: 0.72,
    snow: 0.68,
    wind: 0.92,
  };
  fill *= weatherFill[weather];
  fill *= 0.94 + opts.rng.next() * 0.1;
  fill = Math.max(0.28, Math.min(0.995, fill));
  return Math.max(500, Math.round((capacity * fill) / 50) * 50);
}

export function rollMatchAtmosphere(
  home: Club,
  away: Club,
  date: string,
  rng: Rng,
  opts?: {
    federation?: Federation;
    league?: League | null;
    place?: number;
    euro?: boolean;
  }
): MatchAtmosphere {
  const weather = rollWeather(
    date,
    home.federationId,
    rng,
    opts?.federation?.confederation
  );
  const capacity = clubStadiumCapacity(home);
  const attendance = estimateAttendance(home, away, capacity, weather, {
    place: opts?.place,
    euro: opts?.euro,
    rng,
  });
  const meta = WEATHER_META[weather];
  return {
    weather,
    weatherLabel: meta.label,
    weatherHint: meta.hint,
    stadium: home.stadium,
    capacity,
    attendance,
  };
}

export function formatAttendance(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function attendanceFillPct(attendance: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.round((100 * attendance) / capacity);
}
