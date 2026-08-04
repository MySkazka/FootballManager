import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import type { Club } from "@fm/engine";
import { ClubLogo } from "./ClubLogo";
import { PersonPortrait } from "./PersonPortrait";

export type MomentKind = "goal" | "yellow" | "red" | "penalty" | "handball";

const LABELS: Record<MomentKind, { title: string; color: string }> = {
  goal: { title: "ГОЛ!", color: "#C6A75E" },
  yellow: { title: "ЖЁЛТАЯ", color: "#F1C40F" },
  red: { title: "КРАСНАЯ!", color: "#E74C3C" },
  penalty: { title: "ПЕНАЛЬТИ", color: "#E8F0EA" },
  handball: { title: "ИГРА РУКОЙ", color: "#9B59B6" },
};

/**
 * Full-screen flash for key match moments.
 * Fixed card size; club crest shown next to the player.
 */
export function MomentCelebration({
  kind,
  playerId,
  playerName,
  jersey,
  jerseySecondary,
  subtitle,
  club,
  portraitId,
  nationalityId,
  onDone,
}: {
  kind: MomentKind;
  playerId: string;
  playerName: string;
  jersey?: string;
  jerseySecondary?: string;
  subtitle?: string;
  club?: Club;
  portraitId?: number;
  nationalityId?: string;
  onDone: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(12)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const meta = LABELS[kind];
  const showCard = kind === "yellow" || kind === "red";

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(bounce, { toValue: 0, friction: 7, tension: 90, useNativeDriver: true }),
      ]),
      Animated.delay(kind === "goal" || kind === "red" || kind === "penalty" ? 900 : 700),
      Animated.timing(opacity, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => {
      if (finished) onDoneRef.current();
    });
    return () => anim.stop();
  }, [bounce, kind, opacity]);

  return (
    <View style={styles.backdrop} pointerEvents="none">
      <Animated.View
        style={[
          styles.card,
          {
            borderColor: meta.color,
            opacity,
            transform: [{ translateY: bounce }],
          },
        ]}
      >
        <View style={styles.badgeSlot}>
          {showCard ? (
            <View
              style={[
                styles.cardBadge,
                { backgroundColor: kind === "yellow" ? "#F1C40F" : "#E74C3C" },
              ]}
            />
          ) : null}
        </View>
        <View style={styles.portraitRow}>
          {club ? <ClubLogo club={club} size={36} /> : null}
          <PersonPortrait
            seed={playerId}
            size={96}
            jersey={jersey ?? club?.colors[0]}
            jerseySecondary={jerseySecondary ?? club?.colors[1]}
            portraitId={portraitId}
            nationalityId={nationalityId}
          />
          {club ? <View style={{ width: 36 }} /> : null}
        </View>
        <Text style={[styles.title, { color: meta.color }]} numberOfLines={1}>
          {meta.title}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {playerName}
        </Text>
        <Text style={styles.sub} numberOfLines={2}>
          {subtitle ?? " "}
        </Text>
      </Animated.View>
    </View>
  );
}

/** @deprecated use MomentCelebration */
export const GoalCelebration = MomentCelebration;

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(14, 21, 18, 0.55)",
  },
  card: {
    width: 268,
    height: 280,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#16211C",
    borderWidth: 2,
  },
  badgeSlot: {
    height: 36,
    marginBottom: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBadge: {
    width: 26,
    height: 36,
    borderRadius: 3,
  },
  portraitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 8,
    textAlign: "center",
    width: "100%",
  },
  name: {
    color: "#E8F0EA",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6,
    width: "100%",
    textAlign: "center",
  },
  sub: {
    color: "#8FA396",
    fontSize: 13,
    marginTop: 4,
    minHeight: 34,
    width: "100%",
    textAlign: "center",
  },
});
