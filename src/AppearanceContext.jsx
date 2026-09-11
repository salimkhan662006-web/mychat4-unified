import { createContext, useContext, useState, useEffect } from "react";

const AppearanceContext = createContext(null);

const DEFAULTS = {
  smokeIntensity: 0.35,      // 0 (off) to 1 (dramatic) — maps to blob opacity/scale
  fontSize: "medium",        // "small" | "medium" | "large"
  messageSpacing: "comfortable", // "compact" | "comfortable"
  grainEnabled: true,
  glowIntensity: 0.5,        // 0 (flat) to 1 (very glowy) — maps to box-shadow strength
};

const STORAGE_KEY = "mychat4_appearance";

export function AppearanceProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  // Persist to localStorage whenever settings change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage unavailable (private browsing etc.) — fine, just won't persist
    }
  }, [settings]);

  // Apply everything as CSS custom properties on the root element so
  // every component's existing CSS can react instantly, no re-render
  // gymnastics needed.
  useEffect(() => {
    const root = document.documentElement;

    root.style.setProperty("--smoke-intensity", settings.smokeIntensity);
    root.style.setProperty("--glow-intensity", settings.glowIntensity);
    root.style.setProperty("--grain-opacity", settings.grainEnabled ? "0.025" : "0");

    const fontSizeMap = { small: "13px", medium: "14px", large: "15.5px" };
    root.style.setProperty("--chat-font-size", fontSizeMap[settings.fontSize]);

    const spacingMap = { compact: "12px", comfortable: "20px" };
    root.style.setProperty("--message-gap", spacingMap[settings.messageSpacing]);

    const bubblePaddingMap = { compact: "10px 14px", comfortable: "14px 18px" };
    root.style.setProperty("--bubble-padding", bubblePaddingMap[settings.messageSpacing]);
  }, [settings]);

  function updateSetting(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function resetToDefaults() {
    setSettings(DEFAULTS);
  }

  return (
    <AppearanceContext.Provider value={{ settings, updateSetting, resetToDefaults }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used within AppearanceProvider");
  return ctx;
}