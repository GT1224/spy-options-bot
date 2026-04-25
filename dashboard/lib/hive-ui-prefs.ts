/** HIVE dashboard UI preferences (browser-only). HIVE-UICTRL-1: operator shell + presets. */

import type { CSSProperties } from "react";

export type HiveBgVisibility = "full" | "subtle" | "off";
export type HiveBgIntensity = "low" | "medium" | "high";
export type HivePanelDensity = "comfortable" | "compact";
export type HiveAdvancedDefault = "closed" | "open";
export type HiveHeroStripMode = "hidden" | "compact" | "full";

export type HiveShellTier = "low" | "medium" | "high";
export type HiveLayoutDensity = "compact" | "normal" | "roomy";
export type HiveMotionLevel = "off" | "low" | "high";
export type HiveReadability = "standard" | "high_contrast" | "relaxed";

/** HIVE-UICTRL-2: macro shell width / orbit rhythm (distinct from layoutDensity spacing). */
export type HiveLayoutMode = "compact" | "command_center" | "wide";

/** Pulse context bar: collapsed keeps bias/score/delta visible in a tighter strip (never fully removed). */
export type HivePulseContextMode = "full" | "collapsed";

/** Operator readout + treasury rails: collapsed soft-fades secondary treasury detail (lifecycle rail stays). */
export type HiveOrbitReadoutMode = "full" | "collapsed";

/** UICTRL-3: supplementary panels — may hide when non-critical. */
export type HivePanelTri = "full" | "collapsed" | "hidden";
/** UICTRL-3: truth-adjacent or deck bands — never hidden in prefs UI for rails. */
export type HivePanelBi = "full" | "collapsed";

/** Quick-glance body scale (tactical deck + readout rails). */
export type HiveGlanceScale = "standard" | "large" | "xlarge";
/** Deck / rail label cadence (scoped in CSS to tactical deck field labels). */
export type HiveLabelDensity = "normal" | "minimal" | "dense";

export type HiveUiPresetId =
  | "stealth"
  | "command_center"
  | "operator_compact"
  | "swarm_intelligence"
  | "night_ops"
  | "presentation_mode"
  | "custom";

/** Presets shown in Configure (excludes implicit Custom state). */
export type HiveUiPresetApplyId = Exclude<HiveUiPresetId, "custom">;

export type HiveUiPrefs = {
  schema: 3;
  activePreset: HiveUiPresetId;
  backgroundVisibility: HiveBgVisibility;
  backgroundIntensity: HiveBgIntensity;
  scrimStrength: HiveShellTier;
  glassIntensity: HiveShellTier;
  borderGlow: HiveShellTier;
  accentStrength: HiveShellTier;
  shadowDepth: HiveShellTier;
  panelDensity: HivePanelDensity;
  layoutDensity: HiveLayoutDensity;
  advancedDefault: HiveAdvancedDefault;
  heroStrip: HiveHeroStripMode;
  motionLevel: HiveMotionLevel;
  readability: HiveReadability;
  /** UICTRL-2 */
  layoutMode: HiveLayoutMode;
  pulseContextMode: HivePulseContextMode;
  orbitReadoutMode: HiveOrbitReadoutMode;
  /** Bee log, diagnostics, and secondary deck bands — scroll-clipped when collapsed. */
  collapseLowPrioritySections: boolean;
  /** UICTRL-3 — explicit surfaces (see Configure). */
  beeLogSurface: HivePanelTri;
  diagnosticsGridSurface: HivePanelTri;
  /** CQ / execution edge / guard mini row in tactical deck (not the primary signal leg). */
  deckMiniRowSurface: HivePanelBi;
  deckThesisSurface: HivePanelBi;
  /** Lifecycle / posture / pending rail — never hidden; collapsed clips secondary rows with fade. */
  operatorReadoutRailSurface: HivePanelBi;
  /** Treasury card — never hidden; collapsed clips rows with fade. */
  treasuryCardSurface: HivePanelBi;
  glanceScale: HiveGlanceScale;
  labelDensity: HiveLabelDensity;
};

const STORAGE_KEY = "hive_ui_prefs_v1";

/**
 * UICTRL-LOCK1: treasury card is the operator-facing source of truth for treasury clip.
 * `orbitReadoutMode` is retained for schema compatibility and CSS hooks — always mirrored from treasury.
 */
export function normalizeHiveUiPrefs(p: HiveUiPrefs): HiveUiPrefs {
  return {
    ...p,
    orbitReadoutMode: p.treasuryCardSurface,
  };
}

