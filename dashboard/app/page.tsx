"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(
  /\/+$/,
  ""
);
const ADMIN_KEY = "mysecret123";

type PillTone = "neutral" | "promoted" | "hold" | "suppressed";

/** W4-L3 — command-theater shell: black first, amber = signal only (not Excalibur cyan). */
const HIVE_UI = {
  bg: "#020203",
  text: "#e6e4df",
  textMuted: "#5c5b58",
  textSection: "#6a6966",
  textLabel: "#7d7c78",
  accent: "#b8922a",
  accentSoft: "#5a5956",
  borderHero: "#141416",
  borderPanel: "#101012",
  borderDeep: "#0a0a0b",
  surfaceHero: "transparent",
  surfaceLive: "#030304",
  panelBg: "#060607",
  shadowCard: "none",
  shadowLift: "none",
  shadowSoft: "none",
  rXl: 10,
  rLg: 8,
  rMd: 6,
  rSm: 4,
  font: "Arial, sans-serif",
  motion: "background-color 165ms ease, border-color 165ms ease, box-shadow 165ms ease, opacity 165ms ease, transform 165ms ease, filter 165ms ease",
  divider: "rgba(255,255,255,0.06)",
  dividerStrong: "rgba(255,255,255,0.08)",
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
  calloutHold: { bg: "rgba(8,8,10,0.95)", border: "rgba(184,146,42,0.35)", text: "#c8c4bc" },
  errorBanner: { bg: "rgba(255,120,120,0.12)", border: "#a34c4c", text: "#ffd8d8" },
  surfaceCommand: "#050506",
  railAccent: "#b8922a",
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
  outline: 2px solid #b8922a;
  outline-offset: 2px;
}
.hive-shell { max-width: 1400px; margin: 0 auto; }
.hive-command-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px 20px;
  padding: 10px 0 14px;
  margin-bottom: 4px;
  border-bottom: 1px solid #141416;
}
.hive-theater {
  position: relative;
  margin: 0 -4px 8px;
  padding: 12px 8px 8px;
  border: 1px solid #121214;
  border-radius: 8px;
  background: #010102;
}
.hive-command-rail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px 0 18px;
  border-bottom: 1px solid #141416;
  margin-bottom: 18px;
}
.hive-operator-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr;
}
@media (min-width: 900px) {
  .hive-operator-grid { grid-template-columns: 1fr 1fr; }
}
.hive-signal-grid {
  display: grid;
  gap: 14px;
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
          padding: "16px 18px 28px",
        }}
      >
      <div className="hive-shell">
        <header className="hive-command-strip">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div style={{ width: 36, height: 36, position: "relative", opacity: 0.9 }}>
              <Image src="/hive-logo.png" alt="HIVE Logo" fill style={{ objectFit: "contain" }} priority />
            </div>
            <div>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.22em",
                  fontWeight: 600,
                  color: HIVE_UI.textMuted,
                  textTransform: "uppercase",
                  marginBottom: 2,
                }}
              >
                Hyper-Intelligent Volatility Execution
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 20,
                    color: HIVE_UI.text,
                    letterSpacing: "0.2em",
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                >
                  HIVE
                </h1>
                <span style={{ fontSize: 11, color: HIVE_UI.textMuted, letterSpacing: "0.06em", maxWidth: 420, lineHeight: 1.35 }}>
                  Mechanical swarm intelligence for SPY volatility trading
                </span>
              </div>
            </div>
          </div>
          <div
            style={{
              flex: "1 1 280px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: "0.18em",
                  fontWeight: 600,
                  color: HIVE_UI.textSection,
                  textTransform: "uppercase",
                  marginRight: 4,
                }}
              >
                Ops
              </span>
              <StatusPill text={running ? "Swarm Active" : "Swarm Idle"} active={running} />
              <StatusPill text={`Trading ${tradingEnabled ? "Armed" : "Safe"}`} />
              <StatusPill text={surfacePillText} />
              <StatusPill text={`Bias ${formatVal(signal?.bias)}`} />
              <StatusPill text={`Score ${formatVal(signal?.setup_score)}`} />
              <StatusPill text={autoRefresh ? "Auto refresh on" : "Auto refresh off"} active={autoRefresh} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: "0.18em",
                  fontWeight: 600,
                  color: HIVE_UI.textSection,
                  textTransform: "uppercase",
                  marginRight: 4,
                }}
              >
                Gov
              </span>
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
        </header>

        {error ? (
          <div
            style={{
              background: HIVE_UI.errorBanner.bg,
              color: HIVE_UI.errorBanner.text,
              padding: HIVE_UI.spaceSm,
              borderRadius: HIVE_UI.rMd,
              marginBottom: 12,
              border: `1px solid ${HIVE_UI.errorBanner.border}`,
            }}
          >
            <strong>Hive warning:</strong> {error}
          </div>
        ) : null}

        <section className="hive-theater">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 4,
              paddingBottom: 10,
              borderBottom: `1px solid ${HIVE_UI.borderPanel}`,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.24em",
                  fontWeight: 600,
                  color: HIVE_UI.textMuted,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Primary pulse
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: HIVE_UI.text,
                }}
              >
                Live tactical field
                <span style={{ color: HIVE_UI.accent, marginLeft: 12, fontSize: 11, fontWeight: 600, letterSpacing: "0.2em" }}>
                  SWARM
                </span>
              </div>
            </div>
          </div>
          <OrbitHive cards={cards} autoRefresh={autoRefresh} running={running} />
        </section>

        <div className="hive-command-rail">
          <span
            style={{
              fontSize: 9,
              letterSpacing: "0.2em",
              fontWeight: 600,
              color: HIVE_UI.textSection,
              textTransform: "uppercase",
              marginRight: 8,
            }}
          >
            Swarm controls
          </span>
          <HiveButton onClick={loadAll} label="Refresh Hive" />
          <HiveButton onClick={runCycle} label="Pulse Cycle" />
          <HiveButton onClick={startBot} label="Launch Bees" />
          <HiveButton onClick={stopBot} label="Recall Bees" />
          <HiveButton onClick={enableTrading} label="Arm Hive" />
          <HiveButton onClick={disableTrading} label="Disarm Hive" />
          <HiveButton onClick={() => setAutoRefresh(!autoRefresh)} label={autoRefresh ? "Auto Swarm On" : "Auto Swarm Off"} active={autoRefresh} />
        </div>

        <section style={{ marginBottom: 16 }}>
          <Panel title="Operator readout" subtitle="Session · lifecycle · book — support layer" compact>
            <div className="hive-operator-grid">
              <div>
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
              </div>
              <div>
                <PanelSection title="Treasury" isFirst>
                  <HiveRow label="Cash" value={formatVal(perf?.cash ?? fullState?.cash)} />
                  <HiveRow label="Equity" value={formatVal(perf?.equity ?? fullState?.equity)} />
                  <HiveRow label="Daily P&L" value={formatVal(perf?.realized_pnl_today ?? fullState?.realized_pnl_today)} />
                  <HiveRow label="Loss Streak" value={formatVal(perf?.consecutive_losses ?? fullState?.consecutive_losses)} />
                </PanelSection>
              </div>
            </div>
          </Panel>
        </section>

        <section style={{ marginBottom: HIVE_UI.spaceLg }}>
          <Panel title="Signal intelligence" subtitle="Rank · gate · execution discipline · trade leg" compact>
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
                    borderRadius: HIVE_UI.rSm,
                    border: `1px solid ${HIVE_UI.borderDeep}`,
                    borderLeft: `3px solid ${HIVE_UI.accent}`,
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
          <Panel title="Bee log" subtitle="In-process activity stream (this worker only)" compact>
            <div
              style={{
                background: "#030304",
                border: `1px solid ${HIVE_UI.borderDeep}`,
                borderRadius: HIVE_UI.rSm,
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
  const cx = 360;
  const cy = 418;
  const cardW = 126;
  const cardH = 108;
  const radius = 296;
  const orbitH = 800;

  const positions = cards.map((card, i) => {
    const angle = (-90 + i * (360 / cards.length)) * (Math.PI / 180);
    return {
      left: cx + Math.cos(angle) * radius - cardW / 2,
      top: cy + Math.sin(angle) * radius - cardH / 2,
      ...card,
    };
  });

  return (
    <>
      <div className="orbit-desktop" style={{ position: "relative", height: orbitH }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.09,
            backgroundImage: "radial-gradient(#252528 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <svg viewBox={`0 0 720 ${orbitH}`} width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.55 }}>
          <circle cx={cx} cy={cy} r={radius + 4} fill="none" stroke="#18181a" strokeWidth="1" strokeDasharray="5 8" />
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
            left: cx - 224,
            top: cy - 230,
            width: 448,
            height: 460,
            zIndex: 2,
          }}
        >
          <MechanicalHive active={running} />
        </div>

        {autoRefresh ? (
          <>
            <OrbitBee size={34} cx={cx} cy={cy} radius={160} duration="6s" delay="0s" />
            <OrbitBee size={28} cx={cx} cy={cy} radius={189} duration="7.4s" delay="-1.2s" />
            <OrbitBee size={30} cx={cx} cy={cy} radius={219} duration="8.1s" delay="-2.1s" />
            <OrbitBee size={26} cx={cx} cy={cy} radius={249} duration="5.3s" delay="-0.7s" />
            <OrbitBee size={24} cx={cx} cy={cy} radius={176} duration="9.2s" delay="-3.2s" />
          </>
        ) : null}
      </div>

      <div className="orbit-mobile" style={{ display: "none" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div
            style={{
              width: 320,
              height: 360,
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
        minHeight: 300,
        transform: active ? "scale(1.008)" : "scale(1)",
        filter: active ? "brightness(1.06)" : "none",
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
            <stop offset="0%" stopColor="#3a3834" />
            <stop offset="40%" stopColor="#252420" />
            <stop offset="100%" stopColor="#121110" />
          </linearGradient>
          <radialGradient id="entryGlow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#c9a038" stopOpacity="0.35" />
            <stop offset="45%" stopColor="#6a5220" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
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
          <ellipse cx="150" cy="226" rx="34" ry="18" fill="url(#entryGlow)" opacity="0.85" />
          <ellipse cx="150" cy="226" rx="24" ry="14" fill="#0a0a0c" stroke="#8a7028" strokeWidth="2.5" />
          <ellipse cx="150" cy="226" rx="10" ry="6" fill="#020203" />
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
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#outerMetal)" stroke="#5c5c62" strokeWidth="2" />
      <ellipse cx={cx} cy={cy} rx={innerRx} ry={innerRy} fill="url(#innerAmber)" stroke="#1a1816" strokeWidth="1.5" />
      <ellipse cx={cx} cy={cy + 2} rx={Math.max(innerRx - 10, 8)} ry={Math.max(innerRy - 5, 6)} fill="#060607" opacity="0.5" />
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

  return <polygon points={points} fill="#0c0c0e" stroke="#6b5a28" strokeWidth={small ? 1.2 : 1.5} />;
}

function Bolt({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="5" fill="#171b1f" stroke="#c8d0d8" strokeWidth="1.8" />
      <circle cx={x} cy={y} r="1.6" fill="#8a929b" />
    </g>
  );
}

function OrbitBee({
  size,
  radius,
  duration,
  delay,
  cx,
  cy,
}: {
  size: number;
  radius: number;
  duration: string;
  delay: string;
  cx: number;
  cy: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: cx,
        top: cy,
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
      <rect x="29" y="46" width="42" height="28" rx="14" fill="#2a2824" stroke="#1a1916" strokeWidth="5" />
      <line x1="37" y1="54" x2="63" y2="54" stroke="#1e1200" strokeWidth="6" />
      <line x1="40" y1="64" x2="60" y2="64" stroke="#1e1200" strokeWidth="6" />
      <circle cx="45" cy="40" r="2.6" fill="#ff8c1a" />
      <circle cx="55" cy="40" r="2.6" fill="#ff8c1a" />
      <path d="M42 28 L34 18" stroke="#9ca3ab" strokeWidth="4" strokeLinecap="round" />
      <path d="M58 28 L66 18" stroke="#9ca3ab" strokeWidth="4" strokeLinecap="round" />
      <circle cx="33" cy="17" r="3" fill="#c9a038" />
      <circle cx="67" cy="17" r="3" fill="#c9a038" />
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
    borderRadius: 4,
    padding: `${HIVE_UI.pill.paddingY - 2}px ${HIVE_UI.pill.paddingX - 2}px`,
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
          background: "rgba(184,146,42,0.07)",
          border: "1px solid #2a2820",
          color: "#a8a498",
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
        background: active ? "rgba(86,211,100,0.14)" : "#0c0c0e",
        border: active ? "1px solid #56d364" : "1px solid #1a1a1e",
        color: active ? "#d8ffd8" : "#7d7c82",
      }}
    >
      {text}
    </div>
  );
}

function HiveButton({ onClick, label, active = false }: { onClick: () => void; label: string; active?: boolean }) {
  const restShadow = "none";
  const activeShadow = "inset 0 0 0 1px rgba(184,146,42,0.55)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "#12100a" : "#0e0e10",
        color: active ? "#d4c090" : "#6f6e74",
        border: active ? "1px solid rgba(184,146,42,0.55)" : "1px solid #1c1c20",
        borderRadius: 4,
        padding: `${HIVE_UI.spaceSm}px ${HIVE_UI.spaceMd}px`,
        fontWeight: 600,
        fontSize: 13,
        letterSpacing: "0.04em",
        textTransform: "uppercase" as const,
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
            ? "linear-gradient(180deg, #141416 0%, #0c0c0e 100%)"
            : "linear-gradient(180deg, #101012 0%, #080809 100%)",
          border: featured ? "1px solid rgba(184,146,42,0.4)" : `1px solid ${HIVE_UI.borderDeep}`,
          boxShadow: "none",
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
          <div style={{ fontSize: featured ? 23 : 19, fontWeight: 700, color: featured ? "#e4dfd4" : "#b8b6b0" }}>{value}</div>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  compact,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        background: HIVE_UI.panelBg,
        border: `1px solid ${HIVE_UI.borderDeep}`,
        borderRadius: HIVE_UI.rLg,
        padding: compact ? 12 : 14,
        borderLeft: `2px solid rgba(184,146,42,0.35)`,
      }}
    >
      <h2
        style={{
          marginTop: 0,
          marginBottom: subtitle ? 4 : compact ? 10 : 12,
          color: HIVE_UI.text,
          fontSize: compact ? 12 : 14,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase" as const,
        }}
      >
        {title}
      </h2>
      {subtitle ? (
        <div
          style={{
            fontSize: compact ? 10 : 11,
            color: HIVE_UI.textMuted,
            letterSpacing: "0.12em",
            marginBottom: compact ? 10 : 12,
            lineHeight: 1.45,
            textTransform: "uppercase" as const,
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
