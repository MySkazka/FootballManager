import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Rect, Stop } from "react-native-svg";
import type { Player, Position, RoleId } from "@fm/engine";
import { ROLE_LABEL } from "@fm/engine";
import { PersonPortrait } from "./PersonPortrait";
import {broadcast, registerThemeRebuild} from "./broadcastTheme";

/** Muted dark blue-green grass — not neon mint, not purple. */
const GRASS = "#1A5A48";
const GRASS_DARK = "#0F3A34";
const GRASS_LIGHT = "#226B56";
const LINE = "rgba(255,255,255,0.88)";

function lineForRole(role: RoleId): Position {
  if (role === "GK") return "GK";
  if (role === "LB" || role === "CB" || role === "RB" || role === "LWB" || role === "RWB") return "DF";
  if (role === "CDM" || role === "CM" || role === "CAM" || role === "LM" || role === "RM") return "MF";
  return "FW";
}

/** Badge text for a formation slot — exact slot role (ВР, ЛЗ, …). */
export function pitchSlotLabel(player: Player, _slotIndex?: number, roleLabel?: string): string {
  if (roleLabel) return roleLabel;
  return String(Math.round(player.overall));
}

/**
 * Pitch name: prefer «И. Фамилия»; if that is long, surname only.
 * Never pre-truncate with «…» — layout shrinks type before clipping.
 */
export function pitchShortName(player: Pick<Player, "firstName" | "lastName">): string {
  const last = (player.lastName || "").trim();
  const first = (player.firstName || "").trim();
  const initial = first.charAt(0);
  if (!last) return first || "?";
  if (!initial) return last;
  const withInitial = `${initial}. ${last}`;
  // Surname alone when the combined form won't fit ~10–12 chars cleanly
  if (last.length >= 10 || withInitial.length > 12) return last;
  return withInitial;
}

const ROLE_TONE: Record<Position, { bg: string; fg: string }> = {
  GK: { bg: "#E67E22", fg: "#1A1008" },
  DF: { bg: "#C5D94A", fg: "#1A2208" },
  MF: { bg: "#2E9B5A", fg: "#FFFFFF" },
  FW: { bg: "#3D7EC4", fg: "#FFFFFF" },
};

export function roleTagTone(role: RoleId): { bg: string; fg: string } {
  return ROLE_TONE[lineForRole(role)];
}

function ratingBadgeColor(rating: number): string {
  if (rating >= 85) return "#3D7EC4";
  if (rating >= 75) return "#3D7EC4";
  if (rating >= 65) return "#C47828";
  return "#4A5568";
}

function PitchMarkings() {
  const sw = 1.1;
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 160"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="grassGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={GRASS_LIGHT} stopOpacity="1" />
          <Stop offset="0.5" stopColor={GRASS} stopOpacity="1" />
          <Stop offset="1" stopColor={GRASS_DARK} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="160" fill="url(#grassGrad)" />
      {/* Subtle mowing stripes */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <Rect
          key={i}
          x="0"
          y={i * 20}
          width="100"
          height="10"
          fill={i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)"}
        />
      ))}
      <Rect x="3.5" y="3.5" width="93" height="153" rx="1.2" fill="none" stroke={LINE} strokeWidth={sw} />
      <Line x1="3.5" y1="80" x2="96.5" y2="80" stroke={LINE} strokeWidth={sw} />
      <Circle cx="50" cy="80" r="14" fill="none" stroke={LINE} strokeWidth={sw} />
      <Circle cx="50" cy="80" r="1.2" fill={LINE} />
      <Rect x="22" y="3.5" width="56" height="26" fill="none" stroke={LINE} strokeWidth={sw} />
      <Rect x="34" y="3.5" width="32" height="10" fill="none" stroke={LINE} strokeWidth={sw} />
      <Circle cx="50" cy="22" r="1.1" fill={LINE} />
      <Rect x="22" y="130.5" width="56" height="26" fill="none" stroke={LINE} strokeWidth={sw} />
      <Rect x="34" y="146.5" width="32" height="10" fill="none" stroke={LINE} strokeWidth={sw} />
      <Circle cx="50" cy="138" r="1.1" fill={LINE} />
    </Svg>
  );
}

/** Legacy compact role/rating chip (kept for any simple callers). */
export function PitchNumberBadge({
  label,
  selected,
  warn,
  danger,
  compact,
}: {
  label: string;
  selected?: boolean;
  warn?: boolean;
  danger?: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.legacyBadge,
        compact && styles.legacyBadgeCompact,
        selected && styles.legacyBadgeSelected,
        warn && styles.legacyBadgeWarn,
        danger && styles.legacyBadgeDanger,
      ]}
    >
      <Text style={[styles.legacyBadgeText, compact && styles.legacyBadgeTextCompact]}>{label}</Text>
    </View>
  );
}

