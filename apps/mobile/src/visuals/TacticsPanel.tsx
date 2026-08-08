import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  FORMATION_COORDS,
  FORMATION_ROLES,
  FORMATIONS,
  ROLE_LABEL,
  analyzeLineupStrength,
  applyOptimalLineup,
  autoSelectLineup,
  effectiveOverall,
  mentalityLabel,
  rolesLabel,
  suggestFormations,
  type FormationId,
  type LineupContext,
  type LineupStrengthHint,
  type Player,
  type TeamTactics,
} from "@fm/engine";
import { PersonPortrait } from "./PersonPortrait";
import { FormationPitch, pitchRoleTags, pitchShortName } from "./FormationPitch";
import {broadcast, registerThemeRebuild} from "./broadcastTheme";

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
  const [strengthHints, setStrengthHints] = useState<LineupStrengthHint[] | null>(null);
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
    setStrengthHints(null);
    onChange({
      ...(tactics ?? { attack: 55, defence: 55, aggression: 50, formation, lineup }),
      formation: nextFormation,
      lineup: lockLineup
        ? lineup.slice(0, 11)
        : autoSelectLineup(squad, clubId, nextFormation, lineupContext),
    });
  };

  const showStrengthHints = () => {
    if (lockLineup) return;
    setStrengthHints(analyzeLineupStrength(squad, clubId, tactics, lineupContext));
  };

  const applyStrengthHints = () => {
    if (lockLineup) return;
    const next = applyOptimalLineup(squad, clubId, tactics, lineupContext);
    onChange(next);
    setStrengthHints(analyzeLineupStrength(squad, clubId, next, lineupContext));
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

  // Formation order for XI; overall desc for bench (never “missing portrait first”)
  const bench = squad
    .filter((p) => !lineup.includes(p.id))
    .filter((p) => (lineupContext?.suspensions?.[p.id] ?? 0) <= 0)
    .sort((a, b) => b.overall - a.overall || a.lastName.localeCompare(b.lastName, "ru"));

  const pitchSlots = lineup.flatMap((id, i) => {
    const p = byId.get(id);
    const c = coords[i] ?? { x: 50, y: 50 };
    const role = slots[i] ?? "CM";
    if (!p) return [];
    const eff = effectiveOverall(p, role);
    const outOfPos = eff < p.overall - 1;
    return [
      {
        key: `${id}-${i}`,
        x: c.x,
        y: c.y,
        rating: Math.round(eff),
        name: pitchShortName(p),
        roleTags: pitchRoleTags(role, p),
        portrait: {
          seed: p.id,
          portraitId: p.portraitId,
          nationalityId: p.nationalityId,
          age: p.age,
          jersey,
          jerseySecondary,
        },
        selected: selectedId === id,
        warn: outOfPos,
        disabled: !!lockLineup,
        onPress: lockLineup ? undefined : () => onTapPlayer(id),
      },
    ];
  });

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
      {!lockLineup && !compact && suggestions.length ? (
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

      {!lockLineup && !compact ? (
        <View style={styles.strengthBox}>
          <Text style={styles.strengthTitle}>Сила основы</Text>
          <Text style={styles.strengthLead}>
            Подсказки по тем же правилам, что и матч: роль в схеме, любимая нога на фланге, OVR со
            штрафом вне позиции.
          </Text>
          <View style={styles.strengthActions}>
            <Pressable style={styles.strengthBtnSecondary} onPress={showStrengthHints}>
              <Text style={styles.strengthBtnSecondaryText}>Показать подсказки</Text>
            </Pressable>
            <Pressable style={styles.strengthBtn} onPress={applyStrengthHints}>
              <Text style={styles.strengthBtnText}>Применить автооснову</Text>
            </Pressable>
          </View>
          {strengthHints?.map((h, i) => (
            <Text key={`${i}-${h.message.slice(0, 24)}`} style={styles.strengthHint}>
              · {h.message}
            </Text>
          ))}
        </View>
      ) : null}

      <FormationPitch
        compact={compact}
        slots={pitchSlots}
        footer={
          compact ? undefined : (
          <View style={styles.xiList}>
            <Text style={styles.xiListTitle}>
              Основа · {formation}
            </Text>
            {lineup.map((id, i) => {
              const p = byId.get(id);
              const role = slots[i] ?? "CM";
              if (!p) return null;
              const selected = selectedId === id;
              const eff = effectiveOverall(p, role);
              return (
                <Pressable
                  key={`xi-${id}-${i}`}
                  disabled={!!lockLineup}
                  onPress={() => onTapPlayer(id)}
                  style={[styles.xiRow, selected && styles.xiRowSelected]}
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
                  <Text style={styles.xiRole}>{ROLE_LABEL[role] ?? role}</Text>
                  <Text style={styles.xiName} numberOfLines={1}>
                    {p.lastName}
                  </Text>
                  <Text style={styles.xiOvrMeta}>
                    {p.overall}
                    {eff !== p.overall ? `→${eff}` : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          )
        }
      />

      {!compact ? (
        <>
          {slider("attack", "Атака")}
          {slider("defence", "Оборона")}
          {slider("aggression", "Агрессия")}
          {(tactics?.attack ?? 55) + (tactics?.defence ?? 55) >= 140 ? (
            <Text style={styles.warn}>
              Высокая атака и оборона одновременно растягивают команду — в матче оба показателя работают хуже, игроки быстрее устают.
            </Text>
          ) : null}
        </>
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
          На схеме: сила в роли над аватаркой, имя и позиция слота снизу. Тап — выбрать, затем обмен.
        </Text>
      ) : null}
    </View>
  );
}

function buildStyles() {
  return StyleSheet.create({
  suggestBox: {
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: broadcast.ctaSecondaryBorder,
    backgroundColor: broadcast.surfaceAlt,
    borderRadius: broadcast.radiusMd,
    gap: 6,
  },
  suggestTitle: { color: broadcast.accent, fontSize: 12, fontWeight: "700", marginBottom: 2 },
  suggestRow: { paddingVertical: 6, paddingHorizontal: 4, gap: 2, borderRadius: 8 },
  suggestRowOn: { backgroundColor: broadcast.accentSoft },
  suggestFormation: { color: broadcast.white, fontSize: 13, fontWeight: "700" },
  suggestReason: { color: broadcast.mist, fontSize: 11, lineHeight: 15 },
  strengthBox: {
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: broadcast.gold,
    backgroundColor: broadcast.surfaceElevated,
    borderRadius: broadcast.radiusMd,
    gap: 8,
  },
  strengthTitle: { color: broadcast.gold, fontWeight: "700", fontSize: 14 },
  strengthLead: { color: broadcast.mist, fontSize: 12, lineHeight: 17 },
  strengthActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  strengthBtn: {
    backgroundColor: broadcast.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: broadcast.radiusPill,
  },
  strengthBtnText: { color: "#0A1210", fontSize: 12, fontWeight: "800" },
  strengthBtnSecondary: {
    borderWidth: 1,
    borderColor: broadcast.ctaSecondaryBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: broadcast.radiusPill,
    backgroundColor: broadcast.surfaceAlt,
  },
  strengthBtnSecondaryText: { color: broadcast.white, fontSize: 12, fontWeight: "700" },
  strengthHint: { color: broadcast.mist, fontSize: 12, lineHeight: 17 },
  section: {
    marginTop: 14,
    marginBottom: 8,
    color: broadcast.mist,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  sliderBlock: { marginBottom: 8 },
  sliderLabel: { color: broadcast.white, fontSize: 13, marginBottom: 6 },
  sliderRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: broadcast.ctaSecondaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: broadcast.surfaceAlt,
    borderRadius: broadcast.radiusPill,
  },
  chipOn: {
    borderColor: broadcast.accent,
    backgroundColor: broadcast.accentSoft,
    shadowColor: broadcast.accent,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  chipText: { color: broadcast.mist, fontSize: 12, fontWeight: "700" },
  chipTextOn: { color: broadcast.white },
  xiList: {
    marginTop: 2,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: broadcast.cardBorder,
    backgroundColor: broadcast.surfaceAlt,
    borderRadius: broadcast.radiusMd,
    overflow: "hidden",
  },
  xiListTitle: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: broadcast.mist,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.cardBorder,
  },
  xiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.cardBorder,
  },
  xiRowSelected: {
    backgroundColor: broadcast.accentSoft,
  },
  xiRole: {
    width: 40,
    color: broadcast.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  xiName: {
    flex: 1,
    color: broadcast.mist,
    fontSize: 13,
    fontWeight: "600",
  },
  xiOvrMeta: {
    color: broadcast.white,
    fontSize: 11,
    fontWeight: "700",
    minWidth: 44,
    textAlign: "right",
  },
  warn: { color: "#E67E22", fontSize: 11, marginBottom: 8, lineHeight: 15 },
  benchRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  benchItem: { width: 72, alignItems: "center", paddingVertical: 4, borderRadius: 8 },
  benchItemSelected: {
    backgroundColor: broadcast.accentSoft,
    borderWidth: 1,
    borderColor: broadcast.accent,
  },
  benchPos: { color: broadcast.accent, fontSize: 8, marginTop: 2, textAlign: "center" },
  benchText: { color: broadcast.mistDim, fontSize: 9 },
  benchOvr: { color: broadcast.white, fontSize: 11, fontWeight: "700" },
  hint: { color: broadcast.mistDim, fontSize: 11, marginTop: 8 },
});
}

let styles = buildStyles();
registerThemeRebuild(() => {
  styles = buildStyles();
});

