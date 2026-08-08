import { StyleSheet, Text, View } from "react-native";
import { nationalityFlag } from "@fm/engine";

/** Championship / nation flag from federation id (matches nationality codes in world pack). */
export function Flag({
  federationId,
  size = "lg",
}: {
  federationId: string;
  size?: "sm" | "md" | "lg";
}) {
  const emoji = nationalityFlag(federationId);
  return (
    <View style={styles.wrap} accessibilityLabel={`Флаг ${federationId}`}>
      <Text style={[styles.flag, size === "sm" && styles.sm, size === "md" && styles.md]}>
        {emoji}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  flag: {
    fontSize: 36,
    lineHeight: 42,
  },
  md: {
    fontSize: 26,
    lineHeight: 32,
  },
  sm: {
    fontSize: 18,
    lineHeight: 22,
  },
});
