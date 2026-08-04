import { StyleSheet, Text, View } from "react-native";
import { nationalityCode, nationalityFlag } from "@fm/engine";

/** Flag emoji + FIFA 3-letter code (e.g. 🇧🇷 BRA). */
export function NationBadge({
  nationalityId,
  size = "md",
}: {
  nationalityId: string;
  size?: "sm" | "md";
}) {
  const flag = nationalityFlag(nationalityId);
  const code = nationalityCode(nationalityId);
  const sm = size === "sm";
  return (
    <View style={styles.row}>
      <Text style={[styles.flag, sm && styles.flagSm]}>{flag}</Text>
      <Text style={[styles.code, sm && styles.codeSm]}>{code}</Text>
    </View>
  );
}

/** Inline “🇧🇷 BRA” for use inside a sentence/row of text. */
export function nationText(nationalityId: string): string {
  return `${nationalityFlag(nationalityId)} ${nationalityCode(nationalityId)}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  flag: {
    fontSize: 14,
    lineHeight: 18,
  },
  flagSm: {
    fontSize: 11,
    lineHeight: 14,
  },
  code: {
    color: "#C8D5CC",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    fontVariant: ["tabular-nums"],
  },
  codeSm: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
});
