"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(
  /\/+$/,
  ""
);
const ADMIN_KEY = "mysecret123";

type PillTone = "neutral" | "promoted" | "hold" | "suppressed";

/** W4-L3 — black tactical shell; amber accents only (not Excalibur cyan). */
const HIVE_UI = {
  bg: "radial-gradient(ellipse 140% 90% at 50% -8%, #141416 0%, #0a0a0c 42%, #050506 100%)",
  text: "#ebe8e2",
  textMuted: "#7d7a74",
  textSection: "#8f8a82",
  textLabel: "#a39a8c",
  accent: "#d4a84a",
  accentSoft: "#9e917c",
  borderHero: "#2e2c28",
  borderPanel: "#252528",
  borderDeep: "#161618",
  surfaceHero:
    "linear-gradient(180deg, rgba(18,18,20,0.98) 0%, rgba(10,10,12,0.99) 100%), radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,168,74,0.07) 0%, transparent 55%)",
  surfaceLive:
    "linear-gradient(180deg, #0e0e11 0%, #060607 100%), radial-gradient(ellipse 65% 55% at 50% 45%, rgba(212,168,74,0.06) 0%, transparent 60%)",
  panelBg: "linear-gradient(180deg, #111114 0%, #0b0b0d 100%)",
  shadowCard: "0 12px 40px rgba(0,0,0,0.55)",
  shadowLift: "0 10px 28px rgba(0,0,0,0.45)",
  shadowSoft: "0 8px 24px rgba(0,0,0,0.4)",
  rXl: 24,
  rLg: 20,
  rMd: 14,
  rSm: 12,
  font: "Arial, sans-serif",
  motion: "background-color 165ms ease, border-color 165ms ease, box-shadow 165ms ease, opacity 165ms ease, transform 165ms ease, filter 165ms ease",
  divider: "rgba(212,168,74,0.08)",
  dividerStrong: "rgba(212,168,74,0.1)",
  spaceXs: 8,
  spaceSm: 12,
  spaceMd: 16,
  spaceLg: 20,
  spaceXl: 24,
  overline: { fontSize: 10, letterSpacing: 2, fontWeight: 600 as const },
  panelTitle: { fontSize: 17, letterSpacing: "0.04em" as const, fontWeight: 700 as const },
  liveTitle: { fontSize: 18, letterSpacing: "0.06em" as const, fontWeight: 700 as const },
  pill: { fontSize: 12, paddingY: 7, paddingX: 14, fontWeight: 600 as const },
  calloutSuppressed: { bg: "rgba(140,60,60,0.14)", border: "rgba(180,90,90,0.42)", text: "#f0d4d4" },
  calloutHold: { bg: "rgba(200,140,40,0.12)", border: "rgba(210,150,50,0.42)", text: "#ffe8c8" },
  errorBanner: { bg: "rgba(255,120,120,0.12)", border: "#a34c4c", text: "#ffd8d8" },
  surfaceCommand: "linear-gradient(180deg, #121214 0%, #0a0a0c 100%)",
  railAccent: "#9a7d2e",
} as const;

