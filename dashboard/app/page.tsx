"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Image from "next/image";

const API = (
  (typeof process.env.NEXT_PUBLIC_API_URL === "string"
    ? process.env.NEXT_PUBLIC_API_URL.trim()
    : "") || "http://127.0.0.1:8000"
).replace(/\/+$/, "");
const ADMIN_KEY = "mysecret123";

type PillTone = "neutral" | "promoted" | "hold" | "suppressed";

const HIVE_UI = {
  bg: "#020203",
  bgTop: "#06070a",
  shell: "#090b0f",
  shell2: "#0d1016",
  panel: "#0b0d11",
  panel2: "#0f1218",
  panel3: "#12161d",
  text: "#eef2f7",
  textSoft: "#c6ced8",
  textMuted: "#7f8996",
  textDim: "#5c6470",
  accent: "#c79a31",
  accentSoft: "rgba(199,154,49,0.16)",
  accentLine: "rgba(199,154,49,0.36)",
  good: "#56d364",
  goodSoft: "rgba(86,211,100,0.14)",
  danger: "#d96b6b",
  dangerSoft: "rgba(217,107,107,0.14)",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.12)",
  borderDeep: "rgba(255,255,255,0.05)",
  stageGlow:
    "radial-gradient(circle at 50% 36%, rgba(255,255,255,0.022) 0%, rgba(0,0,0,0) 52%)",
  pageGlow: "none",
  font: "Arial, sans-serif",
  motion:
    "background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease, transform 160ms ease, filter 160ms ease, color 160ms ease",
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
      const msg = err?.message || "Could not connect to backend";
      const looksNetwork =
        /failed to fetch|networkerror|load failed|fetch|econnrefused|connection refused/i.test(
          String(msg)
        );
      setError(
        looksNetwork
          ? `${msg} — set NEXT_PUBLIC_API_URL in dashboard/.env.local to your bot API origin (no trailing slash) and restart next dev.`
          : msg
      );
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
  const gatePillText = !promoStatus
    ? "Gate: —"
    : gateSuppressed
      ? "Gate: suppressed"
      : gateHold
        ? "Gate: on hold"
        : "Gate: promoted";
  const gatePillTone: PillTone = !promoStatus
    ? "neutral"
    : gateSuppressed
      ? "suppressed"
      : gateHold
        ? "hold"
        : "promoted";

  const guardTone: PillTone =
    guard?.status === "avoid"
      ? "suppressed"
      : guard?.status === "caution" ||
          (guard?.status === "viable" && !guard?.actionable)
        ? "hold"
        : guard?.status === "viable"
          ? "promoted"
          : "neutral";
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
          __html: `
@media (prefers-reduced-motion: reduce) {
  [data-hive-dashboard] * {
    animation: none !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0s !important;
  }
}
[data-hive-dashboard] button:focus-visible {
  outline: 2px solid ${HIVE_UI.accent};
  outline-offset: 2px;
}
.hive-shell {
  max-width: 1540px;
  margin: 0 auto;
  position: relative;
}
.hive-topbar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 13px 17px;
  border: 1px solid ${HIVE_UI.border};
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)),
    linear-gradient(180deg, #0a0d12, #090b10);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.04),
    0 18px 50px rgba(0,0,0,0.3);
}
.hive-topbar-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.hive-topbar-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.hive-topbar-kickers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.hive-hero-theater {
  position: relative;
  margin-top: 16px;
  min-height: min(48vh, 500px);
  max-height: 528px;
  border-radius: 22px;
  border: 1px solid ${HIVE_UI.borderStrong};
  overflow: hidden;
  background: #010101;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.035),
    0 32px 90px rgba(0,0,0,0.58);
}
.hive-hero-theater::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.38) 22%, rgba(0,0,0,0.52) 55%, rgba(0,0,0,0.94) 100%),
    radial-gradient(ellipse 88% 72% at 50% 44%, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.62) 48%, rgba(0,0,0,0.97) 100%),
    linear-gradient(118deg, rgba(5,5,6,0.72) 0%, rgba(0,0,0,0) 46%, rgba(8,6,4,0.38) 100%),
    radial-gradient(ellipse 120% 80% at 78% 18%, rgba(199,154,49,0.07) 0%, rgba(0,0,0,0) 42%);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.hive-hero-media {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
}
.hive-hero-media-inner {
  position: absolute;
  left: -11%;
  right: -11%;
  top: -9%;
  bottom: -11%;
}
.hive-hero-media-inner img {
  filter: saturate(0.86) brightness(0.79) contrast(1.14) hue-rotate(-10deg);
}
.hive-hero-theater::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.055),
    inset 0 0 120px rgba(0,0,0,0.35);
  border-radius: 22px;
}
.hive-hero-chrome-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  z-index: 5;
  background: linear-gradient(90deg, transparent 8%, ${HIVE_UI.accentLine} 50%, transparent 92%);
  opacity: 0.92;
}
.hive-hero-caption {
  padding: 11px 16px 13px 14px;
  border-radius: 0 16px 0 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.58), rgba(0,0,0,0.14));
  border-left: 2px solid rgba(199,154,49,0.42);
  box-shadow: 0 18px 48px rgba(0,0,0,0.45);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.hive-stage-shell {
  position: relative;
  margin-top: 16px;
  border: 1px solid ${HIVE_UI.border};
  border-radius: 22px;
  background:
    ${HIVE_UI.stageGlow},
    linear-gradient(180deg, rgba(255,255,255,0.018), rgba(255,255,255,0.004)),
    linear-gradient(180deg, #06080c 0%, #030405 100%);
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.028),
    0 24px 64px rgba(0,0,0,0.48);
}
.hive-stage-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(255,255,255,0.028), rgba(255,255,255,0) 16%, rgba(255,255,255,0) 84%, rgba(255,255,255,0.02)),
    linear-gradient(180deg, rgba(255,255,255,0.014), rgba(255,255,255,0));
  pointer-events: none;
}
.hive-stage-header {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: end;
  padding: 16px 20px 0;
}
.hive-stage-body {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 280px;
  gap: 16px;
  padding: 16px 16px 16px;
  align-items: stretch;
}
.hive-side-rail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hive-rail-card {
  border: 1px solid ${HIVE_UI.borderDeep};
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(255,255,255,0.028), rgba(255,255,255,0.012));
  padding: 13px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.022);
}
.hive-rail-title {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: ${HIVE_UI.textMuted};
}
.hive-command-rail {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 13px 15px;
  border: 1px solid ${HIVE_UI.border};
  border-radius: 14px;
  background: linear-gradient(180deg, #090c11, #080a0e);
}
.hive-lower-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: 1.05fr 1.2fr;
  gap: 16px;
}
.hive-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.hive-signal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.hive-signal-span {
  grid-column: 1 / -1;
}
@media (max-width: 1200px) {
  .hive-stage-body {
    grid-template-columns: 1fr;
  }
  .hive-side-rail {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 980px) {
  .hive-topbar {
    grid-template-columns: 1fr;
    align-items: start;
  }
  .hive-topbar-kickers {
    justify-content: flex-start;
  }
  .hive-stage-header {
    grid-template-columns: 1fr;
  }
  .hive-lower-grid {
    grid-template-columns: 1fr;
  }
  .hive-signal-grid {
    grid-template-columns: 1fr;
  }
  .hive-side-rail {
    grid-template-columns: 1fr;
  }
}
          `,
        }}
      />
      <main
        data-hive-dashboard
        style={{
          minHeight: "100vh",
          background: `linear-gradient(180deg, ${HIVE_UI.bgTop} 0%, ${HIVE_UI.bg} 35%, #010102 100%)`,
          color: HIVE_UI.text,
          fontFamily: HIVE_UI.font,
          padding: "16px 16px 30px",
        }}
      >
        <div className="hive-shell">
          <header className="hive-topbar">
            <div className="hive-topbar-left">
              <div
                style={{
                  width: 52,
                  height: 52,
                  position: "relative",
                  borderRadius: 14,
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
                  border: `1px solid ${HIVE_UI.border}`,
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <Image
                  src="/hive-logo.png"
                  alt="HIVE Logo"
                  fill
                  style={{ objectFit: "contain", padding: 8 }}
                  priority
                />
              </div>

              <div className="hive-topbar-meta">
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.24em",
                    fontWeight: 700,
                    color: HIVE_UI.textMuted,
                    textTransform: "uppercase",
                  }}
                >
                  Hyper-Intelligent Volatility Execution
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                    gap: 10,
                  }}
                >
                  <h1
                    style={{
                      margin: 0,
                      fontSize: 26,
                      lineHeight: 1,
                      fontWeight: 800,
                      letterSpacing: "0.22em",
                      color: HIVE_UI.text,
                    }}
                  >
                    HIVE
                  </h1>
                  <span
                    style={{
                      fontSize: 12,
                      color: HIVE_UI.textMuted,
                      letterSpacing: "0.08em",
                    }}
                  >
                    Mechanical swarm intelligence for SPY volatility trading
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                minWidth: 0,
                padding: "0 4px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <StatusPill
                  text={running ? "Swarm Active" : "Swarm Idle"}
                  active={running}
                />
                <StatusPill text={`Trading ${tradingEnabled ? "Armed" : "Safe"}`} />
                <StatusPill text={surfacePillText} />
                <StatusPill text={gatePillText} tone={gatePillTone} active={gatePromoted} />
                <StatusPill
                  text={
                    guard?.status
                      ? `Guard: ${guard.status}${guard.actionable ? " · act" : " · hold"}`
                      : "Guard: —"
                  }
                  tone={guardTone}
                  active={guardPillActive}
                />
                <StatusPill
                  text={autoRefresh ? "Auto refresh on" : "Auto refresh off"}
                  active={autoRefresh}
                />
              </div>
            </div>

            <div className="hive-topbar-kickers">
              <MetricKicker label="Bias" value={formatVal(signal?.bias)} />
              <MetricKicker label="Score" value={formatVal(signal?.setup_score)} />
              <MetricKicker
                label="Delta"
                value={
                  !delta?.status
                    ? "—"
                    : delta.status === "none"
                      ? "no prior pulse"
                      : delta.status === "unchanged"
                        ? "unchanged"
                        : delta.status === "minor_change"
                          ? "minor"
                          : "meaningful"
                }
                accent={delta?.status === "meaningful_change"}
              />
            </div>
          </header>

          {error ? (
            <div
              style={{
                marginTop: 16,
                background: "linear-gradient(180deg, rgba(217,107,107,0.16), rgba(217,107,107,0.1))",
                color: "#ffe0e0",
                padding: "14px 16px",
                borderRadius: 14,
                border: `1px solid ${HIVE_UI.danger}`,
              }}
            >
              <strong>Hive warning:</strong> {error}
            </div>
          ) : null}

          <section className="hive-hero-theater" aria-label="HIVE tactical hero theater">
            <div className="hive-hero-chrome-top" aria-hidden="true" />
            <div className="hive-hero-media">
              <div className="hive-hero-media-inner">
                <Image
                  src="/hive-hero.jpg"
                  alt="HIVE tactical command — SPY options swarm"
                  fill
                  sizes="(max-width: 900px) 100vw, 1540px"
                  style={{ objectFit: "cover", objectPosition: "center 46%" }}
                  priority
                />
              </div>
            </div>
            <div
              className="hive-hero-caption"
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                zIndex: 6,
                display: "flex",
                flexDirection: "column",
                gap: 5,
                maxWidth: "min(92vw, 520px)",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.28em",
                  fontWeight: 700,
                  color: HIVE_UI.textSoft,
                  textTransform: "uppercase",
                  opacity: 0.92,
                }}
              >
                SPY options · swarm command
              </div>
              <div
                style={{
                  fontSize: 27,
                  lineHeight: 1.04,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  color: HIVE_UI.text,
                  textShadow:
                    "0 1px 0 rgba(0,0,0,0.95), 0 2px 18px rgba(0,0,0,0.75), 0 12px 40px rgba(0,0,0,0.55)",
                }}
              >
                TACTICAL THEATER
              </div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.26em",
                  fontWeight: 700,
                  color: HIVE_UI.accent,
                  textTransform: "uppercase",
                  opacity: 0.95,
                }}
              >
                HIVE · SWARM ARRAY
              </div>
            </div>
          </section>

          <section className="hive-stage-shell">
            <div className="hive-stage-header">
              <div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.24em",
                    fontWeight: 700,
                    color: HIVE_UI.textMuted,
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  Primary pulse
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 30,
                      lineHeight: 1,
                      fontWeight: 800,
                      letterSpacing: "0.12em",
                      color: HIVE_UI.text,
                    }}
                  >
                    LIVE TACTICAL FIELD
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.24em",
                      fontWeight: 700,
                      color: HIVE_UI.accent,
                    }}
                  >
                    SWARM
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  justifyContent: "flex-end",
                }}
              >
                <StatusPill text={`Session ${regime?.code ? String(regime.code) : "—"}`} />
                <StatusPill
                  text={`RTH ${regime?.market_hours ? "on" : "off"}`}
                  active={!!regime?.market_hours}
                />
                <StatusPill
                  text={
                    system?.signal_age_seconds !== undefined &&
                    system?.signal_age_seconds !== null
                      ? `Pulse age ${system.signal_age_seconds}s`
                      : "Pulse age —"
                  }
                />
              </div>
            </div>

            <div className="hive-stage-body">
              <div className="hive-side-rail">
                <div className="hive-rail-card">
                  <h3 className="hive-rail-title">Operator readout</h3>
                  <RailRow
                    label="Lifecycle"
                    value={
                      system?.lifecycle_phase
                        ? `${String(system.lifecycle_phase)}${
                            typeof system.lifecycle_hint === "string" &&
                            system.lifecycle_hint.length
                              ? ` — ${
                                  system.lifecycle_hint.length > 58
                                    ? `${system.lifecycle_hint.slice(0, 58)}…`
                                    : system.lifecycle_hint
                                }`
                              : ""
                          }`
                        : "—"
                    }
                  />
                  <RailRow
                    label="Posture"
                    value={
                      typeof system?.operator_posture_hint === "string" &&
                      system.operator_posture_hint.length
                        ? system.operator_posture_hint.length > 58
                          ? `${system.operator_posture_hint.slice(0, 58)}…`
                          : system.operator_posture_hint
                        : "—"
                    }
                    muted
                  />
                  <RailRow
                    label="Pending"
                    value={
                      system?.pending_signals_semantics === "broker_orders_only"
                        ? `${formatVal(
                            system?.pending_signals_count ?? 0
                          )} — broker only`
                        : formatVal(system?.pending_signals_count ?? "—")
                    }
                  />
                  <RailRow
                    label="Provider"
                    value={formatVal(health?.provider)}
                    muted
                  />
                </div>

                <div className="hive-rail-card">
                  <h3 className="hive-rail-title">Treasury</h3>
                  <RailRow label="Cash" value={formatVal(perf?.cash ?? fullState?.cash)} />
                  <RailRow
                    label="Equity"
                    value={formatVal(perf?.equity ?? fullState?.equity)}
                  />
                  <RailRow
                    label="Daily P&L"
                    value={formatVal(
                      perf?.realized_pnl_today ?? fullState?.realized_pnl_today
                    )}
                    accent
                  />
                  <RailRow
                    label="Loss Streak"
                    value={formatVal(
                      perf?.consecutive_losses ?? fullState?.consecutive_losses
                    )}
                  />
                </div>
              </div>

              <div
                style={{
                  minWidth: 0,
                  border: `1px solid ${HIVE_UI.borderDeep}`,
                  borderRadius: 20,
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))",
                  padding: 10,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025)",
                }}
              >
                <OrbitHive cards={cards} autoRefresh={autoRefresh} running={running} />
              </div>

              <div className="hive-side-rail">
                <div className="hive-rail-card">
                  <h3 className="hive-rail-title">Guard + gate</h3>
                  <RailRow
                    label="Guard"
                    value={
                      guard?.status
                        ? `${guard.status}${guard.actionable ? " · actionable" : ""}`
                        : "—"
                    }
                    accent={guard?.status === "viable" && !!guard?.actionable}
                    danger={guard?.status === "avoid"}
                  />
                  <RailRow
                    label="Gate"
                    value={gatePillText.replace("Gate: ", "")}
                    accent={gatePromoted}
                    danger={gateSuppressed}
                  />
                  <RailRow
                    label="Gate detail"
                    value={
                      promo && typeof promo.reason === "string" && promo.reason.length
                        ? promo.reason.length > 58
                          ? `${promo.reason.slice(0, 58)}…`
                          : promo.reason
                        : "—"
                    }
                    muted={gateSuppressed || gateHold}
                  />
                  <RailRow
                    label="Since last pulse"
                    value={
                      delta
                        ? `${delta.status} · ${
                            typeof delta.detail === "string"
                              ? delta.detail.length > 38
                                ? `${delta.detail.slice(0, 38)}…`
                                : delta.detail
                              : "—"
                          }`
                        : "—"
                    }
                    muted
                  />
                </div>

                <div className="hive-rail-card">
                  <h3 className="hive-rail-title">Trade leg</h3>
                  <RailRow
                    label="Action"
                    value={formatVal(recommended?.action)}
                    accent={gatePromoted && recommended?.action === "trade"}
                    muted={gateSuppressed}
                  />
                  <RailRow
                    label="Structure"
                    value={formatVal(recommended?.structure)}
                    muted={gateSuppressed || gateHold}
                  />
                  <RailRow label="DTE" value={formatVal(recommended?.dte)} />
                  <RailRow label="Delta" value={formatVal(recommended?.delta)} />
                </div>
              </div>
            </div>
          </section>

          <div className="hive-command-rail">
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                fontWeight: 700,
                color: HIVE_UI.textMuted,
                textTransform: "uppercase",
                alignSelf: "center",
                marginRight: 6,
              }}
            >
              Swarm controls
            </div>
            <HiveButton onClick={loadAll} label="Refresh Hive" />
            <HiveButton onClick={runCycle} label="Pulse Cycle" />
            <HiveButton onClick={startBot} label="Launch Bees" />
            <HiveButton onClick={stopBot} label="Recall Bees" />
            <HiveButton onClick={enableTrading} label="Arm Hive" />
            <HiveButton onClick={disableTrading} label="Disarm Hive" />
            <HiveButton
              onClick={() => setAutoRefresh(!autoRefresh)}
              label={autoRefresh ? "Auto Swarm On" : "Auto Swarm Off"}
              active={autoRefresh}
            />
          </div>

          <div className="hive-lower-grid">
            <div className="hive-stack">
              <Panel
                title="Signal intelligence"
                subtitle="Rank · gate · execution discipline · trade leg"
              >
                <div className="hive-signal-grid">
                  <div>
                    <PanelSection title="Rank" isFirst>
                      <HiveRow
                        label="Hive rank"
                        value={
                          top?.rank_score !== undefined && top?.rank_score !== null
                            ? String(top.rank_score)
                            : "—"
                        }
                      />
                      <HiveRow label="Thesis" value={formatVal(top?.rationale?.thesis)} />
                      <HiveRow
                        label="Notes"
                        value={
                          Array.isArray(top?.rationale?.points) &&
                          top.rationale.points.length
                            ? top.rationale.points.slice(0, 5).join(" · ")
                            : "—"
                        }
                      />
                    </PanelSection>

                    <PanelSection title="Guardrails">
                      <HiveRow
                        label="Triggered rules"
                        value={
                          Array.isArray(guard?.triggered_rules) &&
                          guard.triggered_rules.length
                            ? `${guard.triggered_rules.length}: ${guard.triggered_rules
                                .slice(0, 4)
                                .join(", ")}`
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
                            lineHeight: 1.5,
                            color: "#ffdede",
                            marginBottom: 12,
                            padding: "12px 14px",
                            background:
                              "linear-gradient(180deg, rgba(217,107,107,0.15), rgba(217,107,107,0.08))",
                            borderRadius: 12,
                            border: `1px solid ${HIVE_UI.danger}`,
                          }}
                        >
                          <strong>Not actionable.</strong> Sub-layers may still show
                          numbers — the gate is <strong>suppressed</strong>. Do not size
                          an entry from the trade leg below.
                        </div>
                      ) : null}

                      {gateHold ? (
                        <div
                          style={{
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: HIVE_UI.textSoft,
                            marginBottom: 12,
                            padding: "12px 14px",
                            background:
                              "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
                            borderRadius: 12,
                            border: `1px solid ${HIVE_UI.border}`,
                            borderLeft: `3px solid ${HIVE_UI.accent}`,
                          }}
                        >
                          <strong>On hold — not a green light.</strong> Review discipline
                          before acting; confirm guardrails and execution edge.
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
                            ? `${delta.status} · ${
                                typeof delta.detail === "string"
                                  ? delta.detail.length > 72
                                    ? `${delta.detail.slice(0, 72)}…`
                                    : delta.detail
                                  : "—"
                              }`
                            : "—"
                        }
                        muted
                      />
                    </PanelSection>
                  </div>

                  <div>
                    <PanelSection title="Contract quality" isFirst>
                      <HiveRow label="Status" value={formatVal(cq?.status)} emphasized />
                      <HiveRow
                        label="Score"
                        value={
                          cq?.score !== undefined && cq?.score !== null
                            ? String(cq.score)
                            : "—"
                        }
                      />
                      <HiveRow
                        label="Signals / warnings"
                        value={
                          Array.isArray(cq?.warnings) && cq.warnings.length
                            ? cq.warnings.slice(0, 2).join(" · ")
                            : Array.isArray(cq?.signals) && cq.signals.length
                              ? cq.signals.slice(0, 3).join(", ")
                              : Array.isArray(cq?.notes) &&
                                  cq.notes.length &&
                                  typeof cq.notes[0] === "string"
                                ? cq.notes[0].length > 100
                                  ? `${cq.notes[0].slice(0, 100)}…`
                                  : cq.notes[0]
                                : "—"
                        }
                        muted={
                          Array.isArray(cq?.notes) &&
                          cq.notes.length &&
                          !(cq?.warnings?.length || cq?.signals?.length)
                        }
                      />
                    </PanelSection>

                    <PanelSection title="Execution edge">
                      <HiveRow label="Status" value={formatVal(edge?.status)} emphasized />
                      <HiveRow
                        label="Score"
                        value={
                          edge?.score !== undefined && edge?.score !== null
                            ? String(edge.score)
                            : "—"
                        }
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

                    <PanelSection
                      title={
                        gateSuppressed
                          ? "Trade leg (reference — not promoted)"
                          : gateHold
                            ? "Trade leg (confirm before acting)"
                            : "Trade leg"
                      }
                    >
                      <div style={{ opacity: gateSuppressed ? 0.68 : gateHold ? 0.88 : 1 }}>
                        <HiveRow
                          label="Action"
                          value={formatVal(recommended?.action)}
                          emphasized={gatePromoted && recommended?.action === "trade"}
                          muted={
                            gateSuppressed || (gateHold && recommended?.action === "trade")
                          }
                        />
                        <HiveRow
                          label="Structure"
                          value={formatVal(recommended?.structure)}
                          emphasized={gatePromoted && recommended?.action === "trade"}
                          muted={gateSuppressed || gateHold}
                        />
                        <HiveRow
                          label="DTE"
                          value={formatVal(recommended?.dte)}
                          muted={gateSuppressed}
                        />
                        <HiveRow
                          label="Delta"
                          value={formatVal(recommended?.delta)}
                          muted={gateSuppressed}
                        />
                      </div>
                    </PanelSection>
                  </div>

                  <div className="hive-signal-span">
                    <PanelSection title="In-process context (this run only)">
                      <HiveRow
                        label="Signal memory"
                        value={
                          mem
                            ? `${mem.status} · cycles ${
                                mem.evidence_count !== undefined &&
                                mem.evidence_count !== null
                                  ? mem.evidence_count
                                  : "—"
                              } · ${
                                typeof mem.detail === "string"
                                  ? mem.detail.length > 56
                                    ? `${mem.detail.slice(0, 56)}…`
                                    : mem.detail
                                  : "—"
                              }`
                            : "—"
                        }
                      />
                      <HiveRow
                        label="Flow (local pulses)"
                        value={
                          flow
                            ? `${flow.status} · n=${
                                flow.evidence_count !== undefined &&
                                flow.evidence_count !== null
                                  ? flow.evidence_count
                                  : "—"
                              } · ${
                                typeof flow.detail === "string"
                                  ? flow.detail.length > 56
                                    ? `${flow.detail.slice(0, 56)}…`
                                    : flow.detail
                                  : "—"
                              }`
                            : "—"
                        }
                      />
                    </PanelSection>
                  </div>
                </div>
              </Panel>
            </div>

            <div className="hive-stack">
              <Panel title="Bee log" subtitle="In-process activity stream (this worker only)">
                <div
                  style={{
                    background: "linear-gradient(180deg, #06080b, #040507)",
                    border: `1px solid ${HIVE_UI.borderDeep}`,
                    borderRadius: 14,
                    padding: 14,
                    maxHeight: 560,
                    overflowY: "auto",
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: "#cad2dc",
                    whiteSpace: "pre-wrap",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
                  }}
                >
                  {(fullState?.logs || []).length
                    ? (fullState.logs as string[]).join("\n")
                    : "No bee activity yet"}
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
function OrbitHive({
  cards,
  autoRefresh,
  running,
}: {
  cards: { label: string; value: any; featured?: boolean }[];
  autoRefresh: boolean;
  running: boolean;
}) {
  const cx = 420;
  const cy = 430;
  const cardW = 136;
  const cardH = 114;
  const radius = 320;
  const orbitH = 860;

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
            borderRadius: 18,
            background:
              "radial-gradient(circle at 50% 46%, rgba(199,154,49,0.04), rgba(255,255,255,0.01) 18%, rgba(0,0,0,0) 62%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.06,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage:
              "radial-gradient(circle at 50% 43%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 28%, rgba(0,0,0,0.45) 52%, rgba(0,0,0,0) 74%)",
            WebkitMaskImage:
              "radial-gradient(circle at 50% 43%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 28%, rgba(0,0,0,0.45) 52%, rgba(0,0,0,0) 74%)",
          }}
        />

        <svg
          viewBox={`0 0 840 ${orbitH}`}
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0, opacity: 0.75 }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={radius + 4}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            strokeDasharray="6 12"
          />
          <circle
            cx={cx}
            cy={cy}
            r={radius - 84}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
            strokeDasharray="4 12"
          />
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
            <HoneyHex
              label={card.label}
              value={formatVal(card.value)}
              featured={!!card.featured}
            />
          </div>
        ))}

        <div
          style={{
            position: "absolute",
            left: cx - 118,
            top: cy - 118,
            width: 236,
            height: 236,
            zIndex: 2,
            opacity: 0.34,
            filter: "saturate(0.55) brightness(0.78)",
            pointerEvents: "none",
          }}
          aria-hidden="true"
        >
          <MechanicalHive active={running} fieldBackdrop />
        </div>

        {autoRefresh ? (
          <>
            <OrbitBee size={34} cx={cx} cy={cy} radius={174} duration="7.6s" delay="0s" />
            <OrbitBee size={28} cx={cx} cy={cy} radius={208} duration="8.9s" delay="-1.2s" />
            <OrbitBee size={30} cx={cx} cy={cy} radius={242} duration="10.1s" delay="-2.1s" />
            <OrbitBee size={26} cx={cx} cy={cy} radius={274} duration="6.8s" delay="-0.7s" />
            <OrbitBee size={24} cx={cx} cy={cy} radius={192} duration="11.2s" delay="-3.2s" />
          </>
        ) : null}
      </div>

      <div className="orbit-mobile" style={{ display: "none" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <div
            style={{
              width: 200,
              height: 200,
              opacity: 0.34,
              filter: "saturate(0.55) brightness(0.78)",
            }}
            aria-hidden="true"
          >
            <MechanicalHive active={running} fieldBackdrop />
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(136px, 136px))",
            gap: 12,
            justifyContent: "center",
          }}
        >
          {cards.map((card) => (
            <HoneyHex
              key={card.label}
              label={card.label}
              value={formatVal(card.value)}
              featured={!!card.featured}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 920px) {
          .orbit-desktop {
            display: none;
          }
          .orbit-mobile {
            display: block !important;
          }
        }
        @keyframes orbitSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes beeBob {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-4px);
          }
          100% {
            transform: translateY(0px);
          }
        }
      `}</style>
    </>
  );
}

function MechanicalHive({
  active = false,
  fieldBackdrop = false,
}: {
  active?: boolean;
  /** Smaller, cooler schematic when the photographic hero is primary */
  fieldBackdrop?: boolean;
}) {
  const rid = useId().replace(/:/g, "");
  const gOuter = `hive-om-${rid}`;
  const gInner = `hive-is-${rid}`;
  const gGlow = `hive-eg-${rid}`;
  if (fieldBackdrop) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          minHeight: 120,
          transform: active ? "scale(1.02)" : "scale(1)",
          transition: HIVE_UI.motion,
        }}
      >
        <svg viewBox="0 0 300 300" width="100%" height="100%" aria-hidden="true">
          <defs>
            <radialGradient id={gGlow} cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor={HIVE_UI.accent} stopOpacity="0.35" />
              <stop offset="55%" stopColor={HIVE_UI.accent} stopOpacity="0.08" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle
            cx="150"
            cy="150"
            r="118"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
            strokeDasharray="5 14"
          />
          <circle
            cx="150"
            cy="150"
            r="78"
            fill="none"
            stroke="rgba(199,154,49,0.22)"
            strokeWidth="1"
            strokeDasharray="3 10"
          />
          <circle cx="150" cy="150" r="46" fill={`url(#${gGlow})`} opacity="0.85" />
          <circle
            cx="150"
            cy="150"
            r="22"
            fill="#06080c"
            stroke={HIVE_UI.accent}
            strokeWidth="1.4"
            opacity="0.95"
          />
          <circle cx="150" cy="150" r="6" fill="#020203" opacity="0.9" />
        </svg>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 220,
        transform: active ? "scale(1.01)" : "scale(1)",
        filter: active ? "brightness(1.07)" : "none",
        transition: HIVE_UI.motion,
      }}
    >
      <svg viewBox="0 0 300 340" width="100%" height="100%" aria-hidden="true">
        <defs>
          <linearGradient id={gOuter} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9aa3ad" />
            <stop offset="45%" stopColor="#3a4048" />
            <stop offset="100%" stopColor="#161a1f" />
          </linearGradient>
          <linearGradient id={gInner} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2e2c2a" />
            <stop offset="50%" stopColor="#1a1918" />
            <stop offset="100%" stopColor="#0c0b0a" />
          </linearGradient>
          <radialGradient id={gGlow} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor={HIVE_UI.accent} stopOpacity="0.22" />
            <stop offset="50%" stopColor={HIVE_UI.accent} stopOpacity="0.06" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="150" cy="312" rx="82" ry="12" fill="rgba(0,0,0,0.35)" />
        <HiveBand gidOuter={gOuter} gidInner={gInner} cx={150} cy={82} rx={52} ry={24} innerRx={40} innerRy={16} />
        <HiveBand gidOuter={gOuter} gidInner={gInner} cx={150} cy={120} rx={76} ry={30} innerRx={60} innerRy={20} />
        <HiveBand gidOuter={gOuter} gidInner={gInner} cx={150} cy={166} rx={92} ry={36} innerRx={74} innerRy={24} />
        <HiveBand gidOuter={gOuter} gidInner={gInner} cx={150} cy={214} rx={78} ry={30} innerRx={61} innerRy={20} />
        <HiveBand gidOuter={gOuter} gidInner={gInner} cx={150} cy={252} rx={54} ry={22} innerRx={42} innerRy={14} />

        <g opacity="0.4">
          <path d="M100 82 Q150 68 200 82" fill="none" stroke="#2a2d32" strokeWidth="2.5" />
          <path d="M76 120 Q150 100 224 120" fill="none" stroke="#2a2d32" strokeWidth="2.5" />
          <path d="M58 166 Q150 140 242 166" fill="none" stroke="#2a2d32" strokeWidth="2.5" />
          <path d="M72 214 Q150 194 228 214" fill="none" stroke="#2a2d32" strokeWidth="2.5" />
          <path d="M96 252 Q150 238 204 252" fill="none" stroke="#2a2d32" strokeWidth="2.5" />
        </g>

        <g>
          <ellipse cx="150" cy="226" rx="34" ry="18" fill={`url(#${gGlow})`} opacity="0.9" />
          <ellipse cx="150" cy="226" rx="24" ry="14" fill="#08090a" stroke={HIVE_UI.accent} strokeWidth="1.8" />
          <ellipse cx="150" cy="226" rx="10" ry="6" fill="#020203" />
        </g>

        <g>
          <HiveVentCluster x={116} y={165} />
          <HiveVentCluster x={150} y={152} />
          <HiveVentCluster x={184} y={165} />
        </g>
      </svg>
    </div>
  );
}

