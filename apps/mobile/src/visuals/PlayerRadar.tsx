import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from "react-native-svg";
import { ATTRIBUTE_LABEL, type PlayerAttributes } from "@fm/engine";
import { broadcast, registerThemeRebuild } from "./broadcastTheme";

export type RadarAxis = {
  key: keyof PlayerAttributes;
  label: string;
  value: number;
};

const SHORT_LABEL: Partial<Record<keyof PlayerAttributes, string>> = {
  pace: "Скор.",
  shooting: "Удар",
  passing: "Пас",
  dribbling: "Дриб.",
  defending: "Защ.",
  physical: "Физ.",
  goalkeeping: "Врт.",
};

/** Six axes for the spider chart — outfield or GK-tuned. */
export function radarAxesForPlayer(
  attrs: PlayerAttributes,
  isGk: boolean
): RadarAxis[] {
  const keys: (keyof PlayerAttributes)[] = isGk
    ? ["goalkeeping", "physical", "passing", "pace", "defending", "shooting"]
    : ["pace", "physical", "shooting", "passing", "dribbling", "defending"];
  return keys.map((key) => ({
    key,
    label: SHORT_LABEL[key] ?? ATTRIBUTE_LABEL[key],
    value: Math.max(0, Math.min(99, Math.round(attrs[key] ?? 0))),
  }));
}

type Series = {
  values: number[];
  stroke: string;
  fill: string;
  label?: string;
  /** Stroke width for this series; secondary defaults thicker than primary. */
  strokeWidth?: number;
};

type Props = {
  axes: RadarAxis[];
  /** Second series only when real comparison data exists. */
  secondary?: Series | null;
  /** Legend label for the primary polygon (default: Текущие). */
  primaryLabel?: string;
  size?: number;
  stroke?: string;
  fill?: string;
  /** Primary polygon stroke width (default 2.5). */
  strokeWidth?: number;
};

function polar(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

export function PlayerRadar({
  axes,
  secondary = null,
  primaryLabel = "Текущие",
  size = 280,
  stroke = broadcast.accent,
  fill = broadcast.accentSoft,
  strokeWidth = 2.5,
}: Props) {
  const n = axes.length;
  const pad = 42;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - pad;
  const secondaryStrokeWidth = secondary?.strokeWidth ?? 4;

  const { grid, spokes, primaryPts, secondaryPts, labels } = useMemo(() => {
    const start = -Math.PI / 2;
    const step = (Math.PI * 2) / n;
    const angles = Array.from({ length: n }, (_, i) => start + i * step);

    const rings = [0.25, 0.5, 0.75, 1].map((t) =>
      angles
        .map((a) => {
          const p = polar(cx, cy, maxR * t, a);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(" ")
    );

    const spokeLines = angles.map((a) => {
      const p = polar(cx, cy, maxR, a);
      return { x2: p.x, y2: p.y };
    });

    const toPoly = (vals: number[]) =>
      angles
        .map((a, i) => {
          const t = Math.max(0, Math.min(1, (vals[i] ?? 0) / 100));
          const p = polar(cx, cy, maxR * t, a);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(" ");

    const labelNodes = angles.map((a, i) => {
      const p = polar(cx, cy, maxR + 28, a);
      return {
        x: p.x,
        y: p.y,
        value: axes[i]!.value,
        label: axes[i]!.label,
      };
    });

    return {
      grid: rings,
      spokes: spokeLines,
      primaryPts: toPoly(axes.map((ax) => ax.value)),
      secondaryPts: secondary ? toPoly(secondary.values) : null,
      labels: labelNodes,
    };
  }, [axes, secondary, cx, cy, maxR, n]);

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`}>
        <G>
          {grid.map((pts, i) => (
            <Polygon
              key={`ring-${i}`}
              points={pts}
              fill="none"
              stroke="rgba(232, 240, 234, 0.12)"
              strokeWidth={1}
            />
          ))}
          {spokes.map((s, i) => (
            <Line
              key={`spoke-${i}`}
              x1={cx}
              y1={cy}
              x2={s.x2}
              y2={s.y2}
              stroke={broadcast.chipBorder}
              strokeWidth={1}
            />
          ))}
          {secondaryPts && secondary ? (
            <Polygon
              points={secondaryPts}
              fill={secondary.fill}
              stroke={secondary.stroke}
              strokeWidth={secondaryStrokeWidth}
            />
          ) : null}
          <Polygon
            points={primaryPts}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          <Circle cx={cx} cy={cy} r={3} fill={stroke} />
          {labels.map((lb, i) => (
            <G key={`lb-${i}`}>
              <SvgText
                x={lb.x}
                y={lb.y - 4}
                fill={broadcast.white}
                fontSize={12}
                fontWeight="700"
                textAnchor="middle"
              >
                {String(lb.value)}
              </SvgText>
              <SvgText
                x={lb.x}
                y={lb.y + 10}
                fill={broadcast.mist}
                fontSize={9}
                fontWeight="600"
                textAnchor="middle"
              >
                {lb.label}
              </SvgText>
            </G>
          ))}
        </G>
      </Svg>
      {secondary?.label ? (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: stroke }]} />
            <Text style={styles.legendText}>{primaryLabel}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: secondary.stroke }]} />
            <Text style={styles.legendText}>{secondary.label}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function buildStyles() {
  return StyleSheet.create({
  wrap: { alignItems: "center", width: "100%" },
  legend: {
    flexDirection: "row",
    gap: 18,
    marginTop: 4,
    marginBottom: 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: {
    color: broadcast.mist,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});
}

let styles = buildStyles();
registerThemeRebuild(() => {
  styles = buildStyles();
});
