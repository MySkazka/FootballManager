import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Club, LeagueTableRow } from "@fm/engine";
import { clubTableLabel } from "@fm/engine";
import { ClubLogo } from "./ClubLogo";
import { Flag } from "./Flag";
import {broadcast, type BroadcastZone, registerThemeRebuild} from "./broadcastTheme";

/**
 * Large smooth top-corner arc (~ref “desired left” crop).
 * Shell outer / face inner — border tracks the full quarter-circle on both sides.
 */
const BOARD_RADIUS = 50;
const BOARD_BORDER = 1;
const FACE_RADIUS = BOARD_RADIUS - BOARD_BORDER;
const BOARD_PAD_X = 16;
const BOARD_PAD_Y = 12;
/** Rows sit below header — not under the board arc; keep modest radii. */
const ROW_RADIUS = 14;
const ROW_RADIUS_MID = 10;
const ROW_H = 48;
const STAT_W = 22;
const GOALS_W = 40;

export type LeagueTableBoardRow = LeagueTableRow & {
  place: number;
  club: Club;
  zone?: BroadcastZone | null;
  isMine?: boolean;
};

type Props = {
  leagueName: string;
  season: string;
  federationId: string;
  rows: LeagueTableBoardRow[];
  onPressClub: (clubId: string) => void;
  /** Meta after season, e.g. «УЕФА 20-е · зоны еврокубков» */
  subtitle?: string;
  footer?: ReactNode;
};

function zoneColor(zone?: BroadcastZone | null): string | undefined {
  if (zone === "ucl") return broadcast.zoneUcl;
  if (zone === "uel") return broadcast.zoneUel;
  if (zone === "uecl") return broadcast.zoneUecl;
  return undefined;
}

