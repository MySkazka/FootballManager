import { Image, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  G,
  Path,
  Rect,
} from "react-native-svg";
import type { Club } from "@fm/engine";
import { ClubLogo } from "./ClubLogo";
import { registerThemeRebuild } from "./broadcastTheme";

const MEDAL_SILVER_IMG = require("../../assets/season/medal-silver.png");
const MEDAL_BRONZE_IMG = require("../../assets/season/medal-bronze.png");
/** Photoreal reference-style stage (red/gold diagonals, stadium wash). */
const HERO_STAGE_IMG = require("../../assets/season/hero-stage.jpg");

export type SeasonHeroKind = "champion" | "silver" | "bronze" | "place";

export function seasonHeroKind(place: number): SeasonHeroKind {
  if (place === 1) return "champion";
  if (place === 2) return "silver";
  if (place === 3) return "bronze";
  return "place";
}

/** Clean symmetric flat gold trophy (reference card style). */
export function FlatTrophyIcon({ size = 44, color = "#E8C45A" }: { size?: number; color?: string }) {
  const shine = "#FFF3C0";
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* left handle */}
      <Path
        d="M15 11 C8 11 7 16.5 7 19.5 C7 24 11 26.5 15 26"
        fill="none"
        stroke={color}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      {/* right handle — mirror of left */}
      <Path
        d="M33 11 C40 11 41 16.5 41 19.5 C41 24 37 26.5 33 26"
        fill="none"
        stroke={color}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      {/* cup body */}
      <Path
        d="M15 9 H33 V18.5 C33 24 29.2 28.5 24 28.5 C18.8 28.5 15 24 15 18.5 Z"
        fill={color}
      />
      {/* inner shine */}
      <Path
        d="M18 11.5 H30 V17.5 C30 20.5 27.3 23 24 23 C20.7 23 18 20.5 18 17.5 Z"
        fill={shine}
        opacity={0.32}
      />
      {/* stem */}
      <Rect x="22" y="28.5" width="4" height="7.5" rx="1" fill={color} />
      {/* knop */}
      <Rect x="19.5" y="35.5" width="9" height="2.2" rx="1" fill={color} />
      {/* base */}
      <Rect x="14" y="38.5" width="20" height="4" rx="1.6" fill={color} />
    </Svg>
  );
}

function FlatMedalIcon({
  size = 44,
  tone,
}: {
  size?: number;
  tone: "silver" | "bronze";
}) {
  const metal = tone === "silver" ? "#D0D7E2" : "#D0924A";
  const deep = tone === "silver" ? "#8A93A3" : "#8A5520";
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path d="M18 4 L14 22 L22 20 L24 6 Z" fill={deep} />
      <Path d="M30 4 L34 22 L26 20 L24 6 Z" fill={metal} />
      <Circle cx="24" cy="30" r="14" fill={metal} />
      <Circle cx="24" cy="30" r="10" fill="none" stroke={deep} strokeWidth="2" />
      <Path
        d="M24 22 L26 27 L31 27 L27 30 L28.5 35 L24 32 L19.5 35 L21 30 L17 27 L22 27 Z"
        fill={deep}
        opacity={0.85}
      />
    </Svg>
  );
}

