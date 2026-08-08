import { Asset } from "expo-asset";
import { Image, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import {
  COACH_FACE_PORTRAIT_IDS,
  isValidPortraitId,
  portraitIdForPlayer,
} from "@fm/engine";

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

/** Dedicated staff art + expanded mature face pack (must match coachPortraitPoolSize()). */
const COACH_PORTRAITS = [
  require("../../assets/portraits/coach-01.png"),
  require("../../assets/portraits/staff-03.png"),
  require("../../assets/portraits/staff-01.png"),
  ...COACH_FACE_PORTRAIT_IDS.map((id) => PLAYER_PORTRAITS[id]),
] as const;

/**
 * Adult player-pack faces without figurine pedestals — look like people, not chips.
 * 0-based → player-(id+1).png
 */
const EXEC_FACE_PORTRAIT_IDS = [
  36, // bald mustache
  19,
  6,
  45, // white buzz beard
  72, // fade curly
  62, // white streak
  44, // purple hair mature
  70, // raven long
  14,
  27,
  57, // sandy
  88,
  91,
  28,
  48, // high-top
  73, // mutton chops
  11,
  17,
  23,
  25,
  34,
  37,
  42,
  49,
  58,
  69,
] as const;

/**
 * Presidents: formal dedicated art first, then adult faces (no pedestal busts).
 * Do not use STAFF_EXEC / figurine-on-base player arts — they read as game chips.
 */
const PRESIDENT_PORTRAITS = [
  require("../../assets/portraits/staff-01.png"),
  require("../../assets/portraits/staff-02.png"),
  require("../../assets/portraits/coach-01.png"),
  require("../../assets/portraits/staff-03.png"),
  ...EXEC_FACE_PORTRAIT_IDS.map((id) => PLAYER_PORTRAITS[id]),
] as const;

const JOURNALIST_PORTRAITS = [
  require("../../assets/portraits/staff-02.png"),
  require("../../assets/portraits/staff-01.png"),
  require("../../assets/portraits/coach-01.png"),
  require("../../assets/portraits/staff-03.png"),
  PLAYER_PORTRAITS[19],
  PLAYER_PORTRAITS[14],
  PLAYER_PORTRAITS[27],
  PLAYER_PORTRAITS[57],
  PLAYER_PORTRAITS[10],
  PLAYER_PORTRAITS[22],
] as const;

/** Sporting directors: offset mix so they rarely collide with presidents. */
const SD_PORTRAITS = [
  require("../../assets/portraits/staff-03.png"),
  require("../../assets/portraits/staff-02.png"),
  require("../../assets/portraits/staff-01.png"),
  require("../../assets/portraits/coach-01.png"),
  ...[...EXEC_FACE_PORTRAIT_IDS].reverse().map((id) => PLAYER_PORTRAITS[id]),
] as const;

let portraitsPreloaded = false;

/** Warm a small slice of portraits — full pack is ~100 files; lists virtualize the rest. */
export async function preloadPortraits(): Promise<void> {
  if (portraitsPreloaded) return;
  const warm = [
    ...PLAYER_PORTRAITS.slice(0, 12),
    ...COACH_PORTRAITS,
    ...PRESIDENT_PORTRAITS,
    ...JOURNALIST_PORTRAITS,
    ...SD_PORTRAITS,
  ];
  await Asset.loadAsync([...warm]);
  await Promise.all(
    warm.map((mod) => {
      const asset = Asset.fromModule(mod);
      const uri = asset.localUri ?? asset.uri;
      return uri ? Image.prefetch(uri) : Promise.resolve(false);
    })
  );
  portraitsPreloaded = true;
}

function poolForKind(kind: Exclude<PortraitKind, "player">) {
  if (kind === "coach") return COACH_PORTRAITS;
  if (kind === "president") return PRESIDENT_PORTRAITS;
  if (kind === "journalist") return JOURNALIST_PORTRAITS;
  return SD_PORTRAITS;
}

function staffSource(
  kind: Exclude<PortraitKind, "player">,
  seed: string,
  portraitId?: number
) {
  const pool = poolForKind(kind);
  if (typeof portraitId === "number" && Number.isInteger(portraitId) && portraitId >= 0) {
    return pool[portraitId % pool.length];
  }
  return pool[hash(seed) % pool.length];
}

/** Tiny home-kit badge — primary body, secondary collar/sleeve accents. */
export function KitBadge({
  primary,
  secondary,
  size = 28,
}: {
  primary: string;
  secondary?: string;
  size?: number;
}) {
  const accent = secondary && secondary !== primary ? secondary : "#FFFFFF";
  const stroke = "#0E1512";
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path
        d="M6 8 L11 5 L13 9 L16 7 L19 9 L21 5 L26 8 L28 12 L24 14 L24 28 L8 28 L8 14 L4 12 Z"
        fill={primary}
        stroke={stroke}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <Path d="M13 9 L16 7 L19 9 L19 12 L13 12 Z" fill={accent} />
      <Rect x="15" y="12" width="2" height="12" rx="0.6" fill={accent} opacity={0.9} />
      <Path d="M8 14 L4 12 L6 8 L8 10 Z" fill={accent} opacity={0.85} />
      <Path d="M24 14 L28 12 L26 8 L24 10 Z" fill={accent} opacity={0.85} />
    </Svg>
  );
}