function DarkRow({
  row,
  onPress,
  isFirst,
  isLast,
}: {
  row: LeagueTableBoardRow;
  onPress: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const zc = zoneColor(row.zone);
  const label = clubTableLabel(row.club, 16);
  const topR = isFirst ? ROW_RADIUS : ROW_RADIUS_MID;
  const bottomR = isLast ? ROW_RADIUS : ROW_RADIUS_MID;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderTopLeftRadius: topR,
          borderTopRightRadius: topR,
          borderBottomLeftRadius: bottomR,
          borderBottomRightRadius: bottomR,
        },
        row.isMine && styles.rowMine,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${row.place}. ${row.club.name}, ${row.played} игр, ${row.points} очков`}
    >
      {zc ? <View style={[styles.zoneBar, { backgroundColor: zc }]} /> : <View style={styles.zoneSpacer} />}
      <View style={styles.rowBody}>
        <View style={styles.leftPane}>
          <Text style={styles.rank}>{row.place}</Text>
          <View style={styles.crest}>
            <ClubLogo club={row.club} size={22} />
          </View>
          <View style={styles.nameCol}>
            <Text style={styles.clubName} numberOfLines={1}>
              {label}
            </Text>
          </View>
        </View>
        <View style={styles.statsPane}>
          <Text style={styles.statCell}>{row.played}</Text>
          <Text style={styles.statCell}>{row.won}</Text>
          <Text style={styles.statCell}>{row.drawn}</Text>
          <Text style={styles.statCell}>{row.lost}</Text>
          <Text style={[styles.statCell, styles.statGoals]}>
            {row.gf}:{row.ga}
          </Text>
          <Text style={[styles.statCell, styles.statPts]}>{row.points}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Dark premium league board.
 * Shell: neon border + glow (no overflow). Face: matching radius + clip.
 * Large quarter-circle on both top corners — border follows the full arc.
 */
export function LeagueTableBoard({
  leagueName,
  season,
  federationId,
  rows,
  onPressClub,
  subtitle,
  footer,
}: Props) {
  const lastIndex = rows.length - 1;

  return (
    <View style={styles.shell}>
      <View style={styles.face}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text
              style={styles.leagueTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {leagueName}
            </Text>
            <View style={styles.flagWrap}>
              <Flag federationId={federationId} size="md" />
            </View>
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {[season, subtitle].filter(Boolean).join(" · ")}
          </Text>
        </View>

        <View style={styles.colHead}>
          <Text style={[styles.colHeadText, styles.colHeadHash]}>#</Text>
          <Text style={[styles.colHeadText, styles.colHeadTeam]}>КЛУБ</Text>
          <Text style={styles.colHeadStat}>И</Text>
          <Text style={styles.colHeadStat}>В</Text>
          <Text style={styles.colHeadStat}>Н</Text>
          <Text style={styles.colHeadStat}>П</Text>
          <Text style={[styles.colHeadStat, styles.colHeadGoals]}>М</Text>
          <Text style={styles.colHeadStat}>О</Text>
        </View>

        <View style={styles.list}>
          {rows.map((row, index) => (
            <DarkRow
              key={row.clubId}
              row={row}
              isFirst={index === 0}
              isLast={index === lastIndex}
              onPress={() => onPressClub(row.clubId)}
            />
          ))}
        </View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </View>
  );
}

function buildStyles() {
  return StyleSheet.create({
  /**
   * Shell: identical L/R radius + neon border/glow.
   * No negative horizontal margin — parent ScrollView/root pad would clip
   * the outer quarter-circle and look like a sharp side cut.
   */
  shell: {
    marginTop: 8,
    borderRadius: BOARD_RADIUS,
    borderTopLeftRadius: BOARD_RADIUS,
    borderTopRightRadius: BOARD_RADIUS,
    borderBottomLeftRadius: BOARD_RADIUS,
    borderBottomRightRadius: BOARD_RADIUS,
    borderWidth: BOARD_BORDER,
    borderColor: broadcast.cardBorder,
    shadowColor: broadcast.cardGlow,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  /** Face clips fill to the inner curve — same L/R arc as the border. */
  face: {
    backgroundColor: broadcast.card,
    borderRadius: FACE_RADIUS,
    borderTopLeftRadius: FACE_RADIUS,
    borderTopRightRadius: FACE_RADIUS,
    borderBottomLeftRadius: FACE_RADIUS,
    borderBottomRightRadius: FACE_RADIUS,
    overflow: "hidden",
    position: "relative",
    paddingHorizontal: BOARD_PAD_X,
    paddingTop: BOARD_PAD_Y,
    paddingBottom: BOARD_PAD_Y,
  },
  /**
   * Header bleeds to face top; matching top radii + overflow so the wash
   * follows the same L/R arc. Extra inset keeps title/flag clear of the arc.
   */
  header: {
    marginTop: -BOARD_PAD_Y,
    marginHorizontal: -BOARD_PAD_X,
    marginBottom: 8,
    paddingHorizontal: BOARD_PAD_X + 10,
    paddingTop: BOARD_PAD_Y + 8,
    paddingBottom: 8,
    gap: 4,
    borderTopLeftRadius: FACE_RADIUS,
    borderTopRightRadius: FACE_RADIUS,
    overflow: "hidden",
    zIndex: 1,
    backgroundColor: broadcast.surfaceElevated,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    zIndex: 1,
  },
  /** Keep flag inside the TR arc — not flush to the curve. */
  flagWrap: {
    zIndex: 1,
    marginRight: 6,
  },
  leagueTitle: {
    flex: 1,
    minWidth: 0,
    color: broadcast.white,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.6,
    lineHeight: 18,
    textTransform: "uppercase",
  },
  meta: {
    color: broadcast.mistDim,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    lineHeight: 14,
    zIndex: 1,
  },
  colHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingBottom: 8,
    zIndex: 1,
  },
  colHeadText: {
    color: broadcast.mistDim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  colHeadHash: { width: 28, textAlign: "center" },
  colHeadTeam: { flex: 1, marginLeft: 4 },
  colHeadStat: {
    width: STAT_W,
    color: broadcast.mistDim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  colHeadGoals: {
    width: GOALS_W,
  },
  list: {
    gap: 6,
    zIndex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    height: ROW_H,
    backgroundColor: broadcast.surfaceElevated,
    overflow: "hidden",
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowMine: {
    backgroundColor: broadcast.rowRightMine,
    borderWidth: 1,
    borderColor: broadcast.accentSoft,
  },
  zoneBar: {
    width: 3,
    marginLeft: 6,
    marginVertical: 10,
    borderRadius: 2,
  },
  zoneSpacer: {
    width: 3,
    marginLeft: 6,
  },
  rowBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    minWidth: 0,
  },
  leftPane: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    paddingLeft: 6,
    paddingRight: 8,
  },
  rank: {
    width: 22,
    color: broadcast.mist,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  crest: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  clubName: {
    color: broadcast.white,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  statsPane: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: broadcast.surfaceAlt,
    paddingHorizontal: 4,
    paddingLeft: 6,
  },
  statCell: {
    width: STAT_W,
    color: broadcast.mist,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  statGoals: {
    width: GOALS_W,
    fontSize: 11,
  },
  statPts: {
    color: broadcast.white,
    fontWeight: "800",
    fontSize: 14,
  },
  footer: {
    marginTop: 14,
    zIndex: 1,
  },
});
}

let styles = buildStyles();
registerThemeRebuild(() => {
  styles = buildStyles();
});