export const HIVE_UI_PRESET_ORDER: HiveUiPresetApplyId[] = [
  "stealth",
  "command_center",
  "operator_compact",
  "swarm_intelligence",
  "night_ops",
  "presentation_mode",
];

/** Partial overrides applied on top of defaults when selecting a preset. */
const PRESET_PATCH: Record<HiveUiPresetApplyId, Partial<Omit<HiveUiPrefs, "schema" | "activePreset">>> = {
  stealth: {
    backgroundVisibility: "subtle",
    backgroundIntensity: "high",
    scrimStrength: "high",
    glassIntensity: "high",
    borderGlow: "low",
    accentStrength: "low",
    shadowDepth: "low",
    panelDensity: "compact",
    layoutDensity: "compact",
    layoutMode: "compact",
    pulseContextMode: "collapsed",
    orbitReadoutMode: "collapsed",
    collapseLowPrioritySections: true,
    beeLogSurface: "collapsed",
    diagnosticsGridSurface: "collapsed",
    deckMiniRowSurface: "collapsed",
    deckThesisSurface: "collapsed",
    operatorReadoutRailSurface: "full",
    treasuryCardSurface: "collapsed",
    glanceScale: "standard",
    labelDensity: "normal",
    heroStrip: "hidden",
    motionLevel: "off",
    readability: "standard",
  },
  command_center: {
    backgroundVisibility: "full",
    backgroundIntensity: "medium",
    scrimStrength: "medium",
    glassIntensity: "medium",
    borderGlow: "medium",
    accentStrength: "medium",
    shadowDepth: "medium",
    panelDensity: "comfortable",
    layoutDensity: "normal",
    layoutMode: "command_center",
    pulseContextMode: "full",
    orbitReadoutMode: "full",
    collapseLowPrioritySections: false,
    beeLogSurface: "full",
    diagnosticsGridSurface: "full",
    deckMiniRowSurface: "full",
    deckThesisSurface: "full",
    operatorReadoutRailSurface: "full",
    treasuryCardSurface: "full",
    glanceScale: "standard",
    labelDensity: "normal",
    heroStrip: "hidden",
    motionLevel: "low",
    readability: "standard",
  },
  operator_compact: {
    backgroundVisibility: "full",
    backgroundIntensity: "high",
    scrimStrength: "high",
    glassIntensity: "medium",
    borderGlow: "low",
    accentStrength: "medium",
    shadowDepth: "low",
    panelDensity: "compact",
    layoutDensity: "compact",
    layoutMode: "compact",
    pulseContextMode: "collapsed",
    orbitReadoutMode: "collapsed",
    collapseLowPrioritySections: true,
    beeLogSurface: "collapsed",
    diagnosticsGridSurface: "collapsed",
    deckMiniRowSurface: "collapsed",
    deckThesisSurface: "collapsed",
    operatorReadoutRailSurface: "full",
    treasuryCardSurface: "collapsed",
    glanceScale: "standard",
    labelDensity: "normal",
    heroStrip: "hidden",
    motionLevel: "off",
    readability: "standard",
  },
  swarm_intelligence: {
    backgroundVisibility: "full",
    backgroundIntensity: "low",
    scrimStrength: "medium",
    glassIntensity: "medium",
    borderGlow: "high",
    accentStrength: "high",
    shadowDepth: "medium",
    panelDensity: "comfortable",
    layoutDensity: "normal",
    layoutMode: "command_center",
    pulseContextMode: "full",
    orbitReadoutMode: "full",
    collapseLowPrioritySections: false,
    beeLogSurface: "full",
    diagnosticsGridSurface: "full",
    deckMiniRowSurface: "full",
    deckThesisSurface: "full",
    operatorReadoutRailSurface: "full",
    treasuryCardSurface: "full",
    glanceScale: "large",
    labelDensity: "normal",
    heroStrip: "compact",
    motionLevel: "high",
    readability: "standard",
  },
  night_ops: {
    backgroundVisibility: "full",
    backgroundIntensity: "high",
    scrimStrength: "high",
    glassIntensity: "high",
    borderGlow: "medium",
    accentStrength: "medium",
    shadowDepth: "high",
    panelDensity: "comfortable",
    layoutDensity: "normal",
    layoutMode: "command_center",
    pulseContextMode: "full",
    orbitReadoutMode: "full",
    collapseLowPrioritySections: false,
    beeLogSurface: "full",
    diagnosticsGridSurface: "full",
    deckMiniRowSurface: "full",
    deckThesisSurface: "full",
    operatorReadoutRailSurface: "full",
    treasuryCardSurface: "full",
    glanceScale: "large",
    labelDensity: "normal",
    heroStrip: "hidden",
    motionLevel: "low",
    readability: "high_contrast",
  },
  presentation_mode: {
    backgroundVisibility: "full",
    backgroundIntensity: "low",
    scrimStrength: "low",
    glassIntensity: "low",
    borderGlow: "medium",
    accentStrength: "medium",
    shadowDepth: "medium",
    panelDensity: "comfortable",
    layoutDensity: "roomy",
    layoutMode: "wide",
    pulseContextMode: "full",
    orbitReadoutMode: "full",
    collapseLowPrioritySections: false,
    beeLogSurface: "full",
    diagnosticsGridSurface: "full",
    deckMiniRowSurface: "full",
    deckThesisSurface: "full",
    operatorReadoutRailSurface: "full",
    treasuryCardSurface: "full",
    glanceScale: "xlarge",
    labelDensity: "normal",
    heroStrip: "full",
    motionLevel: "low",
    readability: "relaxed",
  },
};

