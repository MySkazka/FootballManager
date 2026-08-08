import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { averageRating, type PlayerSeasonStats } from "@fm/engine";
import {broadcast, registerThemeRebuild} from "./broadcastTheme";

export type OverviewStat = {
  label: string;
  value: number;
  color: string;
};

type FormRing = {
  /** 0–100 for the ring */
  percent: number;
  /** Large centre label, e.g. "78%" or "7.2" */
  primary: string;
  /** Small subtitle under primary */
  secondary: string;
  title: string;
};

type Props = {
  stats?: PlayerSeasonStats | null;
  isGk?: boolean;
  formRing: FormRing;
};

/** Season form → ring; falls back to overall-based readiness when no ratings. */
export function formRingFromStats(
  stats: PlayerSeasonStats | null | undefined,
  overall: number
): FormRing {
  if (stats && stats.ratingCount > 0) {
    const avg = averageRating(stats);
    // Match ratings ~4–10 → ring roughly 40–100
    const percent = Math.max(8, Math.min(100, Math.round(avg * 10)));
    return {
      percent,
      primary: `${percent}%`,
      secondary: `ср. ${avg.toFixed(1)}`,
      title: "Форма",
    };
  }
  const percent = Math.max(8, Math.min(99, Math.round(overall)));
  return {
    percent,
    primary: `${percent}`,
    secondary: "OVR",
    title: "Готовность",
  };
}

export function overviewStatsFromSeason(
  stats: PlayerSeasonStats | null | undefined,
  isGk: boolean
): OverviewStat[] {
  if (!stats) return [];
  const rows: OverviewStat[] = [];
  if (isGk) {
    if (stats.cleanSheets > 0 || stats.appearances > 0) {
      rows.push({ label: "Сухие", value: stats.cleanSheets, color: broadcast.accent });
    }
    if (stats.saves > 0) {
      rows.push({ label: "Сейвы", value: stats.saves, color: broadcast.zoneUecl });
    }
  } else {
    rows.push({ label: "Голы", value: stats.goals, color: broadcast.accent });
    rows.push({ label: "Передачи", value: stats.assists, color: "#C45B5B" });
  }
  rows.push({ label: "Матчи", value: stats.appearances, color: broadcast.zoneUecl });
  return rows;
}

function StatBar({ label, value, color, max }: OverviewStat & { max: number }) {
  const widthPct = max <= 0 ? 0 : Math.max(4, Math.min(100, (value / max) * 100));
  return (
    <View style={styles.statRow}>
      <View style={styles.statHead}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <View style={styles.statTrack}>
        <View style={[styles.statFill, { width: `${widthPct}%` as `${number}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function ConditionRing({ ring }: { ring: FormRing }) {
  const size = 108;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (ring.percent / 100) * c;
  return (
    <View style={styles.ringWrap}>
      <Text style={styles.ringTitle}>{ring.title}</Text>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={broadcast.chipBorder}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={broadcast.accent}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.ringCentre}>
          <Text style={styles.ringPrimary}>{ring.primary}</Text>
          <Text style={styles.ringSecondary}>{ring.secondary}</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Single clipped surface: top radii + overflow:hidden + uniform border.
 * (Asymmetric borderBottomWidth:0 with radius made RN draw a flat top chop;
 * shell/inner radius mismatch left corner artifacts.)
 */
export function PlayerOverviewCard({
  stats,
  isGk = false,
  formRing,
}: Props) {
  const rows = overviewStatsFromSeason(stats, isGk);
  const maxBar = Math.max(10, ...rows.map((r) => r.value), 1);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Обзор</Text>
      <View style={styles.cardBody}>
        <View style={styles.statsCol}>
          {rows.length === 0 ? (
            <Text style={styles.emptyStats}>Нет статистики сезона</Text>
          ) : (
            rows.map((r) => <StatBar key={r.label} {...r} max={maxBar} />)
          )}
        </View>
        <ConditionRing ring={formRing} />
      </View>
    </View>
  );
}

const TOP_RADIUS = broadcast.radiusXl;

function buildStyles() {
  return StyleSheet.create({
  card: {
    backgroundColor: broadcast.card,
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: broadcast.cardBorder,
    /** Full border — bottom is covered by playerPerf (marginTop: -12). */
    zIndex: 1,
    shadowColor: broadcast.cardGlow,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    minHeight: 56,
  },
  cardTitle: {
    color: broadcast.white,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    zIndex: 1,
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
    zIndex: 1,
  },
  statsCol: { flex: 1, gap: 14 },
  emptyStats: { color: broadcast.mistDim, fontSize: 13 },
  statRow: { gap: 4 },
  statHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  statLabel: { color: broadcast.mist, fontSize: 12, fontWeight: "600" },
  statValue: { color: broadcast.white, fontSize: 20, fontWeight: "800" },
  statTrack: {
    height: 3,
    backgroundColor: broadcast.chipBorder,
    borderRadius: 2,
    overflow: "hidden",
  },
  statFill: { height: 3, borderRadius: 2 },
  ringWrap: { alignItems: "center", gap: 4 },
  ringTitle: {
    color: broadcast.mistDim,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  ringCentre: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ringPrimary: { color: broadcast.white, fontSize: 22, fontWeight: "800" },
  ringSecondary: { color: broadcast.mistDim, fontSize: 11, marginTop: 2 },
});
}

let styles = buildStyles();
registerThemeRebuild(() => {
  styles = buildStyles();
});

