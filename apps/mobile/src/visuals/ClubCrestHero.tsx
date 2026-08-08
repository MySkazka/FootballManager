import { type ReactNode, useId, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import type { Club } from "@fm/engine";
import { ClubLogo } from "./ClubLogo";
import { broadcast, registerThemeRebuild } from "./broadcastTheme";

/**
 * Matches App `styles.root` / `playerHero` paddingTop.
 * Hero uses negative marginTop to cancel root inset so the crest field
 * paints under the status bar / Dynamic Island (content still padded).
 */
const STATUS_TOP = 56;

function CalendarGlyph({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      <Path
        d="M7 3.5 V6.5 M17 3.5 V6.5 M4.5 9.5 H19.5 M5.5 5.5 H18.5 C19.6 5.5 20.5 6.4 20.5 7.5 V18.5 C20.5 19.6 19.6 20.5 18.5 20.5 H5.5 C4.4 20.5 3.5 19.6 3.5 18.5 V7.5 C3.5 6.4 4.4 5.5 5.5 5.5 Z"
        fill="none"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Near-black plate that blends with the rest of the career screen. */
function ClubHeroBase({
  primary,
  secondary,
  width,
  height,
}: {
  primary: string;
  secondary: string;
  width: number;
  height: number;
}) {
  const uid = useId().replace(/:/g, "");
  const meshId = `clubMesh-${uid}`;
  const leftId = `flareL-${uid}`;
  const rightId = `flareR-${uid}`;
  const r = Math.max(width, height) * 0.52;

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Defs>
        <LinearGradient id={meshId} x1="0" y1="0" x2="1" y2="0.4">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.035" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.03" />
        </LinearGradient>
        <RadialGradient id={leftId} cx="6%" cy="94%" rx="55%" ry="68%" fx="6%" fy="94%">
          <Stop offset="0" stopColor={secondary} stopOpacity="0.42" />
          <Stop offset="0.4" stopColor={secondary} stopOpacity="0.14" />
          <Stop offset="1" stopColor={secondary} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id={rightId} cx="96%" cy="90%" rx="48%" ry="62%" fx="96%" fy="90%">
          <Stop offset="0" stopColor={primary} stopOpacity="0.4" />
          <Stop offset="0.45" stopColor={primary} stopOpacity="0.12" />
          <Stop offset="1" stopColor={primary} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill={broadcast.bgDeep} />
      <Rect x="0" y="0" width={width} height={height} fill={`url(#${meshId})`} />
      <Circle cx={width * 0.04} cy={height * 0.96} r={r} fill={`url(#${leftId})`} />
      <Circle cx={width * 0.96} cy={height * 0.92} r={r * 0.88} fill={`url(#${rightId})`} />
    </Svg>
  );
}

function ClubColorRule({
  primary,
  secondary,
  width,
}: {
  primary: string;
  secondary: string;
  width: number;
}) {
  const uid = useId().replace(/:/g, "");
  const id = `clubRule-${uid}`;
  const w = Math.max(72, Math.min(width * 0.55, 240));

  return (
    <Svg width={w} height={4} style={styles.colorRule}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={secondary} stopOpacity="1" />
          <Stop offset="0.48" stopColor={secondary} stopOpacity="1" />
          <Stop offset="0.52" stopColor={primary} stopOpacity="1" />
          <Stop offset="1" stopColor={primary} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="1" width={w} height="2" rx="1" fill={`url(#${id})`} />
    </Svg>
  );
}

/** Floating back chip — readable over the crest. */
export function CrestHeroBack({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.backChip, pressed && styles.backChipPressed]}
    >
      <Text style={styles.backChipText}>{label}</Text>
    </Pressable>
  );
}