const DEFAULT_HIVE_UI_PREFS_RAW = {
  schema: 3 as const,
  activePreset: "command_center" as const,
  advancedDefault: "closed" as const,
  ...PRESET_PATCH.command_center,
} as HiveUiPrefs;

export const DEFAULT_HIVE_UI_PREFS = normalizeHiveUiPrefs(DEFAULT_HIVE_UI_PREFS_RAW);

function isPreset(v: unknown): v is HiveUiPresetId {
  return (
    v === "stealth" ||
    v === "command_center" ||
    v === "operator_compact" ||
    v === "swarm_intelligence" ||
    v === "night_ops" ||
    v === "presentation_mode" ||
    v === "custom"
  );
}

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
function isShell(v: unknown): v is HiveShellTier {
  return v === "low" || v === "medium" || v === "high";
}
function isLayout(v: unknown): v is HiveLayoutDensity {
  return v === "compact" || v === "normal" || v === "roomy";
}
function isMotion(v: unknown): v is HiveMotionLevel {
  return v === "off" || v === "low" || v === "high";
}
function isRead(v: unknown): v is HiveReadability {
  return v === "standard" || v === "high_contrast" || v === "relaxed";
}
function isLayoutMode(v: unknown): v is HiveLayoutMode {
  return v === "compact" || v === "command_center" || v === "wide";
}
function isPulseCtx(v: unknown): v is HivePulseContextMode {
  return v === "full" || v === "collapsed";
}
function isOrbitReadout(v: unknown): v is HiveOrbitReadoutMode {
  return v === "full" || v === "collapsed";
}
function isPanelTri(v: unknown): v is HivePanelTri {
  return v === "full" || v === "collapsed" || v === "hidden";
}
function isPanelBi(v: unknown): v is HivePanelBi {
  return v === "full" || v === "collapsed";
}
function isGlance(v: unknown): v is HiveGlanceScale {
  return v === "standard" || v === "large" || v === "xlarge";
}
function isLabelDensity(v: unknown): v is HiveLabelDensity {
  return v === "normal" || v === "minimal" || v === "dense";
}

type LegacyV1 = {
  schema?: number;
  coreVisibility?: string;
  coreSize?: string;
  panelDensity?: string;
  advancedDefault?: string;
  heroStrip?: string;
};

function baseFromV1(j: LegacyV1): Omit<HiveUiPrefs, "schema" | "activePreset"> {
  const vis =
    j.coreVisibility === "off" || j.coreVisibility === "subtle" || j.coreVisibility === "full"
      ? j.coreVisibility === "off"
        ? "off"
        : j.coreVisibility === "subtle"
          ? "subtle"
          : "full"
      : DEFAULT_HIVE_UI_PREFS.backgroundVisibility;
  const bgInt = DEFAULT_HIVE_UI_PREFS.backgroundIntensity;
  return {
    backgroundVisibility: vis,
    backgroundIntensity: bgInt,
    scrimStrength: bgInt === "high" ? "high" : bgInt === "low" ? "low" : "medium",
    glassIntensity: "medium",
    borderGlow: "medium",
    accentStrength: "medium",
    shadowDepth: "medium",
    panelDensity: isDensity(j.panelDensity) ? j.panelDensity : DEFAULT_HIVE_UI_PREFS.panelDensity,
    layoutDensity:
      isDensity(j.panelDensity) && j.panelDensity === "compact" ? "compact" : "normal",
    advancedDefault: isAdv(j.advancedDefault) ? j.advancedDefault : DEFAULT_HIVE_UI_PREFS.advancedDefault,
    heroStrip: isHero(j.heroStrip) ? j.heroStrip : DEFAULT_HIVE_UI_PREFS.heroStrip,
    motionLevel: "low",
    readability: "standard",
    layoutMode: "command_center",
    pulseContextMode: "full",
    orbitReadoutMode: "full",
    collapseLowPrioritySections: false,
    beeLogSurface: "full",
    diagnosticsGridSurface: "full",
    deckMiniRowSurface: "full",
    deckThesisSurface: "full",
    operatorReadoutRailSurface: "full",
    treasuryCardSurface: "full",
    glanceScale: "standard",
    labelDensity: "normal",
  };
}

