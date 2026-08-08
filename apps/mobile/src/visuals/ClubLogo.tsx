import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { View, StyleSheet } from "react-native";
import type { Club } from "@fm/engine";

type FrameKind = "roundel" | "heater" | "rounded" | "diamond" | "oval" | "banner";
type FieldKind = "solid" | "stripes" | "halves" | "quarters" | "sash" | "chevron";

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function monogram(club: Club): string {
  // Prefer full name so crest letters match the brand (not opaque codes like «СБГ»).
  const fromName = club.name
    .replace(/[«»"']/g, "")
    .split(/[\s-]+/)
    .map((p) => p.replace(/[^A-Za-zА-Яа-яЁё0-9]/gu, ""))
    .filter(Boolean);
  if (fromName.length >= 2) return (fromName[0][0] + fromName[1][0]).toUpperCase();
  if (fromName.length === 1 && fromName[0].length >= 2) return fromName[0].slice(0, 2).toUpperCase();

  const parts = club.shortName.replace(/\./g, "").split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const raw = club.shortName.replace(/[^A-Za-zА-Яа-яЁё0-9]/gu, "");
  return (raw.slice(0, 2) || club.id.slice(0, 2)).toUpperCase();
}

function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 170;
}

/** Push club colors toward punchier saturation / readable midtones. */
function vivid(hex: string): string {
  const raw = hex.replace("#", "");
  if (raw.length < 6) return hex;
  let r = parseInt(raw.slice(0, 2), 16);
  let g = parseInt(raw.slice(2, 4), 16);
  let b = parseInt(raw.slice(4, 6), 16);
  const avg = (r + g + b) / 3;
  const sat = 1.45;
  r = Math.min(255, Math.max(0, Math.round(avg + (r - avg) * sat)));
  g = Math.min(255, Math.max(0, Math.round(avg + (g - avg) * sat)));
  b = Math.min(255, Math.max(0, Math.round(avg + (b - avg) * sat)));
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  if (lum < 48) {
    const lift = (48 - lum) * 0.85;
    r = Math.min(255, Math.round(r + lift));
    g = Math.min(255, Math.round(g + lift));
    b = Math.min(255, Math.round(b + lift));
  } else if (lum > 210) {
    const drop = (lum - 210) * 0.5;
    r = Math.max(0, Math.round(r - drop));
    g = Math.max(0, Math.round(g - drop));
    b = Math.max(0, Math.round(b - drop));
  }
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function contrastOn(bg: string, preferred: string, fallback = "#111111"): string {
  if (preferred.toUpperCase() === bg.toUpperCase()) return fallback;
  if (isLight(bg) && isLight(preferred)) return fallback;
  if (!isLight(bg) && !isLight(preferred) && preferred.toUpperCase() !== "#FFFFFF") {
    return "#FFFFFF";
  }
  return preferred;
}

function pickFrame(h: number): FrameKind {
  return (["roundel", "heater", "rounded", "diamond", "oval", "banner"] as const)[h % 6];
}

function pickField(h: number): FieldKind {
  return (["solid", "stripes", "halves", "quarters", "sash", "chevron"] as const)[h % 6];
}

/** Outer badge silhouette paths (viewBox 0–64). */
const FRAMES: Record<FrameKind, string> = {
  roundel: "", // drawn as Circle
  heater: "M14 8 H50 V34 C50 46 40 54 32 58 C24 54 14 46 14 34 Z",
  rounded: "M16 10 H48 Q52 10 52 16 V36 C52 48 40 54 32 58 C24 54 12 48 12 36 V16 Q12 10 16 10 Z",
  diamond: "M32 4 L58 32 L32 60 L6 32 Z",
  oval: "M32 6 C46 6 54 18 54 32 C54 46 46 58 32 58 C18 58 10 46 10 32 C10 18 18 6 32 6 Z",
  banner: "M12 10 H52 L56 18 V42 L52 54 H12 L8 42 V18 Z",
};

function FrameOutline({
  kind,
  fill,
  stroke,
  strokeWidth = 2.4,
}: {
  kind: FrameKind;
  fill: string;
  stroke: string;
  strokeWidth?: number;
}) {
  if (kind === "roundel") {
    return <Circle cx="32" cy="32" r="29" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  return <Path d={FRAMES[kind]} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}

function FieldPattern({
  kind,
  primary,
  secondary,
  clipId,
}: {
  kind: FieldKind;
  primary: string;
  secondary: string;
  clipId: string;
}) {
  const clip = `url(#${clipId})`;
  if (kind === "solid") {
    return <Rect x="0" y="0" width="64" height="64" fill={primary} clipPath={clip} />;
  }
  if (kind === "stripes") {
    return (
      <G clipPath={clip}>
        <Rect x="0" y="0" width="64" height="64" fill={primary} />
        {[10, 22, 34, 46].map((x) => (
          <Rect key={x} x={x} y="0" width="6" height="64" fill={secondary} />
        ))}
      </G>
    );
  }
  if (kind === "halves") {
    return (
      <G clipPath={clip}>
        <Rect x="0" y="0" width="32" height="64" fill={primary} />
        <Rect x="32" y="0" width="32" height="64" fill={secondary} />
      </G>
    );
  }
  if (kind === "quarters") {
    return (
      <G clipPath={clip}>
        <Rect x="0" y="0" width="32" height="32" fill={primary} />
        <Rect x="32" y="0" width="32" height="32" fill={secondary} />
        <Rect x="0" y="32" width="32" height="32" fill={secondary} />
        <Rect x="32" y="32" width="32" height="32" fill={primary} />
      </G>
    );
  }
  if (kind === "sash") {
    return (
      <G clipPath={clip}>
        <Rect x="0" y="0" width="64" height="64" fill={primary} />
        <Polygon points="0,18 0,34 64,50 64,34" fill={secondary} />
      </G>
    );
  }
  // chevron
  return (
    <G clipPath={clip}>
      <Rect x="0" y="0" width="64" height="64" fill={primary} />
      <Polygon points="32,10 58,34 50,34 32,20 14,34 6,34" fill={secondary} />
      <Polygon points="32,26 54,46 46,46 32,34 18,46 10,46" fill={secondary} />
    </G>
  );
}

function ClipShape({ kind, id }: { kind: FrameKind; id: string }) {
  if (kind === "roundel") {
    return (
      <ClipPath id={id}>
        <Circle cx="32" cy="32" r="27" />
      </ClipPath>
    );
  }
  return (
    <ClipPath id={id}>
      <Path d={FRAMES[kind]} />
    </ClipPath>
  );
}

/** Original motif glyphs — inspired by football heraldry, not real trademarks. */
function MotifGlyph({
  motif,
  color,
  accent,
}: {
  motif: string;
  color: string;
  accent: string;
}) {
  switch (motif) {
    case "star":
      return (
        <Polygon
          points="32,14 35.5,24.5 46.5,24.5 37.5,31 41,42 32,35.5 23,42 26.5,31 17.5,24.5 28.5,24.5"
          fill={color}
        />
      );
    case "sun":
      return (
        <G>
          <Circle cx="32" cy="30" r="8" fill={color} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
            const r = (deg * Math.PI) / 180;
            const x1 = 32 + Math.cos(r) * 11;
            const y1 = 30 + Math.sin(r) * 11;
            const x2 = 32 + Math.cos(r) * 16;
            const y2 = 30 + Math.sin(r) * 16;
            return (
              <Line
                key={deg}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            );
          })}
        </G>
      );
    case "diamond":
      return <Polygon points="32,16 46,30 32,44 18,30" fill={color} stroke={accent} strokeWidth="1.2" />;
    case "gem":
      return (
        <G>
          <Polygon points="32,14 46,28 32,48 18,28" fill={color} />
          <Polygon points="32,14 39,28 32,34 25,28" fill={accent} opacity={0.45} />
        </G>
      );
    case "wave":
      return (
        <G>
          <Path d="M12 28 Q20 20 28 28 T44 28 T56 28" stroke={color} strokeWidth="3" fill="none" />
          <Path d="M12 36 Q20 28 28 36 T44 36 T56 36" stroke={color} strokeWidth="2.4" fill="none" opacity={0.75} />
        </G>
      );
    case "shield":
      return (
        <Path d="M24 16 H40 V30 C40 38 34 44 32 46 C30 44 24 38 24 30 Z" fill={color} stroke={accent} strokeWidth="1" />
      );
    case "cross":
      return (
        <G>
          <Rect x="28" y="14" width="8" height="32" rx="1" fill={color} />
          <Rect x="18" y="24" width="28" height="8" rx="1" fill={color} />
        </G>
      );
    case "rail":
      return (
        <G>
          <Rect x="18" y="22" width="28" height="4" fill={color} />
          <Rect x="18" y="32" width="28" height="4" fill={color} />
          <Rect x="22" y="18" width="3" height="22" fill={accent} />
          <Rect x="31" y="18" width="3" height="22" fill={accent} />
          <Rect x="40" y="18" width="3" height="22" fill={accent} />
        </G>
      );
    case "bull":
      return (
        <G>
          <Ellipse cx="32" cy="32" rx="11" ry="9" fill={color} />
          <Path d="M18 22 L14 14 L22 24 Z" fill={color} />
          <Path d="M46 22 L50 14 L42 24 Z" fill={color} />
          <Circle cx="27" cy="30" r="1.6" fill={accent} />
          <Circle cx="37" cy="30" r="1.6" fill={accent} />
        </G>
      );
    case "wolf":
      return (
        <Path
          d="M18 38 L22 24 L28 28 L32 18 L36 28 L42 24 L46 38 L40 42 L32 36 L24 42 Z"
          fill={color}
        />
      );
    case "lion":
      return (
        <G>
          <Circle cx="32" cy="26" r="7" fill={color} />
          <Path d="M24 22 Q20 16 24 14 Q28 18 26 22" fill={color} />
          <Path d="M40 22 Q44 16 40 14 Q36 18 38 22" fill={color} />
          <Path d="M28 32 L30 44 L34 44 L36 32 Z" fill={color} />
          <Path d="M34 40 L42 36 L40 42 Z" fill={color} />
        </G>
      );
    case "eagle":
      return (
        <Path
          d="M32 18 L36 28 L52 24 L40 34 L44 46 L32 38 L20 46 L24 34 L12 24 L28 28 Z"
          fill={color}
        />
      );
    case "bird":
      return (
        <Path d="M18 34 Q28 18 40 28 Q48 22 50 28 Q44 36 36 36 L32 44 L28 36 Q20 38 18 34 Z" fill={color} />
      );
    case "gull":
      return (
        <Path d="M12 34 Q24 22 32 30 Q40 22 52 34" stroke={color} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      );
    case "magpie":
      return (
        <G>
          <Ellipse cx="30" cy="30" rx="10" ry="7" fill={color} />
          <Path d="M38 28 L50 22 L44 32 Z" fill={color} />
          <Circle cx="26" cy="28" r="1.4" fill={accent} />
        </G>
      );
    case "cockerel":
      return (
        <G>
          <Path d="M28 40 L30 28 L36 26 L38 34 L42 30 L40 40 Z" fill={color} />
          <Circle cx="34" cy="24" r="5" fill={color} />
          <Path d="M34 18 L36 12 L38 18" fill={accent} />
          <Path d="M38 24 L44 22" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        </G>
      );
    case "fox":
      return (
        <Path d="M18 40 L22 22 L32 28 L42 22 L46 40 L38 36 L32 44 L26 36 Z" fill={color} />
      );
    case "bear":
      return (
        <G>
          <Circle cx="22" cy="22" r="5" fill={color} />
          <Circle cx="42" cy="22" r="5" fill={color} />
          <Ellipse cx="32" cy="32" rx="14" ry="12" fill={color} />
          <Circle cx="27" cy="30" r="1.5" fill={accent} />
          <Circle cx="37" cy="30" r="1.5" fill={accent} />
        </G>
      );
    case "dog":
      return (
        <G>
          <Ellipse cx="32" cy="32" rx="12" ry="10" fill={color} />
          <Path d="M20 24 L16 14 L26 24" fill={color} />
          <Path d="M44 24 L48 14 L38 24" fill={color} />
          <Ellipse cx="32" cy="36" rx="5" ry="3.5" fill={accent} opacity={0.5} />
        </G>
      );
    case "horse":
    case "foal":
      return (
        <Path d="M20 42 L24 28 L30 24 L34 16 L40 20 L38 28 L46 32 L42 42 L34 38 L28 42 Z" fill={color} />
      );
    case "deer":
      return (
        <G>
          <Ellipse cx="32" cy="34" rx="10" ry="8" fill={color} />
          <Path d="M26 26 L22 14 M26 20 L18 16 M38 26 L42 14 M38 20 L46 16" stroke={color} strokeWidth="2" />
          <Circle cx="36" cy="32" r="1.4" fill={accent} />
        </G>
      );
    case "bat":
      return (
        <Path d="M10 34 Q20 18 28 28 L32 22 L36 28 Q44 18 54 34 Q42 28 32 36 Q22 28 10 34 Z" fill={color} />
      );
    case "bee":
      return (
        <G>
          <Ellipse cx="32" cy="30" rx="9" ry="7" fill={color} />
          <Line x1="26" y1="30" x2="38" y2="30" stroke={accent} strokeWidth="2" />
          <Line x1="27" y1="26" x2="37" y2="26" stroke={accent} strokeWidth="1.5" />
          <Path d="M22 24 Q18 18 24 20" stroke={color} strokeWidth="2" fill="none" />
          <Path d="M42 24 Q46 18 40 20" stroke={color} strokeWidth="2" fill="none" />
        </G>
      );
    case "snake":
      return (
        <Path
          d="M18 40 Q22 22 32 28 Q42 34 46 20"
          stroke={color}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      );
    case "griffin":
      return (
        <Path d="M20 40 L26 24 L32 28 L38 16 L44 26 L50 24 L42 40 L32 34 Z" fill={color} />
      );
    case "parrot":
      return (
        <G>
          <Ellipse cx="30" cy="30" rx="9" ry="11" fill={color} />
          <Path d="M36 28 L48 26 L38 34 Z" fill={accent} />
          <Circle cx="28" cy="26" r="1.5" fill={accent} />
        </G>
      );
    case "stork":
      return (
        <G>
          <Ellipse cx="30" cy="30" rx="8" ry="6" fill={color} />
          <Path d="M36 30 L50 26" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
          <Line x1="28" y1="36" x2="26" y2="46" stroke={color} strokeWidth="2" />
          <Line x1="34" y1="36" x2="36" y2="46" stroke={color} strokeWidth="2" />
        </G>
      );
    case "wing":
      return (
        <Path d="M14 36 Q24 16 34 28 Q28 20 40 16 Q36 28 48 24 Q40 34 52 36 Q36 40 14 36 Z" fill={color} />
      );
    case "cannon":
      return (
        <G>
          <Rect x="14" y="28" width="28" height="8" rx="2" fill={color} />
          <Circle cx="44" cy="32" r="5" fill={color} />
          <Rect x="18" y="36" width="4" height="8" fill={accent} />
          <Rect x="28" y="36" width="4" height="8" fill={accent} />
        </G>
      );
    case "hammers":
      return (
        <G>
          <Path d="M18 40 L28 20 L34 24 L24 44 Z" fill={color} />
          <Path d="M46 40 L36 20 L30 24 L40 44 Z" fill={color} />
          <Rect x="16" y="18" width="12" height="5" rx="1" fill={accent} />
          <Rect x="36" y="18" width="12" height="5" rx="1" fill={accent} />
        </G>
      );
    case "tower":
      return (
        <G>
          <Rect x="22" y="24" width="20" height="22" fill={color} />
          <Rect x="20" y="18" width="6" height="8" fill={color} />
          <Rect x="29" y="18" width="6" height="8" fill={color} />
          <Rect x="38" y="18" width="6" height="8" fill={color} />
          <Rect x="28" y="32" width="8" height="14" fill={accent} opacity={0.55} />
        </G>
      );
    case "tree":
    case "oak":
      return (
        <G>
          <Rect x="29" y="34" width="6" height="14" fill={accent} />
          <Circle cx="32" cy="26" r="12" fill={color} />
          <Circle cx="24" cy="30" r="7" fill={color} />
          <Circle cx="40" cy="30" r="7" fill={color} />
        </G>
      );
    case "palm":
      return (
        <G>
          <Line x1="32" y1="44" x2="32" y2="26" stroke={accent} strokeWidth="3" />
          <Path d="M32 28 Q18 18 14 24 Q24 24 32 28" fill={color} />
          <Path d="M32 28 Q46 18 50 24 Q40 24 32 28" fill={color} />
          <Path d="M32 26 Q32 12 26 14 Q30 20 32 26" fill={color} />
          <Path d="M32 26 Q32 12 38 14 Q34 20 32 26" fill={color} />
        </G>
      );
    case "lily":
      return (
        <Path d="M32 44 L32 30 M32 30 Q22 22 20 14 Q28 20 32 28 Q36 20 44 14 Q42 22 32 30 Z" stroke={color} strokeWidth="2.4" fill={color} />
      );
    case "cherry":
      return (
        <G>
          <Circle cx="26" cy="34" r="7" fill={color} />
          <Circle cx="38" cy="30" r="7" fill={color} />
          <Path d="M26 28 Q32 18 38 24" stroke={accent} strokeWidth="2" fill="none" />
        </G>
      );
    case "flame":
      return (
        <Path d="M32 46 C22 38 24 28 28 22 C30 28 34 28 34 22 C40 28 42 36 32 46 Z" fill={color} />
      );
    case "bolt":
      return <Polygon points="36,12 24,32 32,32 28,48 44,26 34,26" fill={color} />;
    case "crown":
      return (
        <Path d="M16 36 L20 20 L28 30 L32 16 L36 30 L44 20 L48 36 Z" fill={color} stroke={accent} strokeWidth="1" />
      );
    case "halo":
      return (
        <G>
          <Ellipse cx="32" cy="22" rx="14" ry="5" fill="none" stroke={color} strokeWidth="3" />
          <Circle cx="32" cy="36" r="10" fill={color} opacity={0.85} />
        </G>
      );
    case "ball":
      return (
        <G>
          <Circle cx="32" cy="30" r="12" fill={color} stroke={accent} strokeWidth="1.5" />
          <Path d="M32 18 L36 30 L32 42 L28 30 Z" fill={accent} opacity={0.5} />
          <Path d="M20 26 Q32 22 44 26" stroke={accent} strokeWidth="1.2" fill="none" />
          <Path d="M20 34 Q32 38 44 34" stroke={accent} strokeWidth="1.2" fill="none" />
        </G>
      );
    case "anchor":
      return (
        <G>
          <Circle cx="32" cy="18" r="4" fill="none" stroke={color} strokeWidth="2.5" />
          <Line x1="32" y1="22" x2="32" y2="44" stroke={color} strokeWidth="3" />
          <Path d="M20 36 Q20 46 32 46 Q44 46 44 36" stroke={color} strokeWidth="3" fill="none" />
          <Line x1="24" y1="30" x2="40" y2="30" stroke={color} strokeWidth="2.5" />
        </G>
      );
    case "boat":
      return (
        <G>
          <Path d="M14 36 L50 36 L44 44 H20 Z" fill={color} />
          <Path d="M32 16 L32 36 M32 16 L44 34 M32 16 L22 34" stroke={accent} strokeWidth="2" fill="none" />
        </G>
      );
    case "sub":
      return (
        <G>
          <Ellipse cx="32" cy="32" rx="18" ry="8" fill={color} />
          <Rect x="28" y="22" width="8" height="6" fill={color} />
          <Circle cx="22" cy="32" r="2" fill={accent} />
          <Circle cx="30" cy="32" r="2" fill={accent} />
          <Circle cx="38" cy="32" r="2" fill={accent} />
        </G>
      );
    case "wheel":
      return (
        <G>
          <Circle cx="32" cy="30" r="12" fill="none" stroke={color} strokeWidth="3" />
          <Circle cx="32" cy="30" r="3" fill={color} />
          {[0, 60, 120, 180, 240, 300].map((deg) => {
            const r = (deg * Math.PI) / 180;
            return (
              <Line
                key={deg}
                x1="32"
                y1="30"
                x2={32 + Math.cos(r) * 12}
                y2={30 + Math.sin(r) * 12}
                stroke={color}
                strokeWidth="2"
              />
            );
          })}
        </G>
      );
    case "flag":
      return (
        <G>
          <Line x1="22" y1="16" x2="22" y2="46" stroke={accent} strokeWidth="2.5" />
          <Path d="M22 16 H46 L40 24 L46 32 H22 Z" fill={color} />
        </G>
      );
    case "skull":
      return (
        <G>
          <Ellipse cx="32" cy="28" rx="11" ry="10" fill={color} />
          <Circle cx="27" cy="27" r="2.2" fill={accent} />
          <Circle cx="37" cy="27" r="2.2" fill={accent} />
          <Path d="M28 36 H36 V40 H28 Z" fill={accent} opacity={0.7} />
        </G>
      );
    case "ladder":
      return (
        <G>
          <Line x1="24" y1="16" x2="24" y2="46" stroke={color} strokeWidth="3" />
          <Line x1="40" y1="16" x2="40" y2="46" stroke={color} strokeWidth="3" />
          {[20, 28, 36, 44].map((y) => (
            <Line key={y} x1="24" y1={y} x2="40" y2={y} stroke={color} strokeWidth="2.5" />
          ))}
        </G>
      );
    case "eiffel":
      return (
        <Path d="M28 48 L30 20 L34 20 L36 48 M22 36 H42 M26 28 H38" stroke={color} strokeWidth="2.4" fill="none" />
      );
    case "goddess":
      return (
        <G>
          <Circle cx="32" cy="22" r="6" fill={color} />
          <Path d="M22 44 L26 28 H38 L42 44 Z" fill={color} />
          <Path d="M26 18 Q32 10 38 18" stroke={accent} strokeWidth="2" fill="none" />
        </G>
      );
    case "ermine":
      return (
        <G>
          {[
            [22, 22],
            [32, 18],
            [42, 22],
            [26, 32],
            [38, 32],
            [32, 40],
          ].map(([x, y]) => (
            <Path key={`${x}-${y}`} d={`M${x} ${y} l2 -4 l2 4 l-2 1 z`} fill={color} />
          ))}
        </G>
      );
    case "pepper":
      return (
        <Path d="M28 20 Q20 28 24 40 Q32 48 40 40 Q44 28 36 20 Q34 14 28 20 Z" fill={color} />
      );
    case "zebra":
      return (
        <G>
          <Ellipse cx="32" cy="30" rx="14" ry="12" fill={color} />
          {[20, 26, 32, 38, 44].map((x) => (
            <Rect key={x} x={x} y="18" width="3.5" height="24" fill={accent} opacity={0.9} />
          ))}
        </G>
      );
    case "devil":
      // Geometric horned mask — not a real club devil trademark
      return (
        <G>
          <Path d="M20 18 L26 28 L22 40 L32 36 L42 40 L38 28 L44 18 L36 24 L32 16 L28 24 Z" fill={color} />
          <Circle cx="28" cy="30" r="1.8" fill={accent} />
          <Circle cx="36" cy="30" r="1.8" fill={accent} />
        </G>
      );
    default:
      return (
        <Path d="M24 16 H40 V30 C40 38 34 44 32 46 C30 44 24 38 24 30 Z" fill={color} />
      );
  }
}