function HiveBand({
  gidOuter,
  gidInner,
  cx,
  cy,
  rx,
  ry,
  innerRx,
  innerRy,
}: {
  gidOuter: string;
  gidInner: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  innerRx: number;
  innerRy: number;
}) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${gidOuter})`} stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
      <ellipse cx={cx} cy={cy} rx={innerRx} ry={innerRy} fill={`url(#${gidInner})`} stroke="#141312" strokeWidth="1.2" />
      <ellipse
        cx={cx}
        cy={cy + 2}
        rx={Math.max(innerRx - 10, 8)}
        ry={Math.max(innerRy - 5, 6)}
        fill="#050506"
        opacity="0.55"
      />
      <HiveBolt x={cx - rx * 0.62} y={cy} />
      <HiveBolt x={cx + rx * 0.62} y={cy} />
      <HiveBolt x={cx} y={cy - ry * 0.68} />
    </g>
  );
}

function HiveVentCluster({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <HiveHexVent x={x} y={y} />
      <HiveHexVent x={x + 14} y={y + 8} small />
      <HiveHexVent x={x - 14} y={y + 8} small />
    </g>
  );
}

function HiveHexVent({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
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

  return (
    <polygon
      points={points}
      fill="#080809"
      stroke="rgba(199,154,49,0.45)"
      strokeWidth={small ? 1.2 : 1.5}
    />
  );
}

function HiveBolt({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="5" fill="#14181c" stroke="#9aa3ad" strokeWidth="1.4" />
      <circle cx={x} cy={y} r="1.6" fill="#7a828a" />
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
      <div
        style={{
          transform: `translateX(${radius}px)`,
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          animation: "beeBob 1.2s ease-in-out infinite",
        }}
      >
        <RobotBee />
      </div>
    </div>
  );
}

function RobotBee() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <ellipse
        cx="34"
        cy="30"
        rx="16"
        ry="9"
        fill="rgba(226,233,241,0.75)"
        stroke="#57616c"
        strokeWidth="3"
      />
      <ellipse
        cx="66"
        cy="30"
        rx="16"
        ry="9"
        fill="rgba(226,233,241,0.75)"
        stroke="#57616c"
        strokeWidth="3"
      />
      <circle cx="50" cy="42" r="12" fill="#97a3af" stroke="#1c2128" strokeWidth="5" />
      <rect
        x="29"
        y="46"
        width="42"
        height="28"
        rx="14"
        fill="#232933"
        stroke="#171b21"
        strokeWidth="5"
      />
      <line x1="37" y1="54" x2="63" y2="54" stroke="#11151a" strokeWidth="6" />
      <line x1="40" y1="64" x2="60" y2="64" stroke="#11151a" strokeWidth="6" />
      <circle cx="45" cy="40" r="2.6" fill="#d49b2c" />
      <circle cx="55" cy="40" r="2.6" fill="#d49b2c" />
      <path d="M42 28 L34 18" stroke="#a8b3bf" strokeWidth="4" strokeLinecap="round" />
      <path d="M58 28 L66 18" stroke="#a8b3bf" strokeWidth="4" strokeLinecap="round" />
      <circle cx="33" cy="17" r="3" fill="#c79a31" />
      <circle cx="67" cy="17" r="3" fill="#c79a31" />
    </svg>
  );
}

