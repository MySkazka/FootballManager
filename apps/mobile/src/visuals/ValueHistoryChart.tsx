import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import type { ValueHistoryPoint } from "@fm/engine";

type Props = {
  title: string;
  points: ValueHistoryPoint[];
  formatValue: (v: number) => string;
  footnote?: string;
  accent?: string;
  height?: number;
};

export function ValueHistoryChart({
  title,
  points,
  formatValue,
  footnote,
  accent = "#C6A75E",
  height = 140,
}: Props) {
  const width = 320;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 22;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const { line, area, dots, minV, maxV, labels } = useMemo(() => {
    if (!points.length) {
      return { line: "", area: "", dots: [] as { x: number; y: number; v: number }[], minV: 0, maxV: 1, labels: [] as string[] };
    }
    const values = points.map((p) => p.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (max - min < 0.2) {
      min = Math.max(0, min - 0.3);
      max = max + 0.3;
    }
    const span = max - min || 1;
    const coords = points.map((p, i) => {
      const x = padL + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
      const y = padT + chartH - ((p.value - min) / span) * chartH;
      return { x, y, v: p.value };
    });
    const lineD = coords
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(" ");
    const areaD = `${lineD} L ${coords[coords.length - 1]!.x.toFixed(1)} ${(padT + chartH).toFixed(1)} L ${coords[0]!.x.toFixed(1)} ${(padT + chartH).toFixed(1)} Z`;
    // Show first, last, and sparse middles
    const labelsOut = points.map((p, i) => {
      if (i === 0 || i === points.length - 1) return p.label;
      if (points.length <= 6) return p.label;
      if (i % Math.ceil(points.length / 5) === 0) return p.label;
      return "";
    });
    return { line: lineD, area: areaD, dots: coords, minV: min, maxV: max, labels: labelsOut };
  }, [points, chartW, chartH, padL, padT]);

  if (!points.length) return null;

  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.rangeRow}>
        <Text style={styles.rangeText}>{formatValue(minV)}</Text>
        <Text style={styles.rangeText}>{formatValue(maxV)}</Text>
      </View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="valFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accent} stopOpacity="0.35" />
            <Stop offset="1" stopColor={accent} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#valFill)" />
        <Path d={line} stroke={accent} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {dots.map((d, i) => (
          <Circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={i === dots.length - 1 ? 4 : 2.5}
            fill={i === dots.length - 1 ? accent : "#1A2E26"}
            stroke={accent}
            strokeWidth={1.5}
          />
        ))}
      </Svg>
      <View style={styles.labelRow}>
        {labels.map((lab, i) => (
          <Text key={i} style={[styles.axisLabel, !lab && styles.axisLabelEmpty]} numberOfLines={1}>
            {lab}
          </Text>
        ))}
      </View>
      <Text style={styles.summary}>
        {formatValue(first)} → {formatValue(last)}
      </Text>
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#24332C",
    backgroundColor: "#0E1512",
  },
  title: {
    color: "#E8F0EA",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  rangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  rangeText: { color: "#6A7A70", fontSize: 10 },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -4,
  },
  axisLabel: {
    flex: 1,
    color: "#8FA396",
    fontSize: 10,
    textAlign: "center",
  },
  axisLabelEmpty: { color: "transparent" },
  summary: {
    color: "#C6A75E",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },
  footnote: {
    color: "#8FA396",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
});