function migrateFromV1(j: LegacyV1): HiveUiPrefs {
  const b = baseFromV1(j);
  return normalizeHiveUiPrefs({ schema: 3, activePreset: "command_center", ...b });
}

function migrateV2(j: Record<string, unknown>): HiveUiPrefs {
  const tierFromBg = (x: unknown): HiveShellTier => {
    if (x === "low" || x === "high") return x;
    return "medium";
  };
  const bgInt = isBgInt(j.backgroundIntensity) ? j.backgroundIntensity : "medium";
  return normalizeHiveUiPrefs({
    schema: 3,
    activePreset: "command_center",
    backgroundVisibility: isBgVis(j.backgroundVisibility)
      ? j.backgroundVisibility
      : DEFAULT_HIVE_UI_PREFS.backgroundVisibility,
    backgroundIntensity: bgInt,
    scrimStrength: tierFromBg(bgInt),
    glassIntensity: "medium",
    borderGlow: "medium",
    accentStrength: "medium",
    shadowDepth: "medium",
    panelDensity: isDensity(j.panelDensity) ? j.panelDensity : DEFAULT_HIVE_UI_PREFS.panelDensity,
    layoutDensity:
      isDensity(j.panelDensity) && j.panelDensity === "compact" ? "compact" : "normal",
    advancedDefault: isAdv(j.advancedDefault) ? j.advancedDefault : DEFAULT_HIVE_UI_PREFS.advancedDefault,
    heroStrip: isHero(j.heroStrip) ? j.heroStrip : DEFAULT_HIVE_UI_PREFS.heroStrip,
    motionLevel: "low",
    readability: "standard",
    layoutMode: "command_center",
    pulseContextMode: "full",
    orbitReadoutMode: "full",
    collapseLowPrioritySections: false,
    beeLogSurface: "full",
    diagnosticsGridSurface: "full",
    deckMiniRowSurface: "full",
    deckThesisSurface: "full",
    operatorReadoutRailSurface: "full",
    treasuryCardSurface: "full",
    glanceScale: "standard",
    labelDensity: "normal",
  });
}