export type FormationPitchRoleTag = {
  label: string;
  role?: RoleId;
};

export type FormationPitchSlot = {
  key: string;
  x: number;
  y: number;
  /** Role-adjusted strength shown above the avatar */
  rating?: number;
  /** «И. Фамилия» or surname */
  name?: string;
  /** Formation slot position pill (one) */
  roleTags?: FormationPitchRoleTag[];
  portrait?: {
    seed: string;
    portraitId?: number;
    nationalityId?: string;
    age?: number;
    jersey?: string;
    jerseySecondary?: string;
  };
  /** Fallback simple label (role code) when rich card data is absent */
  label?: string;
  caption?: string;
  selected?: boolean;
  warn?: boolean;
  danger?: boolean;
  onPress?: () => void;
  disabled?: boolean;
};

function PitchPlayerName({ name, compact }: { name: string; compact?: boolean }) {
  const surnameOnly = !name.includes(".");
  const long = name.length > 9;
  return (
    <View style={[styles.nameChip, compact && styles.nameChipCompact]}>
      <Text
        style={[
          styles.playerName,
          compact && styles.playerNameCompact,
          surnameOnly && styles.playerNameSurname,
          long && styles.playerNameLong,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {name}
      </Text>
    </View>
  );
}

function PitchPlayerCard({
  slot,
  compact,
}: {
  slot: FormationPitchSlot;
  compact?: boolean;
}) {
  const avatarSize = compact ? 36 : 40;
  const rating = slot.rating;
  const hasRich = !!(slot.portrait || slot.name || rating != null);

  if (!hasRich) {
    return (
      <>
        <PitchNumberBadge
          label={slot.label ?? "?"}
          selected={slot.selected}
          warn={slot.warn}
          danger={slot.danger}
          compact={compact}
        />
        {slot.caption ? (
          <Text style={styles.legacyCaption} numberOfLines={1}>
            {slot.caption}
          </Text>
        ) : null}
      </>
    );
  }

  // One formation-slot pill only — never stack preferred + slot
  const tag = slot.roleTags?.[0];

  return (
    <View
      style={[
        styles.card,
        slot.selected && styles.cardSelected,
        slot.warn && styles.cardWarn,
        slot.danger && styles.cardDanger,
      ]}
    >
      <View style={styles.avatarBlock}>
        {rating != null ? (
          <View
            style={[
              styles.ratingBadge,
              compact && styles.ratingBadgeCompact,
              { backgroundColor: ratingBadgeColor(rating) },
            ]}
          >
            <Text style={[styles.ratingText, compact && styles.ratingTextCompact]}>
              {Math.round(rating)}
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.avatarRing,
            slot.selected && styles.avatarRingSelected,
            slot.warn && styles.avatarRingWarn,
            slot.danger && styles.avatarRingDanger,
          ]}
        >
          {slot.portrait ? (
            <PersonPortrait
              seed={slot.portrait.seed}
              size={avatarSize}
              jersey={slot.portrait.jersey}
              jerseySecondary={slot.portrait.jerseySecondary}
              age={slot.portrait.age}
              portraitId={slot.portrait.portraitId}
              nationalityId={slot.portrait.nationalityId}
            />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                {
                  width: avatarSize,
                  height: avatarSize,
                  borderRadius: avatarSize / 2,
                },
              ]}
            >
              <Text style={styles.avatarFallbackText}>{slot.label ?? "?"}</Text>
            </View>
          )}
        </View>
      </View>

      {slot.name ? <PitchPlayerName name={slot.name} compact={compact} /> : null}

      {tag ? (
        <View style={styles.tagRow}>
          {(() => {
            const tone = tag.role ? roleTagTone(tag.role) : ROLE_TONE.MF;
            return (
              <View style={[styles.roleTag, { backgroundColor: tone.bg }]}>
                <Text style={[styles.roleTagText, { color: tone.fg }]} numberOfLines={1}>
                  {tag.label}
                </Text>
              </View>
            );
          })()}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Vertical inset so labels under avatars stay inside overflow:hidden.
 * Cards are compact (rating overlaid on avatar) — insets can stay modest.
 */
const PITCH_Y_INSET_TOP = 36;
const PITCH_Y_INSET_BOTTOM = 48;
const PITCH_Y_INSET_TOP_COMPACT = 30;
const PITCH_Y_INSET_BOTTOM_COMPACT = 42;

export function FormationPitch({
  slots,
  compact,
  style,
  footer,
}: {
  slots: FormationPitchSlot[];
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}) {
  const topInset = compact ? PITCH_Y_INSET_TOP_COMPACT : PITCH_Y_INSET_TOP;
  const bottomInset = compact ? PITCH_Y_INSET_BOTTOM_COMPACT : PITCH_Y_INSET_BOTTOM;
  return (
    <View>
      <View style={[styles.pitch, compact && styles.pitchCompact, style]}>
        <PitchMarkings />
        <View
          pointerEvents="box-none"
          style={[styles.playable, { top: topInset, bottom: bottomInset }]}
        >
          {slots.map((s) => {
            const body = <PitchPlayerCard slot={s} compact={compact} />;
            const slotStyle: StyleProp<ViewStyle> = [
              styles.slot,
              compact ? styles.slotCompact : null,
              {
                left: `${s.x}%`,
                top: `${s.y}%`,
                // Lower on pitch draws above — name/role of the line above won't cover faces
                zIndex: Math.round(s.y),
              },
            ];
            if (s.onPress) {
              return (
                <Pressable
                  key={s.key}
                  disabled={s.disabled}
                  onPress={s.onPress}
                  hitSlop={8}
                  style={slotStyle}
                >
                  {body}
                </Pressable>
              );
            }
            return (
              <View key={s.key} style={slotStyle}>
                {body}
              </View>
            );
          })}
        </View>
      </View>
      {footer}
    </View>
  );
}

/** Formation slot position only (one pill) — preferred role is not shown on the pitch. */
export function pitchRoleTags(
  slotRole: RoleId,
  _player?: Pick<Player, "preferredRole" | "roles">
): FormationPitchRoleTag[] {
  const slotLabel = ROLE_LABEL[slotRole] ?? slotRole;
  return [{ label: slotLabel, role: slotRole }];
}

function buildStyles() {
  return StyleSheet.create({
  pitch: {
    height: 460,
    backgroundColor: GRASS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
    marginVertical: 10,
    overflow: "hidden",
    borderRadius: broadcast.radiusLg,
  },
  pitchCompact: { height: 380, marginVertical: 6 },
  /** Goal-line inset band: formation %Y maps here so badges aren't clipped */
  playable: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  slot: {
    position: "absolute",
    width: 76,
    marginLeft: -38,
    // Anchor on avatar center (rating overlays the portrait)
    marginTop: -26,
    alignItems: "center",
    zIndex: 1,
  },
  slotCompact: {
    width: 70,
    marginLeft: -35,
    marginTop: -22,
  },
  card: {
    alignItems: "center",
    minWidth: 64,
    maxWidth: 76,
  },
  cardSelected: { zIndex: 4 },
  cardWarn: { zIndex: 3 },
  cardDanger: { zIndex: 3 },
  avatarBlock: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  ratingBadge: {
    position: "absolute",
    top: -4,
    left: -10,
    zIndex: 2,
    minWidth: 24,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  ratingBadgeCompact: {
    minWidth: 22,
    paddingHorizontal: 3,
    top: -3,
    left: -8,
  },
  ratingText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  ratingTextCompact: {
    fontSize: 10,
  },
  avatarRing: {
    borderRadius: 999,
    padding: 1.5,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.42)",
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  avatarRingSelected: {
    borderColor: "#F0C14A",
    borderWidth: 2,
    shadowColor: "#F0C14A",
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  avatarRingWarn: {
    borderColor: "#E67E22",
  },
  avatarRingDanger: {
    borderColor: broadcast.danger,
  },
  avatarFallback: {
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "800",
  },
  nameChip: {
    marginTop: 2,
    maxWidth: 74,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "rgba(5, 12, 8, 0.82)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  nameChipCompact: {
    maxWidth: 68,
    paddingHorizontal: 3,
  },
  playerName: {
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.15,
    textTransform: "uppercase",
    lineHeight: 11,
  },
  playerNameCompact: {
    fontSize: 8,
    lineHeight: 10,
  },
  playerNameSurname: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  playerNameLong: {
    fontSize: 8,
    letterSpacing: 0.05,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    marginTop: 1,
    justifyContent: "center",
  },
  roleTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    minWidth: 24,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.2)",
  },
  roleTagText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.2,
    lineHeight: 11,
  },
  legacyBadge: {
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(8, 20, 12, 0.75)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  legacyBadgeCompact: {
    minWidth: 30,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 7,
  },
  legacyBadgeSelected: {
    borderColor: "#F0C14A",
    borderWidth: 1.5,
    backgroundColor: "rgba(240,193,74,0.25)",
  },
  legacyBadgeWarn: {
    borderColor: "#E67E22",
    borderWidth: 1.5,
  },
  legacyBadgeDanger: {
    borderColor: broadcast.danger,
    borderWidth: 1.5,
    backgroundColor: "rgba(231,76,60,0.22)",
  },
  legacyBadgeText: {
    color: broadcast.white,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  legacyBadgeTextCompact: { fontSize: 11 },
  legacyCaption: {
    marginTop: 3,
    maxWidth: 64,
    textAlign: "center",
    color: "rgba(255,255,255,0.85)",
    fontSize: 9,
    fontWeight: "600",
  },
});
}

let styles = buildStyles();
registerThemeRebuild(() => {
  styles = buildStyles();
});

