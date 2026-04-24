/** HIVE dashboard UI preferences (browser-only, OPS4A+). */

export type HiveCoreVisibility = "off" | "subtle" | "full";
export type HiveCoreSize = "compact" | "standard" | "large";
export type HivePanelDensity = "comfortable" | "compact";
export type HiveAdvancedDefault = "closed" | "open";
export type HiveHeroStripMode = "hidden" | "compact" | "full";

export type HiveUiPrefs = {
  schema: 1;
  coreVisibility: HiveCoreVisibility;
  coreSize: HiveCoreSize;
  panelDensity: HivePanelDensity;
  advancedDefault: HiveAdvancedDefault;
  heroStrip: HiveHeroStripMode;
};

const STORAGE_KEY = "hive_ui_prefs_v1";

export const DEFAULT_HIVE_UI_PREFS: HiveUiPrefs = {
  schema: 1,
  coreVisibility: "full",
  coreSize: "standard",
  panelDensity: "comfortable",
  advancedDefault: "closed",
  heroStrip: "hidden",
};

function isCoreVis(v: unknown): v is HiveCoreVisibility {
  return v === "off" || v === "subtle" || v === "full";
}
function isCoreSize(v: unknown): v is HiveCoreSize {
  return v === "compact" || v === "standard" || v === "large";
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

export function loadHiveUiPrefs(): HiveUiPrefs {
  if (typeof window === "undefined") return DEFAULT_HIVE_UI_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_HIVE_UI_PREFS;
    const j = JSON.parse(raw) as Record<string, unknown>;
    if (j.schema !== 1) return DEFAULT_HIVE_UI_PREFS;
    return {
      schema: 1,
      coreVisibility: isCoreVis(j.coreVisibility) ? j.coreVisibility : DEFAULT_HIVE_UI_PREFS.coreVisibility,
      coreSize: isCoreSize(j.coreSize) ? j.coreSize : DEFAULT_HIVE_UI_PREFS.coreSize,
      panelDensity: isDensity(j.panelDensity) ? j.panelDensity : DEFAULT_HIVE_UI_PREFS.panelDensity,
      advancedDefault: isAdv(j.advancedDefault) ? j.advancedDefault : DEFAULT_HIVE_UI_PREFS.advancedDefault,
      heroStrip: isHero(j.heroStrip) ? j.heroStrip : DEFAULT_HIVE_UI_PREFS.heroStrip,
    };
  } catch {
    return DEFAULT_HIVE_UI_PREFS;
  }
}

export function saveHiveUiPrefs(p: HiveUiPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...p, schema: 1 as const }));
  } catch {
    /* quota / private mode */
  }
}
