import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  FORMATION_COORDS,
  FORMATION_ROLES,
  FORMATIONS,
  autoSelectLineup,
  effectiveOverall,
  mentalityLabel,
  rolesLabel,
  suggestFormations,
  type FormationId,
  type LineupContext,
  type Player,
  type TeamTactics,
} from "@fm/engine";
import { PersonPortrait } from "./PersonPortrait";

export function TacticsPanel({
  tactics,
  squad,
  clubId,
  jersey,
  jerseySecondary,
  onChange,
  compact,
  /** During a live match: keep the same XI when changing formation */
  lockLineup,
  lineupContext,
}: {
  tactics: TeamTactics;
  squad: Player[];
  clubId: string;
  jersey?: string;
  jerseySecondary?: string;
  onChange: (t: TeamTactics) => void;
  compact?: boolean;
  lockLineup?: boolean;
  lineupContext?: LineupContext;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const byId = new Map(squad.map((p) => [p.id, p]));
  const formation = tactics?.formation ?? "4-3-3";
  const lineup = tactics?.lineup ?? [];
  const slots = FORMATION_ROLES[formation];
  const coords = FORMATION_COORDS[formation];
  const suggestions = lockLineup
    ? []
    : suggestFormations(squad, clubId, lineupContext, 3);

  const setFormation = (nextFormation: FormationId) => {
    setSelectedId(null);
    onChange({
      ...(tactics ?? { attack: 55, defence: 55, aggression: 50, formation, lineup }),
      formation: nextFormation,
      lineup: lockLineup
        ? lineup.slice(0, 11)
        : autoSelectLineup(squad, clubId, nextFormation, lineupContext),
    });
  };

  const swapPlayers = (aId: string, bId: string) => {
    if (lockLineup) return;
    const nextLineup = [...lineup];
    const ai = nextLineup.indexOf(aId);
    const bi = nextLineup.indexOf(bId);
    if (ai >= 0 && bi >= 0) {
      nextLineup[ai] = bId;
      nextLineup[bi] = aId;
    } else if (ai >= 0) {
      nextLineup[ai] = bId;
    } else if (bi >= 0) {
      nextLineup[bi] = aId;
    } else {
      // Two bench players — no lineup change
      setSelectedId(null);
      return;
    }
    onChange({
      ...(tactics ?? { attack: 55, defence: 55, aggression: 50, formation, lineup }),
      lineup: nextLineup,
    });
    setSelectedId(null);
  };

  const onTapPlayer = (id: string) => {
    if (lockLineup) return;
    if (!selectedId) {
      setSelectedId(id);
      return;
    }
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }
    swapPlayers(selectedId, id);
  };

  const bench = squad
    .filter((p) => !lineup.includes(p.id))
    .filter((p) => (lineupContext?.suspensions?.[p.id] ?? 0) <= 0)
    .sort((a, b) => b.overall - a.overall);

  const slider = (key: "attack" | "defence" | "aggression", label: string) => (
    <View style={styles.sliderBlock} key={key}>
      <Text style={styles.sliderLabel}>
        {label}: {tactics?.[key] ?? 50} · {mentalityLabel(tactics?.[key] ?? 50)}
      </Text>
      <View style={styles.sliderRow}>
        {[20, 40, 55, 70, 85].map((v) => (
          <Pressable
            key={v}
            onPress={() =>
              onChange({
                ...(tactics ?? { attack: 55, defence: 55, aggression: 50, formation, lineup }),
                [key]: v,
              })
            }
            style={[styles.chip, tactics?.[key] === v && styles.chipOn]}
          >
            <Text style={[styles.chipText, tactics?.[key] === v && styles.chipTextOn]}>{v}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View>
      <Text style={styles.section}>Схема</Text>
      {!lockLineup && suggestions.length ? (
        <View style={styles.suggestBox}>
          <Text style={styles.suggestTitle}>Рекомендуем по составу</Text>
          {suggestions.map((s, i) => (
            <Pressable
              key={s.formation}
              onPress={() => setFormation(s.formation)}
              style={[
                styles.suggestRow,
                formation === s.formation && styles.suggestRowOn,
              ]}
            >
              <Text style={styles.suggestFormation}>
                {i === 0 ? "★ " : ""}
                {s.formation}
              </Text>
              <Text style={styles.suggestReason} numberOfLines={2}>
                {s.reason}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.sliderRow}>
        {FORMATIONS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFormation(f)}
            style={[styles.chip, formation === f && styles.chipOn]}
          >
            <Text style={[styles.chipText, formation === f && styles.chipTextOn]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.pitch, compact && styles.pitchCompact]}>
        {lineup.map((id, i) => {
          const p = byId.get(id);
          const c = coords[i] ?? { x: 50, y: 50 };
          const role = slots[i] ?? "CM";
          if (!p) return null;
          const eff = effectiveOverall(p, role);
          const outOfPos = eff < p.overall;
          const avatar = compact ? 24 : 28;
          const selected = selectedId === id;
          return (
            <Pressable
              key={`${id}-${i}`}
              disabled={lockLineup}
              onPress={() => onTapPlayer(id)}
              style={[
                styles.pitchPlayer,
                compact && styles.pitchPlayerCompact,
                selected && styles.pitchPlayerSelected,
                {
                  left: `${c.x}%`,
                  top: `${c.y}%`,
                },
              ]}
            >
              <View style={styles.pitchAvatarWrap}>
                <PersonPortrait
                  seed={p.id}
                  size={avatar}
                  jersey={jersey}
                  jerseySecondary={jerseySecondary}
                  age={p.age}
                  portraitId={p.portraitId}
                  nationalityId={p.nationalityId}
                />
                <View style={[styles.pitchOvrBadge, outOfPos && styles.pitchOvrBadgeDown]}>
                  <Text style={styles.pitchOvrBadgeText}>{eff}</Text>
                </View>
              </View>
              <Text style={styles.pitchCaption} numberOfLines={2}>
                <Text style={styles.pitchName}>{p.lastName}</Text>
                {"\n"}
                <Text style={styles.pitchPos}>{rolesLabel(p)}</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>

      {slider("attack", "Атака")}
      {slider("defence", "Оборона")}
      {slider("aggression", "Агрессия")}
      {(tactics?.attack ?? 55) + (tactics?.defence ?? 55) >= 140 ? (
        <Text style={styles.warn}>
          Высокая атака и оборона одновременно растягивают команду — в матче оба показателя работают хуже, игроки быстрее устают.
        </Text>
      ) : null}

      <Text style={styles.section}>
        {lockLineup
          ? "Запас (замены — во вкладке Замены)"
          : selectedId
            ? "Выберите второго игрока для обмена"
            : "Запас (тап — выбрать, затем обмен)"}
      </Text>
      <View style={styles.benchRow}>
        {bench.slice(0, compact ? 8 : 12).map((p) => {
          const role = p.preferredRole ?? "CM";
          const eff = effectiveOverall(p, role);
          const selected = selectedId === p.id;
          return (
            <Pressable
              key={p.id}
              style={[styles.benchItem, selected && styles.benchItemSelected]}
              disabled={lockLineup}
              onPress={() => onTapPlayer(p.id)}
            >
              <PersonPortrait
                seed={p.id}
                size={28}
                jersey={jersey}
                jerseySecondary={jerseySecondary}
                age={p.age}
                portraitId={p.portraitId}
                nationalityId={p.nationalityId}
              />
              <Text style={styles.benchPos} numberOfLines={1}>
                {rolesLabel(p)}
              </Text>
              <Text style={styles.benchText} numberOfLines={1}>
                {p.lastName}
              </Text>
              <Text style={styles.benchOvr}>{eff}</Text>
            </Pressable>
          );
        })}
      </View>
      {!lockLineup ? (
        <Text style={styles.hint}>
          Тап по игроку на поле или скамейке — выбор, второй тап — обмен. Сила учитывает роль и ногу.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  suggestBox: {
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#24332C",
    backgroundColor: "#0E1512",
    gap: 6,
  },
  suggestTitle: { color: "#C6A75E", fontSize: 12, fontWeight: "700", marginBottom: 2 },
  suggestRow: { paddingVertical: 6, paddingHorizontal: 4, gap: 2 },
  suggestRowOn: { backgroundColor: "#16211C" },
  suggestFormation: { color: "#E8F0EA", fontSize: 13, fontWeight: "700" },
  suggestReason: { color: "#8FA396", fontSize: 11, lineHeight: 15 },
  section: {
    marginTop: 14,
    marginBottom: 8,
    color: "#C6A75E",
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sliderBlock: { marginBottom: 8 },
  sliderLabel: { color: "#E8F0EA", fontSize: 13, marginBottom: 6 },
  sliderRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: "#24332C",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipOn: { borderColor: "#C6A75E", backgroundColor: "#16211C" },
  chipText: { color: "#8FA396", fontSize: 12 },
  chipTextOn: { color: "#E8F0EA" },
  pitch: {
    height: 360,
    backgroundColor: "#1A3D2E",
    borderWidth: 1,
    borderColor: "#2F5D45",
    marginVertical: 10,
    overflow: "hidden",
  },
  pitchCompact: { height: 300 },
  pitchPlayer: {
    position: "absolute",
    width: 72,
    marginLeft: -36,
    marginTop: -2,
    alignItems: "center",
    paddingVertical: 2,
    borderRadius: 4,
  },
  pitchPlayerCompact: {
    width: 64,
    marginLeft: -32,
  },
  pitchPlayerSelected: {
    backgroundColor: "rgba(198, 167, 94, 0.28)",
    borderWidth: 1,
    borderColor: "#C6A75E",
  },
  pitchAvatarWrap: {
    position: "relative",
  },
  pitchOvrBadge: {
    position: "absolute",
    right: -6,
    bottom: -2,
    minWidth: 18,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "#0E1512",
    borderWidth: 1,
    borderColor: "#C6A75E",
    alignItems: "center",
  },
  pitchOvrBadgeDown: { borderColor: "#E67E22" },
  pitchOvrBadgeText: { color: "#E8F0EA", fontSize: 8, fontWeight: "800" },
  pitchCaption: {
    marginTop: 3,
    maxWidth: 70,
    textAlign: "center",
    lineHeight: 11,
  },
  pitchName: {
    color: "#E8F0EA",
    fontSize: 8,
  },
  pitchPos: { color: "#C6A75E", fontSize: 7 },
  warn: { color: "#E67E22", fontSize: 11, marginBottom: 8, lineHeight: 15 },
  benchRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  benchItem: { width: 72, alignItems: "center", paddingVertical: 4, borderRadius: 4 },
  benchItemSelected: {
    backgroundColor: "rgba(198, 167, 94, 0.28)",
    borderWidth: 1,
    borderColor: "#C6A75E",
  },
  benchPos: { color: "#C6A75E", fontSize: 8, marginTop: 2, textAlign: "center" },
  benchText: { color: "#8FA396", fontSize: 9 },
  benchOvr: { color: "#E8F0EA", fontSize: 11, fontWeight: "700" },
  hint: { color: "#5F7A6C", fontSize: 11, marginTop: 8 },
});