export default function Page() {
  const [health, setHealth] = useState<any>(null);
  const [fullState, setFullState] = useState<any>(null);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  async function apiCall(path: string, method = "GET", body?: any) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-bot-admin-key": ADMIN_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${text}`);
    }

    return res.json();
  }

  async function loadAll() {
    try {
      setError("");
      const healthRes = await fetch(`${API}/health`);
      const healthData = await healthRes.json();
      const stateData = await apiCall("/state");
      setHealth(healthData);
      setFullState(stateData);
    } catch (err: any) {
      setError(err.message || "Could not connect to backend");
    }
  }

  async function startBot() {
    await apiCall("/bot/start", "POST");
    await loadAll();
  }

  async function stopBot() {
    await apiCall("/bot/stop", "POST");
    await loadAll();
  }

  async function runCycle() {
    await apiCall("/cycle", "POST");
    await loadAll();
  }

  async function enableTrading() {
    await apiCall("/config", "POST", { enabled: true });
    await loadAll();
  }

  async function disableTrading() {
    await apiCall("/config", "POST", { enabled: false });
    await loadAll();
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => loadAll(), 5000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const hive = fullState?.hive_contract_v1;
  const system = hive?.system_state;
  const top = hive?.top_signal;
  const perf = hive?.performance_state;
  const guard = top?.guardrails;
  const cq = top?.contract_quality;
  const edge = top?.execution_edge;
  const promo = top?.promotion_gate;
  const mem = top?.signal_memory;
  const flow = top?.flow_context;
  const delta = top?.cycle_delta;
  const regime = system?.session_regime;
  const execSurface = system?.execution_surface as string | undefined;
  const surfacePillText =
    execSurface === "signal_only"
      ? "Surface: signal-only (no broker)"
      : execSurface
        ? `Surface: ${execSurface}`
        : "Surface: —";

  const signal = top?.setup ?? fullState?.signal_snapshot ?? {};
  const recommended = top?.recommended_trade ?? signal?.recommended_trade ?? {};
  const running =
    system?.bot_running !== undefined && system?.bot_running !== null
      ? !!system.bot_running
      : !!health?.running;
  const tradingEnabled =
    system?.trading_enabled !== undefined && system?.trading_enabled !== null
      ? !!system.trading_enabled
      : !!fullState?.config?.enabled;

  const promoStatus = promo?.status as string | undefined;
  const gateSuppressed = promoStatus === "suppressed";
  const gateHold = promoStatus === "hold";
  const gatePromoted = promoStatus === "promoted";
  const gatePillText = !promoStatus ? "Gate: —" : gateSuppressed ? "Gate: suppressed" : gateHold ? "Gate: on hold" : "Gate: promoted";
  const gatePillTone: PillTone = !promoStatus ? "neutral" : gateSuppressed ? "suppressed" : gateHold ? "hold" : "promoted";

  const guardTone: PillTone = guard?.status === "avoid" ? "suppressed" : guard?.status === "caution" || (guard?.status === "viable" && !guard?.actionable) ? "hold" : guard?.status === "viable" ? "promoted" : "neutral";
  const guardPillActive = guard?.status === "viable" && !!guard?.actionable;

  const cards = useMemo(
    () => [
      { label: "Spot", value: signal.spot, featured: true },
      { label: "Bias", value: signal.bias, featured: true },
      { label: "Score", value: signal.setup_score, featured: true },
      { label: "VWAP", value: signal.vwap },
      { label: "EMA 8", value: signal.ema8 },
      { label: "EMA 21", value: signal.ema21 },
      { label: "Volume", value: signal.volume_ratio },
      { label: "OR High", value: signal.opening_range_high },
      { label: "OR Low", value: signal.opening_range_low },
      { label: "Provider", value: health?.provider },
    ],
    [signal, health]
  );

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `@media (prefers-reduced-motion: reduce) {
  [data-hive-dashboard] * {
    animation: none !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0s !important;
  }
}
[data-hive-dashboard] button:focus-visible {
  outline: 2px solid #d4a84a;
  outline-offset: 2px;
}
.hive-shell { max-width: 1240px; margin: 0 auto; }
.hive-cockpit {
  display: grid;
  gap: 20px;
  grid-template-columns: 1fr;
  margin-bottom: 20px;
}
@media (min-width: 1100px) {
  .hive-cockpit { grid-template-columns: minmax(0, 1fr) minmax(300px, 360px); align-items: start; }
}
.hive-live-deck {
  border-left: 2px solid #9a7d2e;
  box-shadow: inset 1px 0 0 rgba(212,168,74,0.12), inset 0 0 100px rgba(0,0,0,0.35);
}
.hive-signal-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;
}
@media (min-width: 960px) {
  .hive-signal-grid { grid-template-columns: 1fr 1fr; }
  .hive-signal-span { grid-column: 1 / -1; }
}
.hive-signal-col { min-width: 0; }`,
        }}
      />
      <main
        data-hive-dashboard
        style={{
          minHeight: "100vh",
          background: HIVE_UI.bg,
          color: HIVE_UI.text,
          fontFamily: HIVE_UI.font,
          padding: HIVE_UI.spaceLg,
        }}
      >
      <div className="hive-shell">
        <section
          style={{
            background: HIVE_UI.surfaceHero,
            border: `1px solid ${HIVE_UI.borderHero}`,
            borderTop: `2px solid ${HIVE_UI.accent}`,
            borderRadius: HIVE_UI.rXl,
            padding: HIVE_UI.spaceXl,
            marginBottom: HIVE_UI.spaceLg,
            boxShadow: `${HIVE_UI.shadowCard}, inset 0 1px 0 rgba(255,255,255,0.04)`,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: HIVE_UI.spaceMd,
            }}
          >
            <div
              style={{
                width: 220,
                height: 220,
                position: "relative",
                flexShrink: 0,
                filter: "drop-shadow(0 0 40px rgba(212,168,74,0.12))",
              }}
            >
              <Image src="/hive-logo.png" alt="HIVE Logo" fill style={{ objectFit: "contain" }} priority />
            </div>
            <div style={{ maxWidth: 640 }}>
              <div
                style={{
                  fontSize: HIVE_UI.overline.fontSize,
                  letterSpacing: HIVE_UI.overline.letterSpacing,
                  fontWeight: HIVE_UI.overline.fontWeight,
                  color: HIVE_UI.textLabel,
                  textTransform: "uppercase",
                  marginBottom: HIVE_UI.spaceXs,
                }}
              >
                Hyper-Intelligent Volatility Execution
              </div>
              <h1 style={{ margin: 0, fontSize: 46, color: HIVE_UI.accent, letterSpacing: 1.2, fontWeight: 800 }}>HIVE</h1>
              <div style={{ marginTop: HIVE_UI.spaceSm, fontSize: 15, lineHeight: 1.5, color: HIVE_UI.accentSoft }}>
                Mechanical swarm intelligence for SPY volatility trading
              </div>
            </div>
            <div
              style={{
                width: "100%",
                maxWidth: 920,
                marginTop: HIVE_UI.spaceSm,
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: HIVE_UI.spaceSm,
              }}
            >
              <div
                style={{
                  fontSize: HIVE_UI.overline.fontSize,
                  letterSpacing: HIVE_UI.overline.letterSpacing,
                  fontWeight: HIVE_UI.overline.fontWeight,
                  color: HIVE_UI.textSection,
                  textTransform: "uppercase",
                }}
              >
                Ops
              </div>
              <div style={{ display: "flex", gap: HIVE_UI.spaceSm, flexWrap: "wrap" }}>
                <StatusPill text={running ? "Swarm Active" : "Swarm Idle"} active={running} />
                <StatusPill text={`Trading ${tradingEnabled ? "Armed" : "Safe"}`} />
                <StatusPill text={surfacePillText} />
                <StatusPill text={`Bias ${formatVal(signal?.bias)}`} />
                <StatusPill text={`Score ${formatVal(signal?.setup_score)}`} />
                <StatusPill text={autoRefresh ? "Auto refresh on" : "Auto refresh off"} active={autoRefresh} />
              </div>
              <div
                style={{
                  fontSize: HIVE_UI.overline.fontSize,
                  letterSpacing: HIVE_UI.overline.letterSpacing,
                  fontWeight: HIVE_UI.overline.fontWeight,
                  color: HIVE_UI.textSection,
                  textTransform: "uppercase",
                }}
              >
                Governance (at a glance)
              </div>
              <div style={{ display: "flex", gap: HIVE_UI.spaceSm, flexWrap: "wrap" }}>
                <StatusPill
                  text={
                    guard?.status
                      ? `Guard: ${guard.status}${guard.actionable ? " · act" : " · hold"}`
                      : "Guard: —"
                  }
                  tone={guardTone}
                  active={guardPillActive}
                />
                <StatusPill text={gatePillText} tone={gatePillTone} active={gatePromoted} />
                <StatusPill
                  text={
                    !delta?.status
                      ? "Δ: —"
                      : delta.status === "none"
                        ? "Δ: no prior pulse"
                        : delta.status === "unchanged"
                          ? "Δ: unchanged"
                          : delta.status === "minor_change"
                            ? "Δ: minor"
                            : "Δ: meaningful"
                  }
                  tone={delta?.status === "meaningful_change" ? "hold" : "neutral"}
                  active={delta?.status === "unchanged"}
                />
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div
            style={{
              background: HIVE_UI.errorBanner.bg,
              color: HIVE_UI.errorBanner.text,
              padding: HIVE_UI.spaceSm,
              borderRadius: HIVE_UI.rMd,
              marginBottom: HIVE_UI.spaceMd,
              border: `1px solid ${HIVE_UI.errorBanner.border}`,
            }}
          >
            <strong>Hive warning:</strong> {error}
          </div>
        ) : null}

        <section
          style={{
            background: HIVE_UI.surfaceCommand,
            border: `1px solid ${HIVE_UI.borderDeep}`,
            borderRadius: HIVE_UI.rLg,
            padding: HIVE_UI.spaceMd,
            marginBottom: HIVE_UI.spaceLg,
            boxShadow: HIVE_UI.shadowSoft,
          }}
        >
          <div
            style={{
              fontSize: HIVE_UI.overline.fontSize,
              letterSpacing: HIVE_UI.overline.letterSpacing,
              fontWeight: HIVE_UI.overline.fontWeight,
              color: HIVE_UI.textSection,
              textTransform: "uppercase",
              marginBottom: HIVE_UI.spaceSm,
            }}
          >
            Swarm controls
          </div>
          <div style={{ display: "flex", gap: HIVE_UI.spaceSm, flexWrap: "wrap" }}>
            <HiveButton onClick={loadAll} label="Refresh Hive" />
            <HiveButton onClick={runCycle} label="Pulse Cycle" />
            <HiveButton onClick={startBot} label="Launch Bees" />
            <HiveButton onClick={stopBot} label="Recall Bees" />
            <HiveButton onClick={enableTrading} label="Arm Hive" />
            <HiveButton onClick={disableTrading} label="Disarm Hive" />
            <HiveButton onClick={() => setAutoRefresh(!autoRefresh)} label={autoRefresh ? "Auto Swarm On" : "Auto Swarm Off"} active={autoRefresh} />
          </div>
        </section>

        <div className="hive-cockpit">
          <section
            className="hive-live-deck"
            style={{
              background: HIVE_UI.surfaceLive,
              border: `1px solid ${HIVE_UI.borderPanel}`,
              borderRadius: HIVE_UI.rXl,
              padding: HIVE_UI.spaceLg,
              boxShadow: `${HIVE_UI.shadowSoft}, inset 0 0 90px rgba(0,0,0,0.45)`,
            }}
          >
            <div
              style={{
                fontSize: HIVE_UI.overline.fontSize,
                letterSpacing: HIVE_UI.overline.letterSpacing,
                fontWeight: HIVE_UI.overline.fontWeight,
                color: HIVE_UI.textSection,
                textTransform: "uppercase",
                marginBottom: HIVE_UI.spaceXs,
              }}
            >
              Primary pulse
            </div>
            <div
              style={{
                fontSize: HIVE_UI.liveTitle.fontSize,
                fontWeight: HIVE_UI.liveTitle.fontWeight,
                letterSpacing: HIVE_UI.liveTitle.letterSpacing,
                color: HIVE_UI.accent,
                marginBottom: HIVE_UI.spaceSm,
              }}
            >
              Live tactical field
            </div>
            <OrbitHive cards={cards} autoRefresh={autoRefresh} running={running} />
          </section>

          <aside style={{ minWidth: 0 }}>
            <Panel title="Operator readout" subtitle="Session · lifecycle · book">
              <PanelSection title="Session & runtime" isFirst>
                <HiveRow
                  label="Session (clock · ET)"
                  value={
                    regime
                      ? `${regime.code} · RTH ${regime.market_hours ? "on" : "off"}${typeof regime.detail === "string" && regime.detail.length ? ` — ${regime.detail.length > 72 ? `${regime.detail.slice(0, 72)}…` : regime.detail}` : ""}`
                      : "—"
                  }
                />
                <HiveRow
                  label="Lifecycle"
                  value={
                    system?.lifecycle_phase
                      ? `${String(system.lifecycle_phase)}${typeof system.lifecycle_hint === "string" && system.lifecycle_hint.length ? ` — ${system.lifecycle_hint.length > 88 ? `${system.lifecycle_hint.slice(0, 88)}…` : system.lifecycle_hint}` : ""}`
                      : "—"
                  }
                  muted
                />
                <HiveRow
                  label="Last pulse age"
                  value={
                    system?.signal_age_seconds !== undefined && system?.signal_age_seconds !== null
                      ? `${system.signal_age_seconds}s${system?.signal_stale ? " · stale vs operator threshold" : ""}`
                      : "—"
                  }
                  muted={!!system?.signal_stale}
                />
                <HiveRow
                  label="Pending (queue)"
                  value={
                    system?.pending_signals_semantics === "broker_orders_only"
                      ? `${formatVal(system?.pending_signals_count ?? 0)} — broker orders only (none in signal_only)`
                      : formatVal(system?.pending_signals_count ?? "—")
                  }
                  muted
                />
                <HiveRow
                  label="Posture"
                  value={
                    typeof system?.operator_posture_hint === "string" && system.operator_posture_hint.length
                      ? system.operator_posture_hint.length > 100
                        ? `${system.operator_posture_hint.slice(0, 100)}…`
                        : system.operator_posture_hint
                      : "—"
                  }
                  muted
                />
              </PanelSection>
              <PanelSection title="Treasury">
                <HiveRow label="Cash" value={formatVal(perf?.cash ?? fullState?.cash)} />
                <HiveRow label="Equity" value={formatVal(perf?.equity ?? fullState?.equity)} />
                <HiveRow label="Daily P&L" value={formatVal(perf?.realized_pnl_today ?? fullState?.realized_pnl_today)} />
                <HiveRow label="Loss Streak" value={formatVal(perf?.consecutive_losses ?? fullState?.consecutive_losses)} />
              </PanelSection>
            </Panel>
          </aside>
        </div>

        <section style={{ marginBottom: HIVE_UI.spaceLg }}>
          <Panel title="Signal intelligence" subtitle="Rank · gate · execution discipline · trade leg">
            <div className="hive-signal-grid">
              <div className="hive-signal-col">
            <PanelSection title="Rank" isFirst>
              <HiveRow
                label="Hive rank"
                value={top?.rank_score !== undefined && top?.rank_score !== null ? String(top.rank_score) : "—"}
              />
              <HiveRow label="Thesis" value={formatVal(top?.rationale?.thesis)} />
              <HiveRow
                label="Notes"
                value={
                  Array.isArray(top?.rationale?.points) && top.rationale.points.length
                    ? top.rationale.points.slice(0, 5).join(" · ")
                    : "—"
                }
              />
            </PanelSection>
            <PanelSection title="Guardrails">
              <HiveRow
                label="Triggered rules"
                value={
                  Array.isArray(guard?.triggered_rules) && guard.triggered_rules.length
                    ? `${guard.triggered_rules.length}: ${guard.triggered_rules.slice(0, 4).join(", ")}`
                    : "—"
                }
              />
              <HiveRow
                label="Warnings"
                value={
                  Array.isArray(guard?.warnings) && guard.warnings.length
                    ? guard.warnings.slice(0, 2).join(" · ")
                    : "—"
                }
              />
            </PanelSection>
            <PanelSection title="Promotion gate">
              {gateSuppressed ? (
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: HIVE_UI.calloutSuppressed.text,
                    marginBottom: HIVE_UI.spaceSm,
                    padding: `${HIVE_UI.spaceSm}px ${HIVE_UI.spaceMd}px`,
                    background: HIVE_UI.calloutSuppressed.bg,
                    borderRadius: HIVE_UI.rMd,
                    border: `1px solid ${HIVE_UI.calloutSuppressed.border}`,
                  }}
                >
                  <strong>Not actionable.</strong> Sub-layers may still show numbers — the gate is <strong>suppressed</strong>. Do not size an entry from the trade leg below.
                </div>
              ) : null}
              {gateHold ? (
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: HIVE_UI.calloutHold.text,
                    marginBottom: HIVE_UI.spaceSm,
                    padding: `${HIVE_UI.spaceSm}px ${HIVE_UI.spaceMd}px`,
                    background: HIVE_UI.calloutHold.bg,
                    borderRadius: HIVE_UI.rMd,
                    border: `1px solid ${HIVE_UI.calloutHold.border}`,
                  }}
                >
                  <strong>On hold — not a green light.</strong> Review discipline before acting; confirm guardrails and execution edge.
                </div>
              ) : null}
              <HiveRow
                label="Gate detail"
                value={
                  promo && typeof promo.reason === "string" && promo.reason.length
                    ? promo.reason.length > 120
                      ? `${promo.reason.slice(0, 120)}…`
                      : promo.reason
                    : "—"
                }
                emphasized={gatePromoted}
                muted={gateSuppressed || gateHold}
              />
              <HiveRow
                label="Since last pulse"
                value={
                  delta
                    ? `${delta.status} · ${typeof delta.detail === "string" ? (delta.detail.length > 72 ? `${delta.detail.slice(0, 72)}…` : delta.detail) : "—"}`
                    : "—"
                }
                muted
              />
            </PanelSection>
              </div>
              <div className="hive-signal-col">
            <PanelSection title="Contract quality" isFirst>
              <HiveRow label="Status" value={formatVal(cq?.status)} emphasized />
              <HiveRow
                label="Score"
                value={cq?.score !== undefined && cq?.score !== null ? String(cq.score) : "—"}
              />
              <HiveRow
                label="Signals / warnings"
                value={
                  Array.isArray(cq?.warnings) && cq.warnings.length
                    ? cq.warnings.slice(0, 2).join(" · ")
                    : Array.isArray(cq?.signals) && cq.signals.length
                      ? cq.signals.slice(0, 3).join(", ")
                      : Array.isArray(cq?.notes) && cq.notes.length && typeof cq.notes[0] === "string"
                        ? cq.notes[0].length > 100
                          ? `${cq.notes[0].slice(0, 100)}…`
                          : cq.notes[0]
                        : "—"
                }
                muted={Array.isArray(cq?.notes) && cq.notes.length && !(cq?.warnings?.length || cq?.signals?.length)}
              />
            </PanelSection>
            <PanelSection title="Execution edge">
              <HiveRow label="Status" value={formatVal(edge?.status)} emphasized />
              <HiveRow
                label="Score"
                value={edge?.score !== undefined && edge?.score !== null ? String(edge.score) : "—"}
              />
              <HiveRow
                label="Blockers"
                value={
                  Array.isArray(edge?.blockers) && edge.blockers.length
                    ? edge.blockers.slice(0, 2).join(" · ")
                    : "—"
                }
              />
            </PanelSection>
            <PanelSection title={gateSuppressed ? "Trade leg (reference — not promoted)" : gateHold ? "Trade leg (confirm before acting)" : "Trade leg"}>
              <div style={{ opacity: gateSuppressed ? 0.68 : gateHold ? 0.88 : 1 }}>
                <HiveRow
                  label="Action"
                  value={formatVal(recommended?.action)}
                  emphasized={gatePromoted && recommended?.action === "trade"}
                  muted={gateSuppressed || (gateHold && recommended?.action === "trade")}
                />
                <HiveRow
                  label="Structure"
                  value={formatVal(recommended?.structure)}
                  emphasized={gatePromoted && recommended?.action === "trade"}
                  muted={gateSuppressed || gateHold}
                />
                <HiveRow label="DTE" value={formatVal(recommended?.dte)} muted={gateSuppressed} />
                <HiveRow label="Delta" value={formatVal(recommended?.delta)} muted={gateSuppressed} />
              </div>
            </PanelSection>
              </div>
              <div className="hive-signal-span">
            <PanelSection title="In-process context (this run only)">
              <HiveRow
                label="Signal memory"
                value={
                  mem
                    ? `${mem.status} · cycles ${mem.evidence_count !== undefined && mem.evidence_count !== null ? mem.evidence_count : "—"} · ${typeof mem.detail === "string" ? (mem.detail.length > 56 ? `${mem.detail.slice(0, 56)}…` : mem.detail) : "—"}`
                    : "—"
                }
              />
              <HiveRow
                label="Flow (local pulses)"
                value={
                  flow
                    ? `${flow.status} · n=${flow.evidence_count !== undefined && flow.evidence_count !== null ? flow.evidence_count : "—"} · ${typeof flow.detail === "string" ? (flow.detail.length > 56 ? `${flow.detail.slice(0, 56)}…` : flow.detail) : "—"}`
                    : "—"
                }
              />
            </PanelSection>
              </div>
            </div>
          </Panel>
        </section>

        <section style={{ marginTop: HIVE_UI.spaceLg }}>
          <Panel title="Bee log" subtitle="In-process activity stream (this worker only)">
            <div
              style={{
                background: "rgba(0,0,0,0.45)",
                border: `1px solid ${HIVE_UI.borderDeep}`,
                borderRadius: HIVE_UI.rMd,
                padding: HIVE_UI.spaceSm,
                maxHeight: 280,
                overflowY: "auto",
                fontSize: 13,
                lineHeight: 1.5,
                color: "#c4c0b8",
                whiteSpace: "pre-wrap",
              }}
            >
              {(fullState?.logs || []).length ? (fullState.logs as string[]).join("\n") : "No bee activity yet"}
            </div>
          </Panel>
        </section>
      </div>
    </main>
    </>
  );
}

