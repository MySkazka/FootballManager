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
  require("../../assets/portraits/player-29.png"),
  require("../../assets/portraits/player-30.png"),
  require("../../assets/portraits/player-31.png"),
  require("../../assets/portraits/player-32.png"),
  require("../../assets/portraits/player-33.png"),
  require("../../assets/portraits/player-34.png"),
  require("../../assets/portraits/player-35.png"),
  require("../../assets/portraits/player-36.png"),
  require("../../assets/portraits/player-37.png"),
  require("../../assets/portraits/player-38.png"),
  require("../../assets/portraits/player-39.png"),
  require("../../assets/portraits/player-40.png"),
  require("../../assets/portraits/player-41.png"),
  require("../../assets/portraits/player-42.png"),
  require("../../assets/portraits/player-43.png"),
  require("../../assets/portraits/player-44.png"),
  require("../../assets/portraits/player-45.png"),
  require("../../assets/portraits/player-46.png"),
  require("../../assets/portraits/player-47.png"),
  require("../../assets/portraits/player-48.png"),
  require("../../assets/portraits/player-49.png"),
  require("../../assets/portraits/player-50.png"),
  require("../../assets/portraits/player-51.png"),
  require("../../assets/portraits/player-52.png"),
  require("../../assets/portraits/player-53.png"),
  require("../../assets/portraits/player-54.png"),
  require("../../assets/portraits/player-55.png"),
  require("../../assets/portraits/player-56.png"),
  require("../../assets/portraits/player-57.png"),
  require("../../assets/portraits/player-58.png"),
  require("../../assets/portraits/player-59.png"),
  require("../../assets/portraits/player-60.png"),
  require("../../assets/portraits/player-61.png"),
  require("../../assets/portraits/player-62.png"),
  require("../../assets/portraits/player-63.png"),
  require("../../assets/portraits/player-64.png"),
  require("../../assets/portraits/player-65.png"),
  require("../../assets/portraits/player-66.png"),
  require("../../assets/portraits/player-67.png"),
  require("../../assets/portraits/player-68.png"),
  require("../../assets/portraits/player-69.png"),
  require("../../assets/portraits/player-70.png"),
  require("../../assets/portraits/player-71.png"),
  require("../../assets/portraits/player-72.png"),
  require("../../assets/portraits/player-73.png"),
  require("../../assets/portraits/player-74.png"),
  require("../../assets/portraits/player-75.png"),
  require("../../assets/portraits/player-76.png"),
  require("../../assets/portraits/player-77.png"),
  require("../../assets/portraits/player-78.png"),
  require("../../assets/portraits/player-79.png"),
  require("../../assets/portraits/player-80.png"),
  require("../../assets/portraits/player-81.png"),
  require("../../assets/portraits/player-82.png"),
  require("../../assets/portraits/player-83.png"),
  require("../../assets/portraits/player-84.png"),
  require("../../assets/portraits/player-85.png"),
  require("../../assets/portraits/player-86.png"),
  require("../../assets/portraits/player-87.png"),
  require("../../assets/portraits/player-88.png"),
  require("../../assets/portraits/player-89.png"),
  require("../../assets/portraits/player-90.png"),
  require("../../assets/portraits/player-91.png"),
  require("../../assets/portraits/player-92.png"),
  require("../../assets/portraits/player-93.png"),
  require("../../assets/portraits/player-94.png"),
  require("../../assets/portraits/player-95.png"),
  require("../../assets/portraits/player-96.png"),
  require("../../assets/portraits/player-97.png"),
  require("../../assets/portraits/player-98.png"),
  require("../../assets/portraits/player-99.png"),
  require("../../assets/portraits/player-100.png"),
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
  /** Stable index into player-01…100. */
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
