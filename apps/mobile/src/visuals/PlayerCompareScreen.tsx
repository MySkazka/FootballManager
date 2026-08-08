import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ATTRIBUTE_LABEL,
  averageRating,
  formatMarketValue,
  formatWage,
  playerDisplayName,
  preferredRoleLabel,
  primaryPosition,
  rolesLabel,
  type CareerSave,
  type Club,
  type Player,
  type PlayerAttributes,
  type WorldPack,
} from "@fm/engine";
import {broadcast, registerThemeRebuild} from "./broadcastTheme";
import { PersonPortrait } from "./PersonPortrait";
import { PlayerRadar, radarAxesForPlayer } from "./PlayerRadar";

type Winner = "a" | "b" | "tie";

type CompareRow = {
  key: string;
  label: string;
  aText: string;
  bText: string;
  aNum?: number;
  bNum?: number;
  lowerIsBetter?: boolean;
};

const OUTFIELD_KEYS: (keyof PlayerAttributes)[] = [
  "pace",
  "shooting",
  "passing",
  "dribbling",
  "defending",
  "physical",
];

const GK_KEYS: (keyof PlayerAttributes)[] = [
  "goalkeeping",
  "physical",
  "passing",
  "pace",
  "defending",
  "shooting",
];

function winnerOf(a?: number, b?: number, lowerIsBetter = false): Winner {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return "tie";
  if (a === b) return "tie";
  if (lowerIsBetter) return a < b ? "a" : "b";
  return a > b ? "a" : "b";
}

function buildRows(a: Player, b: Player, save: CareerSave): CompareRow[] {
  const statsA = save.playerStats?.[a.id];
  const statsB = save.playerStats?.[b.id];
  const isGkBoth = primaryPosition(a) === "GK" && primaryPosition(b) === "GK";
  const attrKeys = isGkBoth ? GK_KEYS : OUTFIELD_KEYS;

  const rows: CompareRow[] = [
    {
      key: "overall",
      label: "Общий",
      aText: String(a.overall),
      bText: String(b.overall),
      aNum: a.overall,
      bNum: b.overall,
    },
    {
      key: "age",
      label: "Возраст",
      aText: String(a.age),
      bText: String(b.age),
      aNum: a.age,
      bNum: b.age,
      lowerIsBetter: true,
    },
    {
      key: "roles",
      label: "Роли",
      aText: rolesLabel(a),
      bText: rolesLabel(b),
    },
    {
      key: "value",
      label: "Стоимость",
      aText: formatMarketValue(a.marketValue),
      bText: formatMarketValue(b.marketValue),
      aNum: a.marketValue ?? 0,
      bNum: b.marketValue ?? 0,
    },
    {
      key: "wage",
      label: "Зарплата",
      aText: formatWage(a.wage),
      bText: formatWage(b.wage),
      aNum: a.wage ?? 0,
      bNum: b.wage ?? 0,
    },
  ];

  for (const key of attrKeys) {
    rows.push({
      key: `attr-${key}`,
      label: ATTRIBUTE_LABEL[key],
      aText: String(Math.round(a.attributes[key] ?? 0)),
      bText: String(Math.round(b.attributes[key] ?? 0)),
      aNum: a.attributes[key] ?? 0,
      bNum: b.attributes[key] ?? 0,
    });
  }

  if (statsA || statsB) {
    rows.push({
      key: "apps",
      label: "Матчи",
      aText: String(statsA?.appearances ?? 0),
      bText: String(statsB?.appearances ?? 0),
      aNum: statsA?.appearances ?? 0,
      bNum: statsB?.appearances ?? 0,
    });
    if (isGkBoth) {
      rows.push({
        key: "cs",
        label: "Сухие",
        aText: String(statsA?.cleanSheets ?? 0),
        bText: String(statsB?.cleanSheets ?? 0),
        aNum: statsA?.cleanSheets ?? 0,
        bNum: statsB?.cleanSheets ?? 0,
      });
      rows.push({
        key: "saves",
        label: "Сейвы",
        aText: String(statsA?.saves ?? 0),
        bText: String(statsB?.saves ?? 0),
        aNum: statsA?.saves ?? 0,
        bNum: statsB?.saves ?? 0,
      });
    } else {
      rows.push({
        key: "goals",
        label: "Голы",
        aText: String(statsA?.goals ?? 0),
        bText: String(statsB?.goals ?? 0),
        aNum: statsA?.goals ?? 0,
        bNum: statsB?.goals ?? 0,
      });
      rows.push({
        key: "assists",
        label: "Передачи",
        aText: String(statsA?.assists ?? 0),
        bText: String(statsB?.assists ?? 0),
        aNum: statsA?.assists ?? 0,
        bNum: statsB?.assists ?? 0,
      });
    }
    const ratingA =
      statsA && statsA.ratingCount > 0 ? averageRating(statsA) : undefined;
    const ratingB =
      statsB && statsB.ratingCount > 0 ? averageRating(statsB) : undefined;
    if (ratingA != null || ratingB != null) {
      rows.push({
        key: "rating",
        label: "Ср. оценка",
        aText: ratingA != null ? ratingA.toFixed(1) : "—",
        bText: ratingB != null ? ratingB.toFixed(1) : "—",
        aNum: ratingA,
        bNum: ratingB,
      });
    }
  }

  return rows;
}

