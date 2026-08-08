import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import {
  broadcast,
  getThemeMode,
  setThemeMode,
  subscribeTheme,
  toggleThemeMode,
  type ThemeMode,
} from "./broadcastTheme";

export const THEME_STORAGE_KEY = "touchline.theme.v1";

type ThemeContextValue = {
  mode: ThemeMode;
  isLight: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribeTheme, getThemeMode, getThemeMode);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (!cancelled && (raw === "light" || raw === "dark")) {
          setThemeMode(raw);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
  }, [mode, hydrated]);

  const setMode = useCallback((next: ThemeMode) => {
    setThemeMode(next);
  }, []);

  const toggle = useCallback(() => {
    toggleThemeMode();
  }, []);

  const value = useMemo(
    () => ({
      mode,
      isLight: mode === "light",
      setMode,
      toggle,
    }),
    [mode, setMode, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      mode: getThemeMode(),
      isLight: getThemeMode() === "light",
      setMode: setThemeMode,
      toggle: toggleThemeMode,
    };
  }
  return ctx;
}

function SunIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" pointerEvents="none">
      <Circle cx="12" cy="12" r="4.2" fill="none" stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 2.5 V5.2 M12 18.8 V21.5 M2.5 12 H5.2 M18.8 12 H21.5 M5.2 5.2 L7.1 7.1 M16.9 16.9 L18.8 18.8 M18.8 5.2 L16.9 7.1 M7.1 16.9 L5.2 18.8"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function MoonIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" pointerEvents="none">
      <Path
        d="M19.5 13.2 A7.4 7.4 0 1 1 10.8 4.5 A6.2 6.2 0 1 0 19.5 13.2 Z"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Floating light/dark switch — top-right of the career screen. */
export function ThemeToggle({ style }: { style?: StyleProp<ViewStyle> }) {
  const { mode, toggle } = useTheme();
  const isLight = mode === "light";

  return (
    <Pressable
      onPress={toggle}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={isLight ? "Тёмное оформление" : "Светлое оформление"}
      style={({ pressed }) => [
        {
          position: "absolute",
          /** Below status bar / Dynamic Island (matches App `styles.root` paddingTop). */
          top: 56 + 8,
          right: 16,
          zIndex: 200,
          elevation: 200,
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: broadcast.radiusPill,
          backgroundColor: broadcast.chipBg,
          borderWidth: 1,
          borderColor: broadcast.chipBorder,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {isLight ? <MoonIcon color={broadcast.white} /> : <SunIcon color={broadcast.white} />}
    </Pressable>
  );
}
