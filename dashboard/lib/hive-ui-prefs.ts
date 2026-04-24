/** HIVE dashboard UI preferences (browser-only). OPS4B: full-screen background model. */

export type HiveBgVisibility = "full" | "subtle" | "off";
export type HiveBgIntensity = "low" | "medium" | "high";
export type HivePanelDensity = "comfortable" | "compact";
export type HiveAdvancedDefault = "closed" | "open";
export type HiveHeroStripMode = "hidden" | "compact" | "full";

export type HiveUiPrefs = {
  schema: 2;
  backgroundVisibility: HiveBgVisibility;
  backgroundIntensity: HiveBgIntensity;
  panelDensity: HivePanelDensity;
  advancedDefault: HiveAdvancedDefault;
  heroStrip: HiveHeroStripMode;
};

const STORAGE_KEY = "hive_ui_prefs_v1";

export const DEFAULT_HIVE_UI_PREFS: HiveUiPrefs = {
  schema: 2,
  backgroundVisibility: "full",
  backgroundIntensity: "medium",
  panelDensity: "comfortable",
  advancedDefault: "closed",
  heroStrip: "hidden",
};

function isBgVis(v: unknown): v is HiveBgVisibility {
  return v === "full" || v === "subtle" || v === "off";
}
function isBgInt(v: unknown): v is HiveBgIntensity {
  return v === "low" || v === "medium" || v === "high";
}
function isDensity(v: unknown): v is HivePanelDensity {
  return v === "comfortable" || v === "compact";
}
function isAdv(v: unknown): v is HiveAdvancedDefault {
  return v === "closed" || v === "open";
}
function isHero(v: unknown): v is HiveHeroStripMode {
  return v === "hidden" || v === "compact" || v === "full";
}

type LegacyV1 = {
  schema?: number;
  coreVisibility?: string;
  coreSize?: string;
  panelDensity?: string;
  advancedDefault?: string;
  heroStrip?: string;
};

function migrateFromV1(j: LegacyV1): HiveUiPrefs {
  const vis =
    j.coreVisibility === "off" || j.coreVisibility === "subtle" || j.coreVisibility === "full"
      ? j.coreVisibility === "off"
        ? "off"
        : j.coreVisibility === "subtle"
          ? "subtle"
          : "full"
      : DEFAULT_HIVE_UI_PREFS.backgroundVisibility;
  return {
    schema: 2,
    backgroundVisibility: vis,
    backgroundIntensity: DEFAULT_HIVE_UI_PREFS.backgroundIntensity,
    panelDensity: isDensity(j.panelDensity) ? j.panelDensity : DEFAULT_HIVE_UI_PREFS.panelDensity,
    advancedDefault: isAdv(j.advancedDefault) ? j.advancedDefault : DEFAULT_HIVE_UI_PREFS.advancedDefault,
    heroStrip: isHero(j.heroStrip) ? j.heroStrip : DEFAULT_HIVE_UI_PREFS.heroStrip,
  };
}

export function loadHiveUiPrefs(): HiveUiPrefs {
  if (typeof window === "undefined") return DEFAULT_HIVE_UI_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_HIVE_UI_PREFS;
    const j = JSON.parse(raw) as Record<string, unknown>;
    if (j.schema === 2) {
      return {
        schema: 2,
        backgroundVisibility: isBgVis(j.backgroundVisibility)
          ? j.backgroundVisibility
          : DEFAULT_HIVE_UI_PREFS.backgroundVisibility,
        backgroundIntensity: isBgInt(j.backgroundIntensity)
          ? j.backgroundIntensity
          : DEFAULT_HIVE_UI_PREFS.backgroundIntensity,
        panelDensity: isDensity(j.panelDensity) ? j.panelDensity : DEFAULT_HIVE_UI_PREFS.panelDensity,
        advancedDefault: isAdv(j.advancedDefault) ? j.advancedDefault : DEFAULT_HIVE_UI_PREFS.advancedDefault,
        heroStrip: isHero(j.heroStrip) ? j.heroStrip : DEFAULT_HIVE_UI_PREFS.heroStrip,
      };
    }
    if (j.schema === 1 || "coreVisibility" in j) {
      return migrateFromV1(j as LegacyV1);
    }
    return DEFAULT_HIVE_UI_PREFS;
  } catch {
    return DEFAULT_HIVE_UI_PREFS;
  }
}

export function saveHiveUiPrefs(p: HiveUiPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...p, schema: 2 as const }));
  } catch {
    /* quota / private mode */
  }
}