function MetricKicker({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        minWidth: 84,
        border: `1px solid ${accent ? HIVE_UI.accentLine : HIVE_UI.border}`,
        borderRadius: 12,
        padding: "8px 10px",
        background: accent
          ? "linear-gradient(180deg, rgba(199,154,49,0.12), rgba(199,154,49,0.05))"
          : "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: HIVE_UI.textMuted,
          textTransform: "uppercase",
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: accent ? "#f1deb0" : HIVE_UI.text,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RailRow({
  label,
  value,
  accent = false,
  muted = false,
  danger = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "flex-start",
        padding: "10px 0",
        borderBottom: `1px solid ${HIVE_UI.borderDeep}`,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: muted ? HIVE_UI.textDim : HIVE_UI.textMuted,
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          textAlign: "right",
          color: danger
            ? "#ffcdcd"
            : accent
              ? "#efd59a"
              : muted
                ? HIVE_UI.textSoft
                : HIVE_UI.text,
        }}
      >
        {value}
      </div>
    </div>
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
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.03em",
    transition: HIVE_UI.motion,
  };

  if (tone === "promoted" && active) {
    return (
      <div
        style={{
          ...base,
          background: HIVE_UI.goodSoft,
          border: `1px solid ${HIVE_UI.good}`,
          color: "#dcffe3",
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
          background: HIVE_UI.dangerSoft,
          border: `1px solid ${HIVE_UI.danger}`,
          color: "#ffd8d8",
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
          background: "rgba(199,154,49,0.08)",
          border: `1px solid ${HIVE_UI.accentLine}`,
          color: "#e8d6a6",
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
        background: active ? HIVE_UI.goodSoft : "rgba(255,255,255,0.03)",
        border: active ? `1px solid ${HIVE_UI.good}` : `1px solid ${HIVE_UI.border}`,
        color: active ? "#dcffe3" : HIVE_UI.textSoft,
      }}
    >
      {text}
    </div>
  );
}

function HiveButton({
  onClick,
  label,
  active = false,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  const restShadow = "inset 0 1px 0 rgba(255,255,255,0.03)";
  const activeShadow = `inset 0 0 0 1px ${HIVE_UI.accentLine}`;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active
          ? "linear-gradient(180deg, rgba(199,154,49,0.16), rgba(199,154,49,0.08))"
          : "linear-gradient(180deg, #11151b, #0c0f14)",
        color: active ? "#f1deb0" : HIVE_UI.textSoft,
        border: active ? `1px solid ${HIVE_UI.accentLine}` : `1px solid ${HIVE_UI.border}`,
        borderRadius: 12,
        padding: "11px 14px",
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
        boxShadow: active ? activeShadow : restShadow,
        cursor: "pointer",
        transition: HIVE_UI.motion,
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.filter = "brightness(0.9)";
        e.currentTarget.style.transform = "translateY(1px) scale(0.99)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.filter = "brightness(1)";
        e.currentTarget.style.transform = "translateY(0) scale(1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = "brightness(1)";
        e.currentTarget.style.transform = "translateY(0) scale(1)";
      }}
      onTouchStart={(e) => {
        e.currentTarget.style.filter = "brightness(0.9)";
        e.currentTarget.style.transform = "translateY(1px) scale(0.99)";
      }}
      onTouchEnd={(e) => {
        e.currentTarget.style.filter = "brightness(1)";
        e.currentTarget.style.transform = "translateY(0) scale(1)";
      }}
    >
      {label}
    </button>
  );
}

