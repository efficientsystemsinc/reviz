"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DEFAULT_PALETTE_ID,
  PALETTES,
  getPalette,
  paletteToCssVars,
  type RevizPalette,
} from "./theme";

interface ThemeContextValue {
  palette: RevizPalette;
  paletteId: string;
  palettes: RevizPalette[];
  mode: "light" | "dark";
  setPaletteId: (id: string) => void;
  /** Override individual palette tokens at runtime (live color customization). */
  setOverrides: (o: Partial<RevizPalette>) => void;
  overrides: Partial<RevizPalette>;
  resetOverrides: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Graceful fallback so individual components can render in isolation
    // (e.g. inside generated/exported code) without a provider.
    const palette = getPalette(DEFAULT_PALETTE_ID);
    return {
      palette,
      paletteId: palette.id,
      palettes: PALETTES,
      mode: palette.mode,
      setPaletteId: () => {},
      setOverrides: () => {},
      overrides: {},
      resetOverrides: () => {},
    };
  }
  return ctx;
}

/** Just the resolved palette — the common case for visualization components. */
export function usePalette(): RevizPalette {
  return useTheme().palette;
}

export function ThemeProvider({
  children,
  initialPaletteId = DEFAULT_PALETTE_ID,
}: {
  children: ReactNode;
  initialPaletteId?: string;
}) {
  const [paletteId, setPaletteId] = useState(initialPaletteId);
  const [overrides, setOverridesState] = useState<Partial<RevizPalette>>({});

  const palette = useMemo<RevizPalette>(
    () => ({ ...getPalette(paletteId), ...overrides }),
    [paletteId, overrides],
  );

  const setOverrides = useCallback((o: Partial<RevizPalette>) => {
    setOverridesState((prev) => ({ ...prev, ...o }));
  }, []);

  const resetOverrides = useCallback(() => setOverridesState({}), []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      palette,
      paletteId,
      palettes: PALETTES,
      mode: palette.mode,
      setPaletteId: (id) => {
        setPaletteId(id);
        setOverridesState({});
      },
      setOverrides,
      overrides,
      resetOverrides,
    }),
    [palette, paletteId, overrides, setOverrides, resetOverrides],
  );

  const style = paletteToCssVars(palette) as CSSProperties;

  return (
    <ThemeContext.Provider value={value}>
      <div data-reviz-root data-mode={palette.mode} style={style} className="contents">
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

/**
 * Apply a specific palette to a subtree, independent of the global theme.
 * Used by component previews and the editor canvas so a figure can be shown in
 * any palette without changing the surrounding app chrome.
 */
export function ThemeScope({
  palette,
  children,
  className,
  style,
}: {
  palette: RevizPalette;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const merged = useMemo<ThemeContextValue>(
    () => ({
      palette,
      paletteId: palette.id,
      palettes: PALETTES,
      mode: palette.mode,
      setPaletteId: () => {},
      setOverrides: () => {},
      overrides: {},
      resetOverrides: () => {},
    }),
    [palette],
  );
  const vars = paletteToCssVars(palette) as CSSProperties;
  return (
    <ThemeContext.Provider value={merged}>
      <div
        data-reviz-scope
        data-mode={palette.mode}
        style={{ ...vars, ...style }}
        className={className}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