function PlayerHalf({
  player,
  accent,
  onPress,
}: {
  player: Player;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.half} onPress={onPress}>
      <View style={styles.halfInner}>
        <View style={styles.halfText}>
          <Text style={styles.halfName} numberOfLines={2}>
            {playerDisplayName(player)}
          </Text>
          <Text style={[styles.halfMeta, { color: accent }]} numberOfLines={2}>
            {player.overall} · {preferredRoleLabel(player)} · {player.age} лет
          </Text>
          <Text style={styles.halfHint}>Открыть профиль →</Text>
        </View>
      </View>
    </Pressable>
  );
}

function DualAvatars({
  a,
  b,
  clubA,
  clubB,
  onPlayer,
}: {
  a: Player;
  b: Player;
  clubA?: Club;
  clubB?: Club;
  onPlayer: (playerId: string) => void;
}) {
  return (
    <View style={styles.avatarsRow}>
      <Pressable style={styles.avatarCol} onPress={() => onPlayer(a.id)}>
        <PersonPortrait
          seed={a.id}
          size={92}
          jersey={clubA?.colors[0]}
          jerseySecondary={clubA?.colors[1]}
          age={a.age}
          portraitId={a.portraitId}
          nationalityId={a.nationalityId}
          showKitBadge
        />
        <Text style={styles.avatarName} numberOfLines={2}>
          {playerDisplayName(a)}
        </Text>
        <Text style={[styles.avatarMeta, { color: broadcast.accent }]}>
          {a.overall} OVR
        </Text>
      </Pressable>
      <Text style={styles.avatarsVs}>VS</Text>
      <Pressable style={styles.avatarCol} onPress={() => onPlayer(b.id)}>
        <PersonPortrait
          seed={b.id}
          size={92}
          jersey={clubB?.colors[0]}
          jerseySecondary={clubB?.colors[1]}
          age={b.age}
          portraitId={b.portraitId}
          nationalityId={b.nationalityId}
          showKitBadge
        />
        <Text style={styles.avatarName} numberOfLines={2}>
          {playerDisplayName(b)}
        </Text>
        <Text style={[styles.avatarMeta, { color: broadcast.accentMagenta }]}>
          {b.overall} OVR
        </Text>
      </Pressable>
    </View>
  );
}