function coerceV3(j: Record<string, unknown>): HiveUiPrefs {
  const bgInt = isBgInt(j.backgroundIntensity) ? j.backgroundIntensity : DEFAULT_HIVE_UI_PREFS.backgroundIntensity;
  const orbitRm = isOrbitReadout(j.orbitReadoutMode) ? j.orbitReadoutMode : "full";
  const treasuryCardSurface = isPanelBi(j.treasuryCardSurface)
    ? j.treasuryCardSurface
    : orbitRm === "collapsed"
      ? "collapsed"
      : "full";
  return normalizeHiveUiPrefs({
    schema: 3,
    activePreset: isPreset(j.activePreset) ? j.activePreset : "command_center",
    backgroundVisibility: isBgVis(j.backgroundVisibility)
      ? j.backgroundVisibility
      : DEFAULT_HIVE_UI_PREFS.backgroundVisibility,
    backgroundIntensity: bgInt,
    scrimStrength: isShell(j.scrimStrength) ? j.scrimStrength : bgInt === "high" ? "high" : bgInt === "low" ? "low" : "medium",
    glassIntensity: isShell(j.glassIntensity) ? j.glassIntensity : "medium",
    borderGlow: isShell(j.borderGlow) ? j.borderGlow : "medium",
    accentStrength: isShell(j.accentStrength) ? j.accentStrength : "medium",
    shadowDepth: isShell(j.shadowDepth) ? j.shadowDepth : "medium",
    panelDensity: isDensity(j.panelDensity) ? j.panelDensity : DEFAULT_HIVE_UI_PREFS.panelDensity,
    layoutDensity: isLayout(j.layoutDensity)
      ? j.layoutDensity
      : isDensity(j.panelDensity) && j.panelDensity === "compact"
        ? "compact"
        : "normal",
    advancedDefault: isAdv(j.advancedDefault) ? j.advancedDefault : DEFAULT_HIVE_UI_PREFS.advancedDefault,
    heroStrip: isHero(j.heroStrip) ? j.heroStrip : DEFAULT_HIVE_UI_PREFS.heroStrip,
    motionLevel: isMotion(j.motionLevel) ? j.motionLevel : "low",
    readability: isRead(j.readability) ? j.readability : "standard",
    layoutMode: isLayoutMode(j.layoutMode) ? j.layoutMode : "command_center",
    pulseContextMode: isPulseCtx(j.pulseContextMode) ? j.pulseContextMode : "full",
    orbitReadoutMode: orbitRm,
    collapseLowPrioritySections:
      typeof j.collapseLowPrioritySections === "boolean" ? j.collapseLowPrioritySections : false,
    beeLogSurface: isPanelTri(j.beeLogSurface) ? j.beeLogSurface : "full",
    diagnosticsGridSurface: isPanelTri(j.diagnosticsGridSurface) ? j.diagnosticsGridSurface : "full",
    deckMiniRowSurface: isPanelBi(j.deckMiniRowSurface) ? j.deckMiniRowSurface : "full",
    deckThesisSurface: isPanelBi(j.deckThesisSurface) ? j.deckThesisSurface : "full",
    operatorReadoutRailSurface: isPanelBi(j.operatorReadoutRailSurface)
      ? j.operatorReadoutRailSurface
      : "full",
    treasuryCardSurface,
    glanceScale: isGlance(j.glanceScale) ? j.glanceScale : "standard",
    labelDensity: isLabelDensity(j.labelDensity) ? j.labelDensity : "normal",
  });
}

export function loadHiveUiPrefs(): HiveUiPrefs {
  if (typeof window === "undefined") return DEFAULT_HIVE_UI_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_HIVE_UI_PREFS;
    const j = JSON.parse(raw) as Record<string, unknown>;
    if (j.schema === 3) return coerceV3(j);
    if (j.schema === 2) return migrateV2(j);
    if (j.schema === 1 || "coreVisibility" in j) return migrateFromV1(j as LegacyV1);
    return DEFAULT_HIVE_UI_PREFS;
  } catch {
    return DEFAULT_HIVE_UI_PREFS;
  }
}

export function saveHiveUiPrefs(p: HiveUiPrefs): void {
  if (typeof window === "undefined") return;
  try {
    const n = normalizeHiveUiPrefs(p);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...n, schema: 3 as const }));
  } catch {
    /* quota / private mode */
  }
}

/** Apply a named preset bundle; preserves operator Advanced default rail preference. */
export function applyHiveUiPreset(id: HiveUiPresetApplyId, prev: HiveUiPrefs): HiveUiPrefs {
  const patch = PRESET_PATCH[id];
  return normalizeHiveUiPrefs({
    schema: 3,
    ...DEFAULT_HIVE_UI_PREFS,
    ...patch,
    activePreset: id,
    advancedDefault: prev.advancedDefault,
  });
}

/** One-shot operator surface: tight crown, collapsed rails, clipped diagnostics. Sets preset to Custom. */
export function applyOperatorMinimal(prev: HiveUiPrefs): HiveUiPrefs {
  return normalizeHiveUiPrefs({
    ...prev,
    schema: 3,
    activePreset: "custom",
    layoutMode: "compact",
    pulseContextMode: "collapsed",
    orbitReadoutMode: "collapsed",
    collapseLowPrioritySections: true,
    beeLogSurface: "collapsed",
    diagnosticsGridSurface: "collapsed",
    deckMiniRowSurface: "collapsed",
    deckThesisSurface: "collapsed",
    operatorReadoutRailSurface: "full",
    treasuryCardSurface: "collapsed",
    glanceScale: "standard",
    labelDensity: "normal",
    heroStrip: "hidden",
  });
}