/**
 * Player pack IDs (0-based → player-(id+1).png) with a figurine pedestal / flat
 * bust base — read as “chips” if shown full-frame. Stronger face crop hides the base.
 * Includes elderly STAFF_EXEC faces formerly used for presidents / SDs.
 */
const PEDESTAL_PLAYER_PORTRAIT_IDS = new Set<number>([
  38, 39, 40, 46, 47, 51, 52, 53, 55, 56, 59, 60, 63, 65, 66, 67, 71, 75, 81, 82,
  83, 84, 86, 87, 89, 93, 97, 98, 99,
]);

/** Default player face crop: zoom + shift down so pedestal bases exit the circle. */
const PLAYER_FACE_SCALE = 1.2;
const PLAYER_FACE_SHIFT_Y = 0.08;
/** Stronger crop for known pedestal assets. */
const PLAYER_PEDESTAL_SCALE = 1.28;
const PLAYER_PEDESTAL_SHIFT_Y = 0.1;
/** Mild crop when staff roles reuse a player-pack face (hide shoulders / base). */
const STAFF_FACE_SCALE = 1.18;
const STAFF_FACE_SHIFT_Y = 0.07;

/**
 * Player / staff portrait.
 * Kit ring = club primary (home) with secondary accent; face clipped inside.
 * Player faces are slightly zoomed/shifted so figurine pedestals clip out.
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
  showKitBadge = false,
}: {
  seed: string;
  size?: number;
  /** Primary home kit colour (main ring) */
  jersey?: string;
  /** Secondary kit colour (outer accent ring) */
  jerseySecondary?: string;
  kind?: PortraitKind;
  age?: number;
  /** Stable index into player-01…100. */
  portraitId?: number;
  nationalityId?: string;
  /** Show a small jersey badge over the portrait (profile hero). */
  showKitBadge?: boolean;
}) {
  const px = Math.max(16, Math.round(size));
  const portraitSeed = age != null ? `${seed}:${age}` : seed;

  let source;
  let playerIdx: number | null = null;
  if (kind !== "player") {
    source = staffSource(kind, portraitSeed, portraitId);
  } else {
    playerIdx = isValidPortraitId(portraitId)
      ? portraitId
      : portraitIdForPlayer(nationalityId ?? "RUS", seed);
    source = PLAYER_PORTRAITS[playerIdx % PLAYER_PORTRAITS.length];
  }

  const primary = kind === "player" ? jersey : undefined;
  const secondary = kind === "player" ? jerseySecondary : undefined;
  const hasKit = !!primary;
  const accent =
    secondary && secondary !== primary ? secondary : undefined;
  const mainRingW = hasKit ? Math.max(2, Math.round(px * 0.055)) : 0;
  const accentRingW = accent ? Math.max(2, Math.round(px * 0.035)) : 0;
  const totalRing = mainRingW + accentRingW;
  const inner = Math.max(1, px - totalRing * 2);
  const badgeSize = Math.max(22, Math.round(px * 0.22));

  const playerPackIdx =
    kind === "player"
      ? playerIdx
      : PLAYER_PORTRAITS.findIndex((mod) => mod === source);
  const fromPlayerPack = playerPackIdx != null && playerPackIdx >= 0;
  const pedestal =
    fromPlayerPack &&
    PEDESTAL_PLAYER_PORTRAIT_IDS.has(playerPackIdx % PLAYER_PORTRAITS.length);

  let faceScale = 1;
  let faceShiftY = 0;
  if (kind === "player") {
    faceScale = pedestal ? PLAYER_PEDESTAL_SCALE : PLAYER_FACE_SCALE;
    faceShiftY = pedestal ? PLAYER_PEDESTAL_SHIFT_Y : PLAYER_FACE_SHIFT_Y;
  } else if (fromPlayerPack) {
    faceScale = pedestal ? PLAYER_PEDESTAL_SCALE : STAFF_FACE_SCALE;
    faceShiftY = pedestal ? PLAYER_PEDESTAL_SHIFT_Y : STAFF_FACE_SHIFT_Y;
  }
  const cropFace = faceScale !== 1 || faceShiftY !== 0;
  const imgSize = Math.round(inner * faceScale);
  const imgOffset = Math.round((inner - imgSize) / 2 + inner * faceShiftY);

  return (
    <View style={{ width: px, height: px, flexShrink: 0 }}>
      <View
        style={{
          width: px,
          height: px,
          borderRadius: px / 2,
          borderWidth: accentRingW,
          borderColor: accent ?? "transparent",
          backgroundColor: accent ?? "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: px - accentRingW * 2,
            height: px - accentRingW * 2,
            borderRadius: (px - accentRingW * 2) / 2,
            borderWidth: mainRingW,
            borderColor: primary ?? "transparent",
            backgroundColor: primary ?? "#1A9BB8",
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
              style={
                cropFace
                  ? {
                      position: "absolute",
                      width: imgSize,
                      height: imgSize,
                      left: Math.round((inner - imgSize) / 2),
                      top: imgOffset,
                    }
                  : { width: inner, height: inner }
              }
              resizeMode="cover"
            />
          </View>
        </View>
      </View>
      {showKitBadge && primary ? (
        <View
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize * 0.28,
            backgroundColor: "#0E1512",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1.5,
            borderColor: "rgba(255,255,255,0.35)",
          }}
        >
          <KitBadge primary={primary} secondary={secondary} size={badgeSize - 6} />
        </View>
      ) : null}
    </View>
  );
}