function HoneyHex({
  label,
  value,
  featured = false,
}: {
  label: string;
  value: string;
  featured?: boolean;
}) {
  return (
    <div style={{ width: 136, height: 114 }}>
      <div
        style={{
          width: 136,
          height: 114,
          clipPath:
            "polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)",
          background: featured
            ? "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))"
            : "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
          border: featured
            ? `1px solid ${HIVE_UI.accentLine}`
            : `1px solid ${HIVE_UI.borderDeep}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 12,
          transition: HIVE_UI.motion,
          boxShadow: featured
            ? "0 0 0 1px rgba(199,154,49,0.06)"
            : "none",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: featured ? "#bca56c" : HIVE_UI.textMuted,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              marginBottom: 8,
              fontWeight: 700,
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: featured ? 24 : 20,
              fontWeight: 800,
              color: featured ? HIVE_UI.text : HIVE_UI.textSoft,
            }}
          >
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01)), linear-gradient(180deg, #0b0e13, #090b10)",
        border: `1px solid ${HIVE_UI.border}`,
        borderRadius: 18,
        padding: 16,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.03), 0 12px 34px rgba(0,0,0,0.22)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: subtitle ? 12 : 10,
        }}
      >
        <h2
          style={{
            margin: 0,
            color: HIVE_UI.text,
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </h2>
        {subtitle ? (
          <div
            style={{
              fontSize: 10,
              color: HIVE_UI.textMuted,
              letterSpacing: "0.12em",
              lineHeight: 1.45,
              textTransform: "uppercase",
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function PanelSection({
  title,
  children,
  isFirst,
}: {
  title: string;
  children: React.ReactNode;
  isFirst?: boolean;
}) {
  return (
    <div style={{ marginTop: isFirst ? 0 : 14 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          fontWeight: 800,
          color: HIVE_UI.textMuted,
          textTransform: "uppercase",
          marginBottom: 10,
          borderBottom: `1px solid ${HIVE_UI.border}`,
          paddingBottom: 8,
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
  const valueColor = muted
    ? HIVE_UI.textMuted
    : emphasized
      ? "#efcf84"
      : HIVE_UI.text;
  const fontSize = emphasized && !muted ? 18 : muted ? 15 : 16;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 14,
        padding: "10px 0",
        borderBottom: `1px solid ${HIVE_UI.borderDeep}`,
      }}
    >
      <div style={{ color: muted ? HIVE_UI.textDim : HIVE_UI.textMuted }}>{label}</div>
      <div
        style={{
          color: valueColor,
          fontWeight: 800,
          textAlign: "right",
          fontSize,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatVal(value: any) {
  if (value === null || value === undefined) return "-";
  return String(value);
}