/** One-shot: wide shell, full pulse/readout rails, expanded secondary sections. Sets preset to Custom. */
export function applyOperatorFullObservability(prev: HiveUiPrefs): HiveUiPrefs {
  return normalizeHiveUiPrefs({
    ...prev,
    schema: 3,
    activePreset: "custom",
    layoutMode: "wide",
    pulseContextMode: "full",
    orbitReadoutMode: "full",
    collapseLowPrioritySections: false,
    beeLogSurface: "full",
    diagnosticsGridSurface: "full",
    deckMiniRowSurface: "full",
    deckThesisSurface: "full",
    operatorReadoutRailSurface: "full",
    treasuryCardSurface: "full",
    glanceScale: "large",
    labelDensity: "normal",
  });
}

/** Reset operator panels + readability to Command Center preset slice; shell unchanged; preset → Custom. */
export function resetOperatorSurfacesToCommandCenter(prev: HiveUiPrefs): HiveUiPrefs {
  const cc = PRESET_PATCH.command_center;
  return normalizeHiveUiPrefs({
    ...prev,
    activePreset: "custom",
    collapseLowPrioritySections: cc.collapseLowPrioritySections!,
    beeLogSurface: cc.beeLogSurface!,
    diagnosticsGridSurface: cc.diagnosticsGridSurface!,
    deckMiniRowSurface: cc.deckMiniRowSurface!,
    deckThesisSurface: cc.deckThesisSurface!,
    operatorReadoutRailSurface: cc.operatorReadoutRailSurface!,
    treasuryCardSurface: cc.treasuryCardSurface!,
    glanceScale: cc.glanceScale!,
    labelDensity: cc.labelDensity!,
    readability: cc.readability!,
    orbitReadoutMode: cc.orbitReadoutMode!,
  });
}

const tierBlurPx: Record<HiveShellTier, string> = {
  low: "8px",
  medium: "14px",
  high: "20px",
};

const tierScrimInset: Record<HiveShellTier, number> = {
  low: 0.06,
  medium: 0.14,
  high: 0.24,
};

const tierAccentAlpha: Record<HiveShellTier, number> = {
  low: 0.22,
  medium: 0.36,
  high: 0.52,
};

/** CSS variables for `[data-hive-dashboard]` / shell roots — safe fallbacks in CSS. */
export function hiveUiShellCssVars(p: HiveUiPrefs): CSSProperties {
  const glassBlur = tierBlurPx[p.glassIntensity];
  const scrimInset = tierScrimInset[p.scrimStrength];
  const accentA = tierAccentAlpha[p.accentStrength];
  const shadowLift =
    p.shadowDepth === "low" ? "0.22" : p.shadowDepth === "high" ? "0.48" : "0.35";
  const borderGlow =
    p.borderGlow === "low" ? 0.06 : p.borderGlow === "high" ? 0.18 : 0.1;
  const borderGlowStr = String(borderGlow);
  const accentGlow = (borderGlow * 0.55).toFixed(3);
  const orbitOpsShadow =
    p.shadowDepth === "low"
      ? `inset 0 1px 0 rgba(255,255,255,0.038), 0 10px 28px rgba(0,0,0,0.34), 0 0 22px rgba(199,154,49,${accentGlow})`
      : p.shadowDepth === "high"
        ? `inset 0 1px 0 rgba(255,255,255,0.045), 0 18px 44px rgba(0,0,0,0.52), 0 0 28px rgba(199,154,49,${accentGlow})`
        : `inset 0 1px 0 rgba(255,255,255,0.04), 0 14px 36px rgba(0,0,0,0.42), 0 0 24px rgba(199,154,49,${accentGlow})`;
  const glanceScale =
    p.glanceScale === "large" ? "1.06" : p.glanceScale === "xlarge" ? "1.12" : "1";
  return {
    ["--hive-glass-blur" as string]: glassBlur,
    ["--hive-scrim-inset" as string]: String(scrimInset),
    ["--hive-accent-line-a" as string]: String(accentA),
    ["--hive-shadow-lift" as string]: shadowLift,
    ["--hive-border-glow" as string]: borderGlowStr,
    ["--hive-orbit-ops-shadow" as string]: orbitOpsShadow,
    ["--hive-glance-scale" as string]: glanceScale,
  } as CSSProperties;
}

export function hiveUiPresetLabel(id: HiveUiPresetId): string {
  const map: Record<HiveUiPresetId, string> = {
    stealth: "Stealth",
    command_center: "Command Center",
    operator_compact: "Operator Compact",
    swarm_intelligence: "Swarm Intelligence",
    night_ops: "Night Ops",
    presentation_mode: "Presentation Mode",
    custom: "Custom",
  };
  return map[id];
}