export function ClubCrestHero({
  club,
  date,
  subtitle,
  lines,
  compact,
  slim,
  topLeft,
  style,
  children,
}: {
  club: Club;
  /** Game date — top-center, separate from club meta */
  date?: string;
  /** Bright meta under the title (city · euro …) — no date here */
  subtitle?: string;
  /** Extra bright meta lines (squad · budget …) */
  lines?: string[];
  compact?: boolean;
  /** Ultra-tight bar for tactics/stats — club name + one meta line */
  slim?: boolean;
  /** Back control — rendered as floating chip above the crest */
  topLeft?: ReactNode;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const primary = club.colors?.[0] || broadcast.accent;
  const secondary = club.colors?.[1] || "#4A90D9";
  const crestSize = slim ? 52 : compact ? 108 : 148;
  const showLines = slim ? [] : lines ?? [];

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) {
      setSize({ w: width, h: height });
    }
  };

  const ready = size.w > 0 && size.h > 0;

  return (
    <View
      onLayout={onLayout}
      pointerEvents="box-none"
      style={[
        styles.hero,
        compact && styles.heroCompact,
        slim && styles.heroSlim,
        topLeft ? styles.heroWithBack : null,
        date && !topLeft ? styles.heroWithDate : null,
        style,
      ]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        {ready ? (
          <ClubHeroBase
            primary={primary}
            secondary={secondary}
            width={size.w}
            height={size.h}
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: broadcast.bgDeep }]} />
        )}
      </View>

      {date ? (
        <View style={styles.dateCenter} pointerEvents="none">
          <View style={styles.dateRow}>
            <CalendarGlyph color={broadcast.accent} size={14} />
            <Text style={[styles.dateText, { color: broadcast.dateChipText }]}>{date}</Text>
          </View>
        </View>
      ) : null}

      {topLeft ? (
        <View style={styles.backFloat} pointerEvents="box-none">
          {topLeft}
        </View>
      ) : null}

      <View
        pointerEvents="none"
        style={[
          styles.crestFloat,
          compact && styles.crestFloatCompact,
          slim && styles.crestFloatSlim,
          { width: crestSize, height: crestSize },
        ]}
      >
        <ClubLogo club={club} size={crestSize} />
      </View>

      <View
        style={[styles.content, topLeft ? styles.contentWithBack : null, slim && styles.contentSlim]}
        pointerEvents="box-none"
      >
        <Text
          style={[
            styles.clubName,
            compact && styles.clubNameCompact,
            slim && styles.clubNameSlim,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
        >
          {club.name}
        </Text>
        {!slim ? (
          <ClubColorRule primary={primary} secondary={secondary} width={size.w || 280} />
        ) : null}
        {subtitle ? (
          <Text style={[styles.subtitle, slim && styles.subtitleSlim]} numberOfLines={slim ? 1 : 2}>
            {subtitle}
          </Text>
        ) : null}
        {showLines.map((line) => (
          <Text key={line} style={styles.meta} numberOfLines={2}>
            {line}
          </Text>
        ))}
        {children}
      </View>
    </View>
  );
}

function buildCrestHeroStyles() {
  return StyleSheet.create({
  hero: {
    marginHorizontal: -16,
    marginTop: -STATUS_TOP,
    marginBottom: 8,
    minHeight: 188 + STATUS_TOP,
    paddingHorizontal: 16,
    paddingTop: STATUS_TOP + 16,
    paddingBottom: 16,
    overflow: "hidden",
    borderRadius: 0,
    justifyContent: "flex-end",
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.chipBorder,
    backgroundColor: "transparent",
  },
  heroCompact: {
    minHeight: 172 + STATUS_TOP,
    paddingTop: STATUS_TOP + 12,
    paddingBottom: 14,
  },
  heroSlim: {
    minHeight: 56 + STATUS_TOP,
    paddingTop: STATUS_TOP + 8,
    paddingBottom: 8,
    marginBottom: 4,
  },
  heroWithBack: {
    paddingTop: STATUS_TOP + 44,
    minHeight: 118 + STATUS_TOP,
  },
  heroWithDate: {
    paddingTop: STATUS_TOP + 30,
  },
  dateCenter: {
    position: "absolute",
    top: STATUS_TOP + 8,
    left: 72,
    right: 108,
    alignItems: "center",
    zIndex: 40,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dateText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  crestFloat: {
    position: "absolute",
    right: 6,
    /** Clear theme toggle (~36px) under the status inset. */
    top: STATUS_TOP + 52,
    zIndex: 5,
  },
  crestFloatCompact: {
    right: 2,
    top: STATUS_TOP + 52,
  },
  crestFloatSlim: {
    right: 2,
    top: STATUS_TOP + 4,
  },
  backFloat: {
    position: "absolute",
    top: STATUS_TOP + 8,
    left: 12,
    zIndex: 100,
    elevation: 100,
  },
  backChip: {
    backgroundColor: broadcast.chipBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: broadcast.radiusPill,
    borderWidth: 1,
    borderColor: broadcast.chipBorder,
    minHeight: 36,
    justifyContent: "center",
  },
  backChipPressed: {
    opacity: 0.85,
  },
  backChipText: {
    color: broadcast.white,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  content: {
    zIndex: 20,
    maxWidth: "70%",
    gap: 3,
    paddingBottom: 2,
  },
  contentSlim: {
    maxWidth: "78%",
    gap: 0,
  },
  contentWithBack: {
    marginTop: 0,
  },
  clubName: {
    color: broadcast.white,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "800",
    fontStyle: "italic",
    letterSpacing: 0.15,
    textTransform: "uppercase",
  },
  clubNameCompact: {
    fontSize: 22,
    lineHeight: 26,
  },
  clubNameSlim: {
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.6,
    fontStyle: "normal",
  },
  colorRule: {
    marginTop: 4,
    marginBottom: 6,
  },
  subtitle: {
    marginTop: 2,
    color: broadcast.white,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    letterSpacing: 0.15,
    opacity: 0.92,
  },
  subtitleSlim: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: broadcast.mist,
  },
  meta: {
    color: broadcast.white,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    letterSpacing: 0.15,
    opacity: 0.9,
  },
  });
}

let styles = buildCrestHeroStyles();
registerThemeRebuild(() => {
  styles = buildCrestHeroStyles();
});
