import { Asset } from "expo-asset";
import { Image, View } from "react-native";
import { portraitIdForPlayer } from "@fm/engine";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

export type PortraitKind = "player" | "coach" | "president" | "sporting_director" | "journalist";

/** Player faces only — never use staff/ref art for players. */
const PLAYER_PORTRAITS = [
  require("../../assets/portraits/player-01.png"),
  require("../../assets/portraits/player-02.png"),
  require("../../assets/portraits/player-03.png"),
  require("../../assets/portraits/player-04.png"),
  require("../../assets/portraits/player-05.png"),
  require("../../assets/portraits/player-06.png"),
  require("../../assets/portraits/player-07.png"),
  require("../../assets/portraits/player-08.png"),
  require("../../assets/portraits/player-09.png"),
  require("../../assets/portraits/player-10.png"),
  require("../../assets/portraits/player-11.png"),
  require("../../assets/portraits/player-12.png"),
  require("../../assets/portraits/player-13.png"),
  require("../../assets/portraits/player-14.png"),
  require("../../assets/portraits/player-15.png"),
  require("../../assets/portraits/player-16.png"),
  require("../../assets/portraits/player-17.png"),
  require("../../assets/portraits/player-18.png"),
  require("../../assets/portraits/player-19.png"),
  require("../../assets/portraits/player-20.png"),
  require("../../assets/portraits/player-21.png"),
  require("../../assets/portraits/player-22.png"),
  require("../../assets/portraits/player-23.png"),
  require("../../assets/portraits/player-24.png"),
  require("../../assets/portraits/player-25.png"),
  require("../../assets/portraits/player-26.png"),
  require("../../assets/portraits/player-27.png"),
  require("../../assets/portraits/player-28.png"),
] as const;

const COACH_PORTRAITS = [require("../../assets/portraits/coach-01.png")] as const;
const PRESIDENT_PORTRAITS = [require("../../assets/portraits/staff-01.png")] as const;
const JOURNALIST_PORTRAITS = [require("../../assets/portraits/staff-02.png")] as const;
const SD_PORTRAITS = [require("../../assets/portraits/staff-03.png")] as const;

const ALL_PORTRAIT_MODULES = [
  ...PLAYER_PORTRAITS,
  ...COACH_PORTRAITS,
  ...PRESIDENT_PORTRAITS,
  ...JOURNALIST_PORTRAITS,
  ...SD_PORTRAITS,
];

let portraitsPreloaded = false;

/** Warm local portrait PNGs into the asset/image cache at app start. */
export async function preloadPortraits(): Promise<void> {
  if (portraitsPreloaded) return;
  await Asset.loadAsync([...ALL_PORTRAIT_MODULES]);
  await Promise.all(
    ALL_PORTRAIT_MODULES.map((mod) => {
      const asset = Asset.fromModule(mod);
      const uri = asset.localUri ?? asset.uri;
      return uri ? Image.prefetch(uri) : Promise.resolve(false);
    })
  );
  portraitsPreloaded = true;
}

function staffSource(kind: Exclude<PortraitKind, "player">, seed: string) {
  const h = hash(seed);
  if (kind === "coach") return COACH_PORTRAITS[h % COACH_PORTRAITS.length];
  if (kind === "president") return PRESIDENT_PORTRAITS[h % PRESIDENT_PORTRAITS.length];
  if (kind === "journalist") return JOURNALIST_PORTRAITS[h % JOURNALIST_PORTRAITS.length];
  return SD_PORTRAITS[h % SD_PORTRAITS.length];
}

/**
 * Player / staff portrait.
 * Outer ring = club colours; inner view clips the face (Android can't clip border+radius together).
 */
export function PersonPortrait({
  seed,
  size = 44,
  jersey,
  jerseySecondary,
  kind = "player",
  age,
  portraitId,
  nationalityId,
}: {
  seed: string;
  size?: number;
  /** Primary kit colour (ring) */
  jersey?: string;
  /** Secondary kit colour (preferred for ring when set) */
  jerseySecondary?: string;
  kind?: PortraitKind;
  age?: number;
  /** Stable index into player-01…28. */
  portraitId?: number;
  nationalityId?: string;
}) {
  const px = Math.max(16, Math.round(size));
  const portraitSeed = age != null ? `${seed}:${age}` : seed;

  let source;
  if (kind !== "player") {
    source = staffSource(kind, portraitSeed);
  } else {
    const idx =
      typeof portraitId === "number" && portraitId >= 0 && portraitId < PLAYER_PORTRAITS.length
        ? portraitId
        : portraitIdForPlayer(nationalityId ?? "RUS", seed);
    source = PLAYER_PORTRAITS[idx % PLAYER_PORTRAITS.length];
  }

  const primary = kind === "player" ? jersey : undefined;
  const secondary = kind === "player" ? jerseySecondary : undefined;
  const ringColor =
    primary && secondary && secondary !== primary ? secondary : primary ?? "transparent";
  const ringW = primary ? Math.max(2, Math.round(px * 0.06)) : 0;
  const inner = Math.max(1, px - ringW * 2);

  return (
    <View
      style={{
        width: px,
        height: px,
        borderRadius: px / 2,
        borderWidth: ringW,
        borderColor: ringColor,
        backgroundColor: ringColor !== "transparent" ? ringColor : "#1A9BB8",
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          overflow: "hidden",
          backgroundColor: "#1A9BB8",
        }}
      >
        <Image
          source={source}
          style={{ width: inner, height: inner }}
          resizeMode="cover"
        />
      </View>
    </View>
  );
}