function Ribbon({
  letters,
  fill,
  text,
}: {
  letters: string;
  fill: string;
  text: string;
}) {
  return (
    <G>
      <Path d="M10 48 L16 44 H48 L54 48 L48 56 H16 Z" fill={fill} />
      <Path d="M10 48 L14 52 L16 44 Z" fill={fill} opacity={0.75} />
      <Path d="M54 48 L50 52 L48 44 Z" fill={fill} opacity={0.75} />
      <SvgText
        x="32"
        y="52.5"
        textAnchor="middle"
        fontSize={letters.length > 2 ? 7.5 : 9.5}
        fontWeight="800"
        fill={text}
        letterSpacing="0.6"
      >
        {letters}
      </SvgText>
    </G>
  );
}

/**
 * Procedural football crest — heraldic frames, 2-color fields, motif glyphs.
 * Stable per club.id; inspired by badge collage style, never a 1:1 real trademark.
 * Drawn with a soft 3D / enamel look (chrome rim, specular, glow) without changing
 * the badge silhouette or heraldry.
 */
export function ClubLogo({
  club,
  size = 36,
}: {
  club: Club;
  size?: number;
}) {
  const h = hash(club.id);
  const h2 = hash(club.id + ":crest");
  const primary = vivid(club.colors?.[0] || "#1F6F4A");
  const secondary = vivid(club.colors?.[1] || "#FFFFFF");
  const motif = club.crest ?? ["star", "shield", "wave", "diamond", "bull"][h % 5];
  const letters = monogram(club);

  const frame = pickFrame(h);
  const field = pickField(h2);
  const safeId = club.id.replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `crest-clip-${safeId}-${h.toString(36)}-${size}`;
  const glossId = `crest-gloss-${safeId}-${h.toString(36)}-${size}`;
  const glowId = `crest-glow-${safeId}-${h.toString(36)}-${size}`;
  const sheenId = `crest-sheen-${safeId}-${h.toString(36)}-${size}`;

  // High-contrast rim so badges pop on dark UI — warm metal for 3D bevel
  const border = isLight(primary) ? "#121212" : "#F2E6B8";
  const chromeHi = "#F4E2A8";
  const chromeLo = "#8A6A28";
  const motifColor = contrastOn(
    field === "halves" || field === "quarters" || field === "stripes" ? primary : primary,
    secondary,
    isLight(primary) ? "#111111" : "#FFFFFF",
  );
  // On busy fields, lift motif onto a small disc so it stays readable
  const useDisc = field !== "solid" || frame === "roundel";
  const discFill = isLight(secondary) ? "#FFFFFF" : vivid(secondary);
  const discMotif = contrastOn(discFill, primary, "#111111");
  const ribbonFill = isLight(secondary) ? "#FFFFFF" : vivid(secondary);
  const ribbonText = contrastOn(ribbonFill, primary, "#111111");

  const showStars = club.reputation >= 90;
  const showInnerRing = frame === "roundel" || frame === "oval";

  return (
    <View
      style={[
        styles.crestShell,
        {
          width: size,
          height: size,
          shadowColor: primary,
        },
      ]}
      pointerEvents="none"
    >
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Defs>
          <ClipShape kind={frame} id={clipId} />
          <RadialGradient id={glowId} cx="50%" cy="48%" rx="52%" ry="52%">
            <Stop offset="0" stopColor={primary} stopOpacity="0.35" />
            <Stop offset="0.55" stopColor={secondary} stopOpacity="0.12" />
            <Stop offset="1" stopColor={primary} stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id={glossId} x1="0.2" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.42" />
            <Stop offset="0.28" stopColor="#FFFFFF" stopOpacity="0.12" />
            <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0.22" />
          </LinearGradient>
          <RadialGradient id={sheenId} cx="32%" cy="28%" rx="42%" ry="36%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
            <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.12" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Soft colored aura behind the badge */}
        <Circle cx="32" cy="33" r="31" fill={`url(#${glowId})`} />

        {/* Drop shadow for depth */}
        <G opacity={0.35} transform="translate(1.2, 2.2)">
          <FrameOutline kind={frame} fill="#000000" stroke="#000000" strokeWidth={2} />
        </G>

        {/* Chrome bevel ring */}
        <FrameOutline kind={frame} fill={chromeLo} stroke={chromeHi} strokeWidth={4.2} />
        <FrameOutline kind={frame} fill={primary} stroke={border} strokeWidth={2.4} />
        <FieldPattern kind={field} primary={primary} secondary={secondary} clipId={clipId} />

        {/* Enamel gloss over the field */}
        <Rect
          x="0"
          y="0"
          width="64"
          height="64"
          fill={`url(#${glossId})`}
          clipPath={`url(#${clipId})`}
          opacity={0.85}
        />
        <Ellipse
          cx="24"
          cy="20"
          rx="14"
          ry="10"
          fill={`url(#${sheenId})`}
          clipPath={`url(#${clipId})`}
        />

        {/* Inner track on roundels — classic football badge feel */}
        {showInnerRing && (
          <Circle
            cx="32"
            cy="30"
            r="22"
            fill="none"
            stroke={chromeHi}
            strokeWidth="1.6"
            opacity={0.75}
          />
        )}

        {/* Prestige stars (not tied to any real club star count trademark) */}
        {showStars && (
          <G>
            <Polygon
              points="32,5 33.2,8 36.5,8 33.8,10 34.8,13 32,11.2 29.2,13 30.2,10 27.5,8 30.8,8"
              fill={chromeHi}
              stroke={chromeLo}
              strokeWidth="0.5"
            />
          </G>
        )}

        {/* Motif — scale around crest center so glyphs fit the disc */}
        {useDisc ? (
          <G>
            <Circle cx="32" cy="27" r="13.5" fill={discFill} stroke={border} strokeWidth="1.2" />
            <G transform="translate(32, 27) scale(0.7) translate(-32, -30)">
              <MotifGlyph motif={motif} color={discMotif} accent={border} />
            </G>
          </G>
        ) : (
          <G transform="translate(32, 26) scale(0.85) translate(-32, -30)">
            <MotifGlyph motif={motif} color={motifColor} accent={border} />
          </G>
        )}

        <Ribbon letters={letters} fill={ribbonFill} text={ribbonText} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  crestShell: {
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});