function CompareTable({ rows }: { rows: CompareRow[] }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Сравнение</Text>
      {rows.map((row) => {
        const w = winnerOf(row.aNum, row.bNum, row.lowerIsBetter);
        return (
          <View key={row.key} style={styles.row}>
            <Text
              style={[
                styles.rowValue,
                styles.rowLeft,
                w === "a" && styles.rowWin,
                w === "b" && styles.rowLose,
              ]}
              numberOfLines={2}
            >
              {row.aText}
            </Text>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {row.label}
            </Text>
            <Text
              style={[
                styles.rowValue,
                styles.rowRight,
                w === "b" && styles.rowWin,
                w === "a" && styles.rowLose,
              ]}
              numberOfLines={2}
            >
              {row.bText}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function PlayerCompareScreen({
  pack,
  save,
  playerIds,
  onBack,
  onPlayer,
}: {
  pack: WorldPack;
  save: CareerSave;
  playerIds: [string, string];
  onBack: () => void;
  onPlayer: (playerId: string) => void;
}) {
  const a = save.players.find((p) => p.id === playerIds[0]);
  const b = save.players.find((p) => p.id === playerIds[1]);
  if (!a || !b) {
    return (
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onBack} hitSlop={10} style={styles.backHit}>
            <Text style={styles.back}>← назад</Text>
          </Pressable>
          <Text style={styles.missing}>Игроки недоступны</Text>
        </View>
      </View>
    );
  }

  const clubA = pack.clubs.find((c) => c.id === a.clubId);
  const clubB = pack.clubs.find((c) => c.id === b.clubId);
  const rows = buildRows(a, b, save);
  const radarA = radarAxesForPlayer(a.attributes, primaryPosition(a) === "GK");
  const sameLayout =
    (primaryPosition(a) === "GK") === (primaryPosition(b) === "GK");
  const secondary = sameLayout
    ? {
        values: radarA.map((ax) => Math.round(b.attributes[ax.key] ?? 0)),
        stroke: broadcast.accentMagenta,
        fill: broadcast.accentMagentaSoft,
        label: playerDisplayName(b).split(" ").slice(-1)[0] ?? "B",
        strokeWidth: 4,
      }
    : null;
  const radarB = !sameLayout
    ? radarAxesForPlayer(b.attributes, primaryPosition(b) === "GK")
    : null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.backHit}>
          <Text style={styles.back}>← лента</Text>
        </Pressable>
        <Text style={styles.title}>Сравнение</Text>
        <Text style={styles.subtitle}>Конфликт в составе</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <DualAvatars
          a={a}
          b={b}
          clubA={clubA}
          clubB={clubB}
          onPlayer={onPlayer}
        />

        <CompareTable rows={rows} />

        <View style={styles.radarBlock}>
          <PlayerRadar
            axes={radarA}
            secondary={secondary}
            primaryLabel={playerDisplayName(a).split(" ").slice(-1)[0] ?? "A"}
            size={240}
            stroke={broadcast.accent}
            fill={broadcast.accentSoft}
          />
          {radarB ? (
            <View style={styles.radarSolo}>
              <Text style={styles.radarSoloLabel}>{playerDisplayName(b)}</Text>
              <PlayerRadar
                axes={radarB}
                size={200}
                stroke={broadcast.accentMagenta}
                fill={broadcast.accentMagentaSoft}
                strokeWidth={4}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>против</Text>
          <View style={styles.dividerLine} />
        </View>

        <PlayerHalf
          player={a}
          accent={broadcast.accent}
          onPress={() => onPlayer(a.id)}
        />

        <PlayerHalf
          player={b}
          accent={broadcast.accentMagenta}
          onPress={() => onPlayer(b.id)}
        />
      </ScrollView>
    </View>
  );
}

function buildStyles() {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: broadcast.bgDeep },
  header: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 10,
    gap: 2,
  },
  backHit: {
    alignSelf: "flex-start",
    marginBottom: 6,
    paddingVertical: 6,
    paddingHorizontal: 2,
    minHeight: 36,
    justifyContent: "center",
  },
  back: { color: broadcast.mist, fontSize: 15, fontWeight: "700" },
  title: {
    color: broadcast.white,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  subtitle: { color: broadcast.mistDim, fontSize: 12, fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingBottom: 32, gap: 12 },
  missing: { color: broadcast.mist, marginTop: 24, paddingHorizontal: 16 },
  avatarsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 8,
  },
  avatarCol: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    maxWidth: 160,
  },
  avatarName: {
    color: broadcast.white,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  avatarMeta: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  avatarsVs: {
    color: broadcast.mistDim,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginTop: 36,
  },
  half: {
    borderRadius: broadcast.radiusLg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: broadcast.cardBorder,
    minHeight: 72,
    backgroundColor: broadcast.surface,
  },
  halfInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    zIndex: 1,
  },
  halfText: { flex: 1, minWidth: 0, gap: 2 },
  halfName: { color: broadcast.white, fontSize: 17, fontWeight: "800" },
  halfMeta: { fontSize: 13, fontWeight: "700" },
  halfHint: { color: broadcast.mistDim, fontSize: 11, marginTop: 4 },
  panel: {
    backgroundColor: broadcast.surface,
    borderRadius: broadcast.radiusMd,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 6,
  },
  panelTitle: {
    color: broadcast.mistDim,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  rowLabel: {
    color: broadcast.mistDim,
    fontSize: 11,
    fontWeight: "700",
    width: 72,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  rowValue: {
    color: broadcast.white,
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  rowLeft: { textAlign: "right" },
  rowRight: { textAlign: "left" },
  rowWin: { color: broadcast.accent },
  rowLose: { color: broadcast.mistDim, fontWeight: "600" },
  radarBlock: { alignItems: "center", paddingVertical: 4 },
  radarSolo: { alignItems: "center", marginTop: 8 },
  radarSoloLabel: {
    color: broadcast.mistDim,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  dividerText: {
    color: broadcast.mistDim,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
}

let styles = buildStyles();
registerThemeRebuild(() => {
  styles = buildStyles();
});