function OrbitHive({ cards, autoRefresh, running }: { cards: { label: string; value: any; featured?: boolean }[]; autoRefresh: boolean; running: boolean }) {
  const center = 360;
  const cardW = 126;
  const cardH = 108;
  const radius = 246;

  const positions = cards.map((card, i) => {
    const angle = (-90 + i * (360 / cards.length)) * (Math.PI / 180);
    return {
      left: center + Math.cos(angle) * radius - cardW / 2,
      top: center + Math.sin(angle) * radius - cardH / 2,
      ...card,
    };
  });

  return (
    <>
      <div className="orbit-desktop" style={{ position: "relative", height: 720 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.2,
            backgroundImage: "radial-gradient(#3d3d44 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 420,
            height: 420,
            marginLeft: -210,
            marginTop: -210,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(212,168,74,0.09) 0%, transparent 62%)",
            pointerEvents: "none",
          }}
        />

        <svg viewBox="0 0 720 720" width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.22 }}>
          <circle cx="360" cy="360" r="248" fill="none" stroke="#4a4538" strokeWidth="1.5" strokeDasharray="7 10" />
        </svg>

        {positions.map((card) => (
          <div
            key={card.label}
            style={{
              position: "absolute",
              left: card.left,
              top: card.top,
              width: cardW,
              height: cardH,
            }}
          >
            <HoneyHex label={card.label} value={formatVal(card.value)} featured={!!card.featured} />
          </div>
        ))}

        <div
          style={{
            position: "absolute",
            left: center - 155,
            top: center - 175,
            width: 310,
            height: 350,
            zIndex: 2,
            animation: running ? "hiveGlow 3.4s ease-in-out infinite" : undefined,
          }}
        >
          <MechanicalHive active={running} />
        </div>

        {autoRefresh ? (
          <>
            <OrbitBee size={34} radius={138} duration="6s" delay="0s" />
            <OrbitBee size={28} radius={168} duration="7.4s" delay="-1.2s" />
            <OrbitBee size={30} radius={198} duration="8.1s" delay="-2.1s" />
            <OrbitBee size={26} radius={226} duration="5.3s" delay="-0.7s" />
            <OrbitBee size={24} radius={154} duration="9.2s" delay="-3.2s" />
          </>
        ) : null}
      </div>

      <div className="orbit-mobile" style={{ display: "none" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div
            style={{
              width: 260,
              height: 295,
              animation: running ? "hiveGlow 3.4s ease-in-out infinite" : undefined,
              filter: "drop-shadow(0 0 28px rgba(212,168,74,0.1))",
            }}
          >
            <MechanicalHive active={running} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(126px, 126px))", gap: 12, justifyContent: "center" }}>
          {cards.map((card) => (
            <HoneyHex key={card.label} label={card.label} value={formatVal(card.value)} featured={!!card.featured} />
          ))}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 920px) {
          .orbit-desktop { display: none; }
          .orbit-mobile { display: block !important; }
        }
        @keyframes hiveGlow {
          0% { filter: drop-shadow(0 0 0 rgba(212,168,74,0)); }
          50% { filter: drop-shadow(0 0 22px rgba(212,168,74,0.28)); }
          100% { filter: drop-shadow(0 0 0 rgba(212,168,74,0)); }
        }
        @keyframes orbitSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes beeBob {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
          100% { transform: translateY(0px); }
        }
      `}</style>
    </>
  );
}

function MechanicalHive({ active = false }: { active?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 280,
        transform: active ? "scale(1.02)" : "scale(1)",
        filter: active ? "drop-shadow(0 0 20px rgba(212,168,74,0.25))" : "drop-shadow(0 0 12px rgba(212,168,74,0.06))",
        transition: HIVE_UI.motion,
      }}
    >
      <svg viewBox="0 0 300 340" width="100%" height="100%" aria-hidden="true">
        <defs>
          <linearGradient id="outerMetal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b949d" />
            <stop offset="45%" stopColor="#353b41" />
            <stop offset="100%" stopColor="#15191d" />
          </linearGradient>
          <linearGradient id="innerAmber" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f1ba43" />
            <stop offset="50%" stopColor="#b46f1a" />
            <stop offset="100%" stopColor="#5e340c" />
          </linearGradient>
          <radialGradient id="entryGlow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#fff0b0" stopOpacity="0.9" />
            <stop offset="35%" stopColor="#ffbe36" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#ff8c1a" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="150" cy="312" rx="82" ry="12" fill="rgba(0,0,0,0.18)" />
        <Band cx={150} cy={82} rx={52} ry={24} innerRx={40} innerRy={16} />
        <Band cx={150} cy={120} rx={76} ry={30} innerRx={60} innerRy={20} />
        <Band cx={150} cy={166} rx={92} ry={36} innerRx={74} innerRy={24} />
        <Band cx={150} cy={214} rx={78} ry={30} innerRx={61} innerRy={20} />
        <Band cx={150} cy={252} rx={54} ry={22} innerRx={42} innerRy={14} />

        <g opacity="0.45">
          <path d="M100 82 Q150 68 200 82" fill="none" stroke="#2c2c32" strokeWidth="3" />
          <path d="M76 120 Q150 100 224 120" fill="none" stroke="#2c2c32" strokeWidth="3" />
          <path d="M58 166 Q150 140 242 166" fill="none" stroke="#2c2c32" strokeWidth="3" />
          <path d="M72 214 Q150 194 228 214" fill="none" stroke="#2c2c32" strokeWidth="3" />
          <path d="M96 252 Q150 238 204 252" fill="none" stroke="#2c2c32" strokeWidth="3" />
        </g>

        <g>
          <ellipse cx="150" cy="226" rx="34" ry="18" fill="url(#entryGlow)" opacity="0.9" />
          <ellipse cx="150" cy="226" rx="24" ry="14" fill="#14100c" stroke="#f0b83d" strokeWidth="3.5" />
          <ellipse cx="150" cy="226" rx="10" ry="6" fill="#060403" />
        </g>

        <g>
          <VentCluster x={116} y={165} />
          <VentCluster x={150} y={152} />
          <VentCluster x={184} y={165} />
        </g>
      </svg>
    </div>
  );
}

function Band({ cx, cy, rx, ry, innerRx, innerRy }: { cx: number; cy: number; rx: number; ry: number; innerRx: number; innerRy: number }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#outerMetal)" stroke="#f0b83d" strokeWidth="3.5" />
      <ellipse cx={cx} cy={cy} rx={innerRx} ry={innerRy} fill="url(#innerAmber)" stroke="#2b1704" strokeWidth="2.5" />
      <ellipse cx={cx} cy={cy + 2} rx={Math.max(innerRx - 10, 8)} ry={Math.max(innerRy - 5, 6)} fill="#100d0a" opacity="0.35" />
      <Bolt x={cx - rx * 0.62} y={cy} />
      <Bolt x={cx + rx * 0.62} y={cy} />
      <Bolt x={cx} y={cy - ry * 0.68} />
    </g>
  );
}

function VentCluster({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <HexVent x={x} y={y} />
      <HexVent x={x + 14} y={y + 8} small />
      <HexVent x={x - 14} y={y + 8} small />
    </g>
  );
}

function HexVent({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
  const r = small ? 7 : 9;
  const h = r * 0.866;
  const points = [
    `${x},${y - r}`,
    `${x + h},${y - r / 2}`,
    `${x + h},${y + r / 2}`,
    `${x},${y + r}`,
    `${x - h},${y + r / 2}`,
    `${x - h},${y - r / 2}`,
  ].join(" ");

  return <polygon points={points} fill="#17110b" stroke="#ffb42b" strokeWidth={small ? 1.8 : 2.2} />;
}

function Bolt({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="5" fill="#171b1f" stroke="#c8d0d8" strokeWidth="1.8" />
      <circle cx={x} cy={y} r="1.6" fill="#8a929b" />
    </g>
  );
}

function OrbitBee({ size, radius, duration, delay }: { size: number; radius: number; duration: string; delay: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 360,
        top: 360,
        width: 0,
        height: 0,
        animation: `orbitSpin ${duration} linear infinite`,
        animationDelay: delay,
      }}
    >
      <div style={{ transform: `translateX(${radius}px)`, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, animation: "beeBob 1.2s ease-in-out infinite" }}>
        <RobotBee />
      </div>
    </div>
  );
}

function RobotBee() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <ellipse cx="34" cy="30" rx="16" ry="9" fill="rgba(255,248,221,0.75)" stroke="#514629" strokeWidth="3" />
      <ellipse cx="66" cy="30" rx="16" ry="9" fill="rgba(255,248,221,0.75)" stroke="#514629" strokeWidth="3" />
      <circle cx="50" cy="42" r="12" fill="#8b9299" stroke="#1c1f23" strokeWidth="5" />
      <rect x="29" y="46" width="42" height="28" rx="14" fill="#f2b321" stroke="#1e1200" strokeWidth="5" />
      <line x1="37" y1="54" x2="63" y2="54" stroke="#1e1200" strokeWidth="6" />
      <line x1="40" y1="64" x2="60" y2="64" stroke="#1e1200" strokeWidth="6" />
      <circle cx="45" cy="40" r="2.6" fill="#ff8c1a" />
      <circle cx="55" cy="40" r="2.6" fill="#ff8c1a" />
      <path d="M42 28 L34 18" stroke="#9ca3ab" strokeWidth="4" strokeLinecap="round" />
      <path d="M58 28 L66 18" stroke="#9ca3ab" strokeWidth="4" strokeLinecap="round" />
      <circle cx="33" cy="17" r="3" fill="#ffb31a" />
      <circle cx="67" cy="17" r="3" fill="#ffb31a" />
    </svg>
  );
}

function StatusPill({
  text,
  active = false,
  tone = "neutral",
}: {
  text: string;
  active?: boolean;
  tone?: PillTone;
}) {
  const base = {
    borderRadius: 999,
    padding: `${HIVE_UI.pill.paddingY}px ${HIVE_UI.pill.paddingX}px`,
    fontSize: HIVE_UI.pill.fontSize,
    fontWeight: HIVE_UI.pill.fontWeight,
    letterSpacing: "0.03em",
    transition: HIVE_UI.motion,
  };
  if (tone === "promoted" && active) {
    return (
      <div
        style={{
          ...base,
          background: "rgba(86,211,100,0.18)",
          border: "1px solid #56d364",
          color: "#d8ffd8",
        }}
      >
        {text}
      </div>
    );
  }
  if (tone === "suppressed") {
    return (
      <div
        style={{
          ...base,
          background: "rgba(150,64,64,0.2)",
          border: "1px solid #944",
          color: "#f2d4d4",
        }}
      >
        {text}
      </div>
    );
  }
  if (tone === "hold") {
    return (
      <div
        style={{
          ...base,
          background: "rgba(220,150,40,0.14)",
          border: "1px solid #b87a18",
          color: "#ffe9c0",
        }}
      >
        {text}
      </div>
    );
  }
  return (
    <div
      style={{
        ...base,
        background: active ? "rgba(86,211,100,0.16)" : "rgba(212,168,74,0.06)",
        border: active ? "1px solid #56d364" : `1px solid ${HIVE_UI.borderPanel}`,
        color: active ? "#d8ffd8" : "#d8cfba",
      }}
    >
      {text}
    </div>
  );
}

function HiveButton({ onClick, label, active = false }: { onClick: () => void; label: string; active?: boolean }) {
  const restShadow = "0 4px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)";
  const activeShadow = "inset 0 2px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,168,74,0.35)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active
          ? "linear-gradient(180deg, #3d3420 0%, #1f1c14 100%)"
          : "linear-gradient(180deg, #242428 0%, #141416 100%)",
        color: active ? "#f0d78c" : "#c9b896",
        border: active ? "1px solid rgba(212,168,74,0.55)" : "1px solid #333338",
        borderRadius: 999,
        padding: `${HIVE_UI.spaceSm}px ${HIVE_UI.spaceMd}px`,
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: "0.02em",
        boxShadow: active ? activeShadow : restShadow,
        cursor: "pointer",
        transition: HIVE_UI.motion,
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.filter = "brightness(0.88)";
        e.currentTarget.style.transform = "translateY(1px) scale(0.99)";
        e.currentTarget.style.boxShadow = "inset 0 4px 10px rgba(0,0,0,0.4)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.filter = "brightness(1)";
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = active ? activeShadow : restShadow;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = "brightness(1)";
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = active ? activeShadow : restShadow;
      }}
      onTouchStart={(e) => {
        e.currentTarget.style.filter = "brightness(0.88)";
        e.currentTarget.style.transform = "translateY(1px) scale(0.99)";
        e.currentTarget.style.boxShadow = "inset 0 4px 10px rgba(0,0,0,0.4)";
      }}
      onTouchEnd={(e) => {
        e.currentTarget.style.filter = "brightness(1)";
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = active ? activeShadow : restShadow;
      }}
    >
      {label}
    </button>
  );
}

function HoneyHex({ label, value, featured = false }: { label: string; value: string; featured?: boolean }) {
  return (
    <div style={{ width: 126, height: 108 }}>
      <div
        style={{
          width: 126,
          height: 108,
          clipPath: "polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)",
          background: featured
            ? "linear-gradient(180deg, rgba(212,168,74,0.12) 0%, rgba(20,20,24,0.95) 100%)"
            : "linear-gradient(180deg, rgba(30,30,34,0.95) 0%, rgba(12,12,14,0.98) 100%)",
          border: featured ? "1px solid rgba(212,168,74,0.45)" : `1px solid ${HIVE_UI.borderPanel}`,
          boxShadow: featured ? "0 0 28px rgba(212,168,74,0.08)" : "0 8px 22px rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: HIVE_UI.spaceSm,
          transition: HIVE_UI.motion,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: HIVE_UI.textLabel,
              textTransform: "uppercase",
              letterSpacing: 1.1,
              marginBottom: HIVE_UI.spaceXs,
              fontWeight: HIVE_UI.overline.fontWeight,
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: featured ? 23 : 19, fontWeight: 700, color: "#ebe4d4" }}>{value}</div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: HIVE_UI.panelBg,
        border: `1px solid ${HIVE_UI.borderPanel}`,
        borderRadius: HIVE_UI.rLg,
        padding: HIVE_UI.spaceMd,
        boxShadow: HIVE_UI.shadowLift,
        borderTop: `2px solid ${HIVE_UI.railAccent}`,
      }}
    >
      <h2
        style={{
          marginTop: 0,
          marginBottom: subtitle ? HIVE_UI.spaceXs : HIVE_UI.spaceMd,
          color: HIVE_UI.accent,
          fontSize: HIVE_UI.panelTitle.fontSize,
          fontWeight: HIVE_UI.panelTitle.fontWeight,
          letterSpacing: HIVE_UI.panelTitle.letterSpacing,
        }}
      >
        {title}
      </h2>
      {subtitle ? (
        <div
          style={{
            fontSize: 12,
            color: HIVE_UI.textMuted,
            letterSpacing: "0.04em",
            marginBottom: HIVE_UI.spaceMd,
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function PanelSection({ title, children, isFirst }: { title: string; children: React.ReactNode; isFirst?: boolean }) {
  return (
    <div style={{ marginTop: isFirst ? 0 : HIVE_UI.spaceSm }}>
      <div
        style={{
          fontSize: HIVE_UI.overline.fontSize,
          letterSpacing: 1.6,
          fontWeight: HIVE_UI.overline.fontWeight,
          color: HIVE_UI.textSection,
          textTransform: "uppercase",
          marginBottom: HIVE_UI.spaceXs,
          borderBottom: `1px solid ${HIVE_UI.dividerStrong}`,
          paddingBottom: HIVE_UI.spaceXs,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function HiveRow({
  label,
  value,
  emphasized = false,
  muted = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  muted?: boolean;
}) {
  const valueColor = muted ? "#6e6a62" : emphasized ? HIVE_UI.accent : "#e2ddd2";
  const fontSize = emphasized && !muted ? 18 : muted ? 15 : 16;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: HIVE_UI.spaceMd,
        padding: `${HIVE_UI.spaceSm - 2}px 0`,
        borderBottom: `1px solid ${HIVE_UI.divider}`,
      }}
    >
      <div style={{ color: muted ? "#6b665c" : HIVE_UI.textLabel }}>{label}</div>
      <div style={{ color: valueColor, fontWeight: 700, textAlign: "right", fontSize }}>
        {value}
      </div>
    </div>
  );
}

function formatVal(value: any) {
  if (value === null || value === undefined) return "-";
  return String(value);
}