function PlaceMarkIcon({ place, size = 44 }: { place: number; size?: number }) {
  return (
    <View style={[iconStyles.placeWell, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[iconStyles.placeWellText, { fontSize: size * 0.38 }]}>{place}</Text>
    </View>
  );
}

export function SeasonAwardLeadingIcon({ place, size = 48 }: { place: number; size?: number }) {
  if (place === 1) return <FlatTrophyIcon size={size} />;
  if (place === 2) return <FlatMedalIcon size={size} tone="silver" />;
  if (place === 3) return <FlatMedalIcon size={size} tone="bronze" />;
  return <PlaceMarkIcon place={place} size={size} />;
}

function GoldStar({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2.5 L14.6 9 L21.5 9.5 L16.2 13.8 L17.9 20.7 L12 16.9 L6.1 20.7 L7.8 13.8 L2.5 9.5 L9.4 9 Z"
        fill="#E8C45A"
      />
    </Svg>
  );
}

/** Stat well icons from the reference card. */
export function AwardsStatIcon({ kind }: { kind: "star" | "trend" | "ball" }) {
  const c = "#E8C45A";
  return (
    <View style={iconStyles.statWell}>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        {kind === "star" ? (
          <Path
            d="M12 3 L14.2 8.6 L20.2 9 L15.6 12.8 L17.1 18.6 L12 15.6 L6.9 18.6 L8.4 12.8 L3.8 9 L9.8 8.6 Z"
            fill={c}
          />
        ) : null}
        {kind === "trend" ? (
          <G>
            <Path
              d="M4 16 L10 10 L13.5 13.5 L20 6"
              stroke={c}
              strokeWidth="2.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M14.5 6 H20 V11.5"
              stroke={c}
              strokeWidth="2.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </G>
        ) : null}
        {kind === "ball" ? (
          <G>
            <Circle cx="12" cy="12" r="8.2" stroke={c} strokeWidth="2" fill="none" />
            <Path
              d="M12 3.8 C14.2 7 14.2 17 12 20.2 M12 3.8 C9.8 7 9.8 17 12 20.2 M4.2 10 H19.8 M4.2 14 H19.8"
              stroke={c}
              strokeWidth="1.35"
              fill="none"
            />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

type HeroProps = {
  club: Club;
  place: number;
  height?: number;
};

/**
 * Gold dotted diagonal bars (reference right-side LED streaks).
 */
function GoldDiagonalOverlay() {
  const bars = [0, 1, 2, 3, 4, 5];
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 360 248"
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
    >
      {bars.map((bar) => {
        // Bottom-center → top-right, parallel offsets (reference gold diagonals)
        const x0 = 168 + bar * 16;
        const y0 = 220 - bar * 5;
        const x1 = 370 + bar * 8;
        const y1 = 20 - bar * 7;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const steps = 32;
        const dots = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const fade = Math.sin(t * Math.PI);
          if (fade < 0.08) continue;
          dots.push(
            <Circle
              key={`${bar}-${i}`}
              cx={x0 + dx * t}
              cy={y0 + dy * t}
              r={1.35 + fade * 1.6}
              fill="#F0D060"
              opacity={0.35 + fade * 0.65}
            />
          );
        }
        return (
          <G key={`gold-bar-${bar}`}>
            <Path
              d={`M${x0} ${y0} L${x1} ${y1}`}
              stroke="#E8C45A"
              strokeWidth={7}
              opacity={0.12}
              strokeLinecap="round"
            />
            {dots}
          </G>
        );
      })}
      {/* thin solid gold speed lines for extra punch */}
      <Path d="M200 200 L355 55" stroke="#F5E08A" strokeWidth="1.6" opacity={0.55} strokeLinecap="round" />
      <Path d="M215 215 L360 70" stroke="#F5E08A" strokeWidth="1.1" opacity={0.4} strokeLinecap="round" />
      <Path d="M185 190 L340 50" stroke="#E8C45A" strokeWidth="1.3" opacity={0.35} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * 1:1 reference hero: photographic stage + explicit gold diagonals + club crest.
 */
export function SeasonResultsHero({ club, place, height = 248 }: HeroProps) {
  const kind = seasonHeroKind(place);
  const primary = club.colors?.[0] || "#C62828";

  return (
    <View style={[heroStyles.wrap, { height }]}>
      <Image source={HERO_STAGE_IMG} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      {/* Soft brand tint — keep low so gold lines stay visible */}
      <View
        pointerEvents="none"
        style={[heroStyles.tint, { backgroundColor: primary, opacity: 0.1 }]}
      />
      <GoldDiagonalOverlay />

      <View style={heroStyles.stage} pointerEvents="none">
        {kind === "champion" ? (
          <View style={heroStyles.crestStack}>
            <View style={heroStyles.starAbove}>
              <GoldStar size={24} />
            </View>
            <View style={[heroStyles.crestGlow, { shadowColor: "#E8C45A" }]}>
              <ClubLogo club={club} size={148} />
            </View>
          </View>
        ) : null}

        {kind === "silver" || kind === "bronze" ? (
          <View style={heroStyles.crestStack}>
            <View style={[heroStyles.crestGlow, { shadowColor: primary }]}>
              <ClubLogo club={club} size={132} />
            </View>
            <Image
              source={kind === "silver" ? MEDAL_SILVER_IMG : MEDAL_BRONZE_IMG}
              style={heroStyles.medalFloat}
              resizeMode="contain"
            />
          </View>
        ) : null}

        {kind === "place" ? (
          <View style={heroStyles.placeRow}>
            <View style={[heroStyles.crestGlow, { shadowColor: primary }]}>
              <ClubLogo club={club} size={124} />
            </View>
            <View style={heroStyles.placeChip}>
              <Text style={heroStyles.placeNum}>{place}</Text>
              <Text style={heroStyles.placeSuffix}>-е</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

type PanelProps = {
  club: Club;
  place: number;
  placeLabel: string;
  clubName: string;
  points: number;
  gd: number;
  played: number;
};

/** Hero + stats card stacked exactly like the reference. */
export function SeasonAwardsPanel({
  club,
  place,
  placeLabel,
  clubName,
  points,
  gd,
  played,
}: PanelProps) {
  const primary = club.colors?.[0] || "#C62828";
  const gdText = `${gd > 0 ? "+" : ""}${gd}`;

  return (
    <View style={panelStyles.root}>
      <SeasonResultsHero club={club} place={place} height={248} />

      <View style={[panelStyles.card, { borderColor: primary, shadowColor: primary }]}>
        <View style={panelStyles.titleRow}>
          <SeasonAwardLeadingIcon place={place} size={48} />
          <View style={panelStyles.titleText}>
            <Text style={panelStyles.placeLabel}>{placeLabel}</Text>
            <Text style={panelStyles.clubName} numberOfLines={1}>
              {clubName}
            </Text>
          </View>
        </View>

        <View style={panelStyles.statsRow}>
          <View style={panelStyles.statCol}>
            <AwardsStatIcon kind="star" />
            <Text style={panelStyles.statValue}>{points}</Text>
            <Text style={panelStyles.statLabel}>очков</Text>
          </View>
          <View style={panelStyles.vRule} />
          <View style={panelStyles.statCol}>
            <AwardsStatIcon kind="trend" />
            <Text style={panelStyles.statValue}>{gdText}</Text>
            <Text style={panelStyles.statLabel}>разница</Text>
          </View>
          <View style={panelStyles.vRule} />
          <View style={panelStyles.statCol}>
            <AwardsStatIcon kind="ball" />
            <Text style={panelStyles.statValue}>{played}</Text>
            <Text style={panelStyles.statLabel}>матчей</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** @deprecated */
export function SeasonAwardBadge({ place, size = 48 }: { place: number; size?: number }) {
  return <SeasonAwardLeadingIcon place={place} size={size} />;
}

/** @deprecated */
export function SeasonCelebrationArt(props: { club: Club; height?: number }) {
  return <SeasonResultsHero club={props.club} place={1} height={props.height} />;
}

export function trophyKindForAwards(_leagueId: string, place: number): SeasonHeroKind {
  return seasonHeroKind(place);
}

const iconStyles = StyleSheet.create({
  statWell: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232, 196, 90, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(232, 196, 90, 0.4)",
  },
  placeWell: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  placeWellText: {
    color: "#fff",
    fontWeight: "800",
  },
});

const heroStyles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
  },
  stage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 18,
  },
  crestStack: {
    alignItems: "center",
    justifyContent: "center",
    width: 210,
    height: 180,
  },
  starAbove: {
    marginBottom: 4,
    zIndex: 2,
  },
  crestGlow: {
    shadowOpacity: 0.75,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  medalFloat: {
    position: "absolute",
    right: -10,
    bottom: 0,
    width: 92,
    height: 92,
    zIndex: 3,
  },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  placeChip: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  placeNum: {
    color: "#fff",
    fontSize: 40,
    fontWeight: "800",
    lineHeight: 44,
    fontVariant: ["tabular-nums"],
  },
  placeSuffix: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 5,
    marginLeft: 2,
  },
});

function buildPanelStyles() {
  return StyleSheet.create({
    root: {
      gap: 12,
    },
    card: {
      borderRadius: 18,
      borderWidth: 1.5,
      backgroundColor: "#0B0F14",
      paddingTop: 16,
      paddingBottom: 14,
      paddingHorizontal: 14,
      gap: 14,
      shadowOpacity: 0.4,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 0 },
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    titleText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    placeLabel: {
      color: "#E8C45A",
      fontSize: 24,
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    clubName: {
      color: "#FFFFFF",
      fontSize: 17,
      fontWeight: "700",
    },
    statsRow: {
      flexDirection: "row",
      alignItems: "stretch",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(255,255,255,0.1)",
      paddingTop: 14,
    },
    statCol: {
      flex: 1,
      alignItems: "center",
      gap: 5,
    },
    vRule: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: "rgba(255,255,255,0.12)",
      marginVertical: 2,
    },
    statValue: {
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
      marginTop: 2,
    },
    statLabel: {
      color: "rgba(255,255,255,0.45)",
      fontSize: 11,
      fontWeight: "600",
    },
  });
}

let panelStyles = buildPanelStyles();
registerThemeRebuild(() => {
  panelStyles = buildPanelStyles();
});
