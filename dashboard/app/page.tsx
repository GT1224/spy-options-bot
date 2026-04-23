"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

/** Same-origin BFF — admin key never in the browser (H2). */
const HIVE_API = "/api/hive";

type PillTone = "neutral" | "promoted" | "hold" | "suppressed";

/** POST /paper/order + hive_contract_v1.system_state.manual_paper_last_broker_snapshot */
type PaperOrderObservability = {
  order_id?: string | null;
  client_order_id?: string | null;
  symbol?: string | null;
  side?: string | null;
  order_type?: string | null;
  broker_status?: string | null;
  prior_broker_status?: string | null;
  hive_lifecycle_label?: string | null;
  qty?: number | null;
  filled_qty?: number | null;
  filled_avg_price?: number | null;
  submitted_at?: string | null;
  filled_at?: string | null;
  canceled_at?: string | null;
  expired_at?: string | null;
  snapshot_freshness?: string | null;
  truth_note?: string | null;
};

function formatHiveObsTime(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso.length > 24 ? `${iso.slice(0, 24)}…` : iso;
  try {
    return new Date(t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

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
  font: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontLog:
    'ui-monospace, "Cascadia Mono", "SF Mono", Consolas, "Liberation Mono", monospace',
  motion:
    "background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease, transform 160ms ease, filter 160ms ease, color 160ms ease",
} as const;

export default function Page() {
  const [health, setHealth] = useState<any>(null);
  const [fullState, setFullState] = useState<any>(null);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [paperSide, setPaperSide] = useState<"buy" | "sell">("buy");
  const [paperQty, setPaperQty] = useState<string>("1");
  const [paperOrderType, setPaperOrderType] = useState<"market" | "limit">("market");
  const [paperLimit, setPaperLimit] = useState<string>("");
  const [paperCid, setPaperCid] = useState<string>("");
  const [paperOrderHint, setPaperOrderHint] = useState<string | null>(null);
  const [paperOrderObs, setPaperOrderObs] = useState<PaperOrderObservability | null>(null);

  async function apiCall(path: string, method = "GET", body?: any) {
    const res = await fetch(`${HIVE_API}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
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
      const healthRes = await fetch(`${HIVE_API}/health`);
      let healthData: unknown = null;
      try {
        healthData = await healthRes.json();
      } catch {
        healthData = null;
      }
      const healthOk = healthRes.ok;
      const stateData = await apiCall("/state");
      // Do not treat a failed health probe body as authoritative runtime truth (avoids false "idle").
      setHealth(healthOk && healthData && typeof healthData === "object" ? healthData : null);
      setFullState(stateData);
    } catch (err: any) {
      const msg = err?.message || "Could not connect to backend";
      const looksNetwork =
        /failed to fetch|networkerror|load failed|fetch|econnrefused|connection refused/i.test(
          String(msg)
        );
      setError(
        looksNetwork
          ? `${msg} — ensure FastAPI is running and dashboard/.env.local sets HIVE_API_ORIGIN (e.g. http://127.0.0.1:8000) and BOT_ADMIN_KEY (min 32 chars, match backend); restart next dev.`
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

  async function enablePaperBroker() {
    try {
      setError("");
      await apiCall("/config", "POST", { alpaca_paper_enabled: true });
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Paper on failed");
      await loadAll();
    }
  }

  async function disablePaperBroker() {
    try {
      setError("");
      await apiCall("/config", "POST", { alpaca_paper_enabled: false });
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Paper off failed");
      await loadAll();
    }
  }

  async function syncBroker() {
    try {
      setError("");
      await apiCall("/paper/sync", "POST");
      await loadAll();
    } catch (err: any) {
      const msg = err?.message || "Broker sync failed";
      setError(msg);
      await loadAll();
    }
  }

  async function syncLiveRead() {
    try {
      setError("");
      const data = (await apiCall("/live/sync", "POST")) as {
        ok?: boolean;
        error?: string;
        blocker?: string | null;
        live_readiness?: { operator_hint?: string; summary_code?: string };
      };
      if (data.ok === false && data.blocker === "live_broker_request_failed") {
        setError(typeof data.error === "string" ? data.error : "Live broker read failed");
      }
      await loadAll();
    } catch (err: any) {
      const msg = err?.message || "Live read sync failed";
      setError(msg);
      await loadAll();
    }
  }

  function genPaperCid() {
    const raw =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, "")
        : `${Date.now()}${Math.random().toString(16).slice(2, 12)}`;
    setPaperCid(`h${raw}`.slice(0, 48));
  }

  async function submitPaperOrder() {
    setPaperOrderHint(null);
    const qty = parseInt(paperQty, 10);
    if (!Number.isFinite(qty) || qty < 1) {
      setError("Paper order: qty must be a positive integer");
      return;
    }
    const body: Record<string, unknown> = {
      symbol: "SPY",
      side: paperSide,
      qty,
      order_type: paperOrderType,
      client_order_id: paperCid.trim(),
    };
    if (paperOrderType === "limit") {
      const lp = parseFloat(paperLimit);
      if (!Number.isFinite(lp) || lp <= 0) {
        setError("Paper order: limit_price must be a positive number");
        return;
      }
      body.limit_price = lp;
    }
    try {
      setError("");
      const data = (await apiCall("/paper/order", "POST", body)) as {
        ok?: boolean;
        message?: string;
        order_id?: string;
        reason?: string;
        session_label?: string;
        paper_order_observability?: PaperOrderObservability | null;
      };
      if (data?.ok && data?.message) {
        const oid = data.order_id ? String(data.order_id).slice(0, 12) : "—";
        setPaperOrderHint(`${data.message} (ref ${oid})`);
      }
      if (data?.paper_order_observability && typeof data.paper_order_observability === "object") {
        setPaperOrderObs(data.paper_order_observability);
      }
      await loadAll();
    } catch (err: any) {
      const raw = String(err?.message || "Paper order failed");
      let msg = raw;
      if (raw.startsWith("400 ")) {
        try {
          const j = JSON.parse(raw.slice(4).trim()) as {
            error?: string;
            reason?: string;
            session_label?: string;
          };
          if (typeof j.error === "string") {
            msg = j.error;
            if (j.reason === "outside_regular_trading_hours" && j.session_label) {
              msg += ` — session: ${j.session_label}`;
            }
          }
        } catch {
          /* keep raw */
        }
      }
      setError(msg);
      await loadAll();
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => loadAll(), 5000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  useEffect(() => {
    const sys = fullState?.hive_contract_v1?.system_state;
    if (!sys || typeof sys !== "object") return;
    if (!("manual_paper_last_broker_snapshot" in sys)) return;
    const s = sys.manual_paper_last_broker_snapshot;
    if (s && typeof s === "object" && !Array.isArray(s)) {
      setPaperOrderObs(s as PaperOrderObservability);
    } else {
      setPaperOrderObs(null);
    }
  }, [fullState?.hive_contract_v1?.system_state]);

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
  const paperMarketBlockedOffRth =
    paperOrderType === "market" &&
    typeof regime?.market_hours === "boolean" &&
    !regime.market_hours;
  const execSurface = system?.execution_surface as string | undefined;
  const brokerSync = system?.broker_sync;
  const surfacePillText =
    execSurface === "signal_only"
      ? "Surface: signal-only (no broker)"
      : execSurface === "alpaca_paper"
        ? "Surface: Alpaca paper (synced)"
        : execSurface === "alpaca_paper_degraded"
          ? "Surface: Alpaca paper (degraded)"
          : execSurface
            ? `Surface: ${execSurface}`
            : "Surface: —";

  const treasurySource =
    brokerSync?.performance_source === "alpaca_paper"
      ? "Alpaca paper (read-only sync)"
      : "Demo seed (not broker-backed)";
  const brokerStale =
    execSurface === "alpaca_paper_degraded" || !!brokerSync?.stale;

  const paperBrokerEnabled = !!fullState?.config?.alpaca_paper_enabled;
  const paperBrokerPillText = !paperBrokerEnabled
    ? "Paper broker: off (signal-only)"
    : execSurface === "alpaca_paper"
      ? "Paper broker: connected"
      : execSurface === "alpaca_paper_degraded"
        ? "Paper broker: on · sync degraded"
        : "Paper broker: on · keys missing on API host";
  const paperBrokerPillActive = paperBrokerEnabled && execSurface === "alpaca_paper";

  const liveRead = (system?.live_readiness ?? fullState?.live_readiness) as
    | {
        summary_code?: string;
        credentials_present?: boolean;
        submit_armed?: boolean;
        live_broker_last_sync_ok?: boolean;
        operator_hint?: string;
      }
    | undefined;
  const liveReadSummary = liveRead?.summary_code;
  const liveLanePillText =
    liveReadSummary === "missing_credentials"
      ? "Live lane: BLOCKED (no live keys)"
      : liveReadSummary === "live_read_ready"
        ? "Live lane: read OK"
        : liveReadSummary === "live_sync_failed"
          ? "Live lane: read DEGRADED"
          : liveReadSummary === "live_credentials_ok_not_synced"
            ? "Live lane: keys OK · sync pending"
            : "Live lane: —";
  const liveLanePillTone: PillTone =
    liveReadSummary === "missing_credentials"
      ? "hold"
      : liveReadSummary === "live_read_ready"
        ? "promoted"
        : liveReadSummary === "live_sync_failed"
          ? "suppressed"
          : liveReadSummary === "live_credentials_ok_not_synced"
            ? "neutral"
            : "neutral";

  const signal = top?.setup ?? fullState?.signal_snapshot ?? {};
  const recommended = top?.recommended_trade ?? signal?.recommended_trade ?? {};
  const swarmFromContract =
    system?.bot_running !== undefined && system?.bot_running !== null
      ? !!system.bot_running
      : undefined;
  const swarmFromHealth =
    health && typeof health === "object" && "running" in health && health.running !== undefined && health.running !== null
      ? !!health.running
      : undefined;
  const swarmKnown = swarmFromContract !== undefined || swarmFromHealth !== undefined;
  const running = swarmKnown ? !!(swarmFromContract ?? swarmFromHealth) : null;
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
[data-hive-dashboard] {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: "kern" 1, "liga" 1;
}
[data-hive-dashboard] button:focus-visible {
  outline: 2px solid ${HIVE_UI.accent};
  outline-offset: 2px;
}
.hive-topbar-chips {
  row-gap: 5px;
  column-gap: 5px;
}
.hive-stage-header-pills {
  row-gap: 5px;
  column-gap: 6px;
}
.hive-bee-log-inner {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.008), rgba(0,0,0,0.05)),
    #07090c;
  border: 1px solid ${HIVE_UI.borderDeep};
  border-radius: 10px;
  padding: 11px 12px;
  max-height: 560px;
  overflow-y: auto;
  font-family: ${HIVE_UI.fontLog};
  font-size: 12px;
  line-height: 1.55;
  color: ${HIVE_UI.textSoft};
  white-space: pre-wrap;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.015);
}
.hive-shell {
  max-width: 1540px;
  margin: 0 auto;
  position: relative;
}
.hive-topbar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 14px;
  border: 1px solid ${HIVE_UI.border};
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.022), rgba(255,255,255,0.006)),
    linear-gradient(180deg, #090c11, #080a0e);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.032),
    0 12px 40px rgba(0,0,0,0.38);
}
.hive-topbar-left {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}
.hive-topbar-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.hive-topbar-kickers {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}
.hive-hero-theater {
  position: relative;
  margin-top: 14px;
  min-height: min(48vh, 500px);
  max-height: 528px;
  border-radius: 20px;
  border: 1px solid ${HIVE_UI.borderStrong};
  overflow: hidden;
  background: #010101;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.032),
    0 28px 82px rgba(0,0,0,0.55);
}
.hive-hero-theater::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.36) 22%, rgba(0,0,0,0.52) 55%, rgba(0,0,0,0.94) 100%),
    radial-gradient(ellipse 82% 68% at 50% 42%, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.52) 46%, rgba(0,0,0,0.98) 100%),
    linear-gradient(118deg, rgba(5,5,6,0.68) 0%, rgba(0,0,0,0) 46%, rgba(8,6,4,0.36) 100%),
    radial-gradient(ellipse 120% 80% at 78% 18%, rgba(199,154,49,0.065) 0%, rgba(0,0,0,0) 42%);
  border-bottom: 1px solid rgba(255,255,255,0.07);
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
  filter: saturate(0.88) brightness(0.835) contrast(1.16) hue-rotate(-10deg);
}
.hive-hero-theater::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.06),
    inset 0 0 90px rgba(0,0,0,0.28),
    inset 0 0 200px rgba(0,0,0,0.38);
  border-radius: 20px;
}
.hive-hero-chrome-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 5;
  background: linear-gradient(90deg, transparent 6%, ${HIVE_UI.accentLine} 50%, transparent 94%);
  opacity: 0.94;
  box-shadow: 0 1px 0 rgba(0,0,0,0.45);
}
.hive-hero-caption {
  padding: 11px 16px 13px 14px;
  border-radius: 0 16px 0 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.12));
  border-left: 2px solid rgba(199,154,49,0.48);
  box-shadow: 0 18px 48px rgba(0,0,0,0.48);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.hive-stage-shell {
  position: relative;
  margin-top: 7px;
  border: 1px solid ${HIVE_UI.borderStrong};
  border-radius: 20px;
  background:
    ${HIVE_UI.stageGlow},
    linear-gradient(180deg, rgba(255,255,255,0.014), rgba(255,255,255,0.002)),
    linear-gradient(180deg, #05070b 0%, #020304 100%);
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.028),
    0 20px 56px rgba(0,0,0,0.52);
}
.hive-stage-shell::after {
  content: "";
  position: absolute;
  top: 0;
  left: 8%;
  right: 8%;
  height: 1px;
  z-index: 3;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(199,154,49,0.22), transparent);
  opacity: 0.9;
}
.hive-stage-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    linear-gradient(90deg, rgba(255,255,255,0.024), rgba(255,255,255,0) 16%, rgba(255,255,255,0) 84%, rgba(255,255,255,0.017)),
    linear-gradient(180deg, rgba(255,255,255,0.012), rgba(255,255,255,0));
  pointer-events: none;
}
.hive-stage-header {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: end;
  padding: 13px 17px 0;
}
.hive-stage-body {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(200px, 244px) minmax(0, 1fr);
  gap: 12px;
  padding: 12px 13px 14px;
  align-items: stretch;
}
.hive-tactical-deck {
  min-width: 0;
  border: 1px solid ${HIVE_UI.border};
  border-left: 2px solid rgba(199,154,49,0.38);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.028), rgba(255,255,255,0.005)),
    linear-gradient(180deg, #0b0e14, #07090d);
  padding: 12px 14px 14px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.038),
    0 8px 32px rgba(0,0,0,0.32);
}
.hive-deck-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 11px;
}
.hive-deck-mini-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.hive-signal-grid--tight {
  gap: 10px;
}
@media (max-width: 1100px) {
  .hive-deck-grid-2 {
    grid-template-columns: 1fr;
  }
  .hive-deck-mini-row {
    grid-template-columns: 1fr;
  }
}
.hive-side-rail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hive-rail-card {
  border: 1px solid ${HIVE_UI.borderDeep};
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(255,255,255,0.022), rgba(255,255,255,0.008));
  padding: 11px 12px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.018);
}
.hive-rail-title {
  margin: 0 0 7px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: ${HIVE_UI.textDim};
}
.hive-command-rail {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 6px;
  padding: 8px 10px;
  border: 1px solid ${HIVE_UI.border};
  border-radius: 12px;
  background: linear-gradient(180deg, #080b10, #06080c);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
}
.hive-lower-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1.05fr 1.2fr;
  gap: 12px;
}
.hive-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
    row-gap: 8px;
  }
  .hive-topbar-chips {
    row-gap: 6px;
    width: 100%;
  }
  .hive-topbar-kickers {
    justify-content: flex-start;
    width: 100%;
  }
  .hive-stage-header {
    grid-template-columns: 1fr;
  }
  .hive-stage-header-pills {
    justify-content: flex-start;
    width: 100%;
  }
  .hive-command-rail {
    row-gap: 6px;
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
@media (max-width: 520px) {
  .hive-topbar-chips {
    column-gap: 4px;
  }
  .hive-stage-header-pills {
    column-gap: 5px;
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
          padding: "14px 15px 26px",
        }}
      >
        <div className="hive-shell">
          <header className="hive-topbar">
            <div className="hive-topbar-left">
              <div
                style={{
                  width: 48,
                  height: 48,
                  position: "relative",
                  borderRadius: 12,
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
                    fontSize: 9,
                    letterSpacing: "0.26em",
                    fontWeight: 800,
                    color: HIVE_UI.textDim,
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
                      fontSize: 24,
                      lineHeight: 1,
                      fontWeight: 800,
                      letterSpacing: "0.2em",
                      color: HIVE_UI.text,
                    }}
                  >
                    HIVE
                  </h1>
                  <span
                    style={{
                      fontSize: 11,
                      color: HIVE_UI.textMuted,
                      letterSpacing: "0.07em",
                      lineHeight: 1.35,
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
                className="hive-topbar-chips"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <StatusPill
                  dense
                  text={
                    running === null
                      ? "Swarm: unknown (health/state mismatch)"
                      : running
                        ? "Swarm Active"
                        : "Swarm Idle"
                  }
                  active={running === true}
                />
                <StatusPill dense text={`Trading ${tradingEnabled ? "Armed" : "Safe"}`} />
                <StatusPill dense text={paperBrokerPillText} active={paperBrokerPillActive} />
                <StatusPill dense text={liveLanePillText} tone={liveLanePillTone} />
                <StatusPill dense text={surfacePillText} />
                <StatusPill dense text={gatePillText} tone={gatePillTone} active={gatePromoted} />
                <StatusPill
                  dense
                  text={
                    guard?.status
                      ? `Guard: ${guard.status}${guard.actionable ? " · act" : " · hold"}`
                      : "Guard: —"
                  }
                  tone={guardTone}
                  active={guardPillActive}
                />
                <StatusPill
                  dense
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

          {liveRead && typeof liveRead.operator_hint === "string" && liveRead.operator_hint.length ? (
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                borderRadius: 14,
                border: `1px solid ${
                  liveReadSummary === "live_sync_failed" ? HIVE_UI.danger : HIVE_UI.border
                }`,
                background:
                  liveReadSummary === "live_sync_failed"
                    ? "linear-gradient(180deg, rgba(217,107,107,0.12), rgba(217,107,107,0.06))"
                    : HIVE_UI.panel,
                maxWidth: 900,
                fontSize: 11,
                color: liveReadSummary === "live_sync_failed" ? "#ffe8e8" : HIVE_UI.textSoft,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: HIVE_UI.textMuted, letterSpacing: "0.12em", fontSize: 9 }}>
                LIVE OPERATOR
              </strong>
              <div style={{ marginTop: 6 }}>{liveRead.operator_hint}</div>
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
                    fontSize: 9,
                    letterSpacing: "0.26em",
                    fontWeight: 800,
                    color: HIVE_UI.textDim,
                    textTransform: "uppercase",
                    marginBottom: 5,
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
                      fontSize: 28,
                      lineHeight: 1.02,
                      fontWeight: 800,
                      letterSpacing: "0.12em",
                      color: HIVE_UI.text,
                      textRendering: "geometricPrecision",
                    }}
                  >
                    LIVE TACTICAL FIELD
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.28em",
                      fontWeight: 800,
                      color: HIVE_UI.accent,
                    }}
                  >
                    OPERATOR DECK
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: HIVE_UI.textMuted,
                      letterSpacing: "0.04em",
                      maxWidth: 520,
                      lineHeight: 1.35,
                      marginTop: 4,
                    }}
                  >
                    Pulse uses in-process mock tape unless a market-feed lane exists; Alpaca paper
                    sync does not change spot.
                  </div>
                </div>
              </div>

              <div
                className="hive-stage-header-pills"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <StatusPill dense text={`Session ${regime?.code ? String(regime.code) : "—"}`} />
                <StatusPill
                  dense
                  text={`RTH ${regime?.market_hours ? "on" : "off"}`}
                  active={!!regime?.market_hours}
                />
                <StatusPill
                  dense
                  text={
                    system?.signal_age_seconds !== undefined &&
                    system?.signal_age_seconds !== null
                      ? `Pulse age ${system.signal_age_seconds}s${system?.signal_stale ? " · stale" : ""}`
                      : system?.signal_stale
                        ? "Pulse age — · stale"
                        : "Pulse age —"
                  }
                />
              </div>
            </div>

            <div className="hive-stage-body">
              <div className="hive-side-rail">
                {brokerStale ? (
                  <div
                    style={{
                      marginBottom: 10,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: `1px solid ${HIVE_UI.danger}`,
                      background: HIVE_UI.dangerSoft,
                      color: HIVE_UI.textSoft,
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    <strong style={{ color: HIVE_UI.danger }}>Broker snapshot stale or sync failed.</strong>{" "}
                    Treasury may show last-good Alpaca paper values or demo seed.{" "}
                    {typeof brokerSync?.error === "string" && brokerSync.error.length
                      ? `Last error: ${brokerSync.error.length > 120 ? `${brokerSync.error.slice(0, 120)}…` : brokerSync.error}`
                      : null}
                  </div>
                ) : null}
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
                          )} — Alpaca open orders (all symbols; not fills or positions)`
                        : formatVal(system?.pending_signals_count ?? "—")
                    }
                  />
                  <RailRow
                    label="Provider"
                    value={formatVal(
                      system?.provider_mode ?? fullState?.provider_mode ?? health?.provider
                    )}
                    muted
                  />
                </div>

                <div className="hive-rail-card">
                  <h3 className="hive-rail-title">Treasury</h3>
                  <RailRow label="Source" value={treasurySource} muted />
                  <RailRow label="Cash" value={formatVal(perf?.cash ?? fullState?.cash)} />
                  <RailRow
                    label="Equity"
                    value={formatVal(perf?.equity ?? fullState?.equity)}
                  />
                  <RailRow
                    label="Daily P&L (HIVE internal)"
                    value={formatVal(
                      perf?.realized_pnl_today ?? fullState?.realized_pnl_today
                    )}
                    accent
                  />
                  <RailRow
                    label="Loss streak (HIVE internal)"
                    value={formatVal(
                      perf?.consecutive_losses ?? fullState?.consecutive_losses
                    )}
                  />
                  {perf?.unrealized_pnl != null ? (
                    <RailRow label="Unrealized" value={formatVal(perf.unrealized_pnl)} muted />
                  ) : null}
                </div>
              </div>

              <div className="hive-tactical-deck">
                <TacticalFieldDeck
                  running={running === true}
                  swarmRunningKnown={swarmKnown}
                  tradingEnabled={tradingEnabled}
                  system={system}
                  signal={signal}
                  top={top}
                  recommended={recommended}
                  guard={guard}
                  promo={promo}
                  cq={cq}
                  edge={edge}
                  delta={delta}
                  regime={regime}
                  gatePromoted={gatePromoted}
                  gateSuppressed={gateSuppressed}
                  gateHold={gateHold}
                  gatePillText={gatePillText}
                />
              </div>

            </div>
          </section>

          <div className="hive-command-rail">
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.24em",
                fontWeight: 800,
                color: HIVE_UI.textMuted,
                textTransform: "uppercase",
                alignSelf: "center",
                marginRight: 4,
                paddingRight: 6,
                borderRight: `1px solid ${HIVE_UI.borderDeep}`,
              }}
            >
              Command
            </div>
            <HiveButton compact onClick={loadAll} label="Refresh" />
            <HiveButton compact onClick={runCycle} label="Pulse" />
            <HiveButton compact onClick={startBot} label="Launch" />
            <HiveButton compact onClick={stopBot} label="Recall" />
            <HiveButton compact onClick={enableTrading} label="Arm" />
            <HiveButton compact onClick={disableTrading} label="Disarm" />
            <HiveButton
              compact
              onClick={() => {
                void enablePaperBroker();
              }}
              label="Paper on"
              disabled={paperBrokerEnabled}
              active={paperBrokerEnabled}
            />
            <HiveButton
              compact
              onClick={() => {
                void disablePaperBroker();
              }}
              label="Paper off"
              disabled={!paperBrokerEnabled}
            />
            <HiveButton
              compact
              onClick={() => {
                void syncBroker();
              }}
              label="Sync broker"
              disabled={!paperBrokerEnabled}
            />
            <HiveButton
              compact
              onClick={() => {
                void syncLiveRead();
              }}
              label="Sync live read"
            />
            <HiveButton
              compact
              onClick={() => setAutoRefresh(!autoRefresh)}
              label={autoRefresh ? "Auto on" : "Auto off"}
              active={autoRefresh}
            />
          </div>

          {!paperBrokerEnabled ? (
            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: HIVE_UI.textMuted,
                lineHeight: 1.45,
                maxWidth: 720,
              }}
            >
              Paper broker is <strong style={{ color: HIVE_UI.textSoft }}>disarmed</strong> — HIVE stays in
              signal-only observation. Use <strong>Paper on</strong> to enable Alpaca paper sync and manual SPY submit
              (requires <code style={{ fontSize: 10 }}>ALPACA_PAPER_KEY_ID</code> and{" "}
              <code style={{ fontSize: 10 }}>ALPACA_PAPER_SECRET_KEY</code> on the FastAPI server). Does not auto-trade.
            </div>
          ) : execSurface === "signal_only" ? (
            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: HIVE_UI.accent,
                lineHeight: 1.45,
                maxWidth: 720,
              }}
            >
              Paper broker is armed but execution surface is still signal-only — set Alpaca paper API keys on the
              backend process, then use <strong>Sync broker</strong>.{" "}
              {typeof brokerSync?.error === "string" && brokerSync.error.length
                ? `(${brokerSync.error.length > 140 ? `${brokerSync.error.slice(0, 140)}…` : brokerSync.error})`
                : null}
            </div>
          ) : null}

          {fullState?.config?.alpaca_paper_enabled ? (
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                borderRadius: 14,
                border: `1px solid ${HIVE_UI.border}`,
                background: HIVE_UI.panel,
                maxWidth: 720,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.2em",
                  fontWeight: 800,
                  color: HIVE_UI.textMuted,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Paper manual order
              </div>
              <div style={{ fontSize: 11, color: HIVE_UI.textSoft, marginBottom: 10, lineHeight: 1.45 }}>
                Alpaca paper · SPY equity only · manual submit (not from signal). Buys blocked while a SPY long is
                open; sells only reduce an existing long.{" "}
                <strong style={{ color: HIVE_UI.textMuted }}>Market</strong> submit is allowed only during{" "}
                <strong style={{ color: HIVE_UI.textMuted }}>RTH on</strong> (see stage header pills);{" "}
                <strong style={{ color: HIVE_UI.textMuted }}>limit</strong> may still be sent outside RTH but may rest
                as a working order. <strong>Accepted by broker ≠ filled.</strong>
              </div>
              {typeof system?.pending_signals_count === "number" && system.pending_signals_count > 0 ? (
                <div
                  style={{
                    fontSize: 10,
                    color: HIVE_UI.accent,
                    marginBottom: 10,
                    lineHeight: 1.4,
                  }}
                >
                  Pending {system.pending_signals_count} Alpaca open order(s) (any symbol) — working/accepted is not a fill; may be
                  session-related; cancel or monitor in Alpaca.
                </div>
              ) : null}
              {paperOrderType === "market" && typeof regime?.market_hours === "boolean" && !regime.market_hours ? (
                <div
                  style={{
                    fontSize: 10,
                    color: HIVE_UI.danger,
                    marginBottom: 10,
                    lineHeight: 1.4,
                  }}
                >
                  Market blocked: RTH off ({regime?.label ?? regime?.code ?? "session"}). Use limit or wait for RTH.
                </div>
              ) : null}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <label style={{ fontSize: 11, color: HIVE_UI.textMuted }}>
                  Side{" "}
                  <select
                    value={paperSide}
                    onChange={(e) => setPaperSide(e.target.value as "buy" | "sell")}
                    style={{
                      marginLeft: 4,
                      background: HIVE_UI.shell2,
                      color: HIVE_UI.text,
                      border: `1px solid ${HIVE_UI.border}`,
                      borderRadius: 8,
                      padding: "4px 8px",
                    }}
                  >
                    <option value="buy">buy</option>
                    <option value="sell">sell</option>
                  </select>
                </label>
                <label style={{ fontSize: 11, color: HIVE_UI.textMuted }}>
                  Qty{" "}
                  <input
                    value={paperQty}
                    onChange={(e) => setPaperQty(e.target.value)}
                    inputMode="numeric"
                    style={{
                      width: 56,
                      marginLeft: 4,
                      background: HIVE_UI.shell2,
                      color: HIVE_UI.text,
                      border: `1px solid ${HIVE_UI.border}`,
                      borderRadius: 8,
                      padding: "4px 8px",
                    }}
                  />
                </label>
                <label style={{ fontSize: 11, color: HIVE_UI.textMuted }}>
                  Type{" "}
                  <select
                    value={paperOrderType}
                    onChange={(e) => setPaperOrderType(e.target.value as "market" | "limit")}
                    style={{
                      marginLeft: 4,
                      background: HIVE_UI.shell2,
                      color: HIVE_UI.text,
                      border: `1px solid ${HIVE_UI.border}`,
                      borderRadius: 8,
                      padding: "4px 8px",
                    }}
                  >
                    <option value="market">market</option>
                    <option value="limit">limit</option>
                  </select>
                </label>
                {paperOrderType === "limit" ? (
                  <label style={{ fontSize: 11, color: HIVE_UI.textMuted }}>
                    Limit{" "}
                    <input
                      value={paperLimit}
                      onChange={(e) => setPaperLimit(e.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                      style={{
                        width: 88,
                        marginLeft: 4,
                        background: HIVE_UI.shell2,
                        color: HIVE_UI.text,
                        border: `1px solid ${HIVE_UI.border}`,
                        borderRadius: 8,
                        padding: "4px 8px",
                      }}
                    />
                  </label>
                ) : null}
                <label
                  style={{
                    fontSize: 11,
                    color: HIVE_UI.textMuted,
                    flex: "1 1 200px",
                    minWidth: 0,
                  }}
                >
                  Client order ID{" "}
                  <input
                    value={paperCid}
                    onChange={(e) => setPaperCid(e.target.value)}
                    placeholder="required"
                    style={{
                      width: "min(100%, 220px)",
                      marginLeft: 4,
                      background: HIVE_UI.shell2,
                      color: HIVE_UI.text,
                      border: `1px solid ${HIVE_UI.border}`,
                      borderRadius: 8,
                      padding: "4px 8px",
                    }}
                  />
                </label>
                <HiveButton compact onClick={genPaperCid} label="Gen ID" />
                <HiveButton
                  compact
                  onClick={() => {
                    void submitPaperOrder();
                  }}
                  label="Submit paper"
                  active
                  disabled={paperMarketBlockedOffRth}
                />
              </div>
              {paperOrderHint ? (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 10,
                    color: HIVE_UI.textMuted,
                    lineHeight: 1.45,
                  }}
                >
                  {paperOrderHint}
                </div>
              ) : null}
              {paperOrderObs ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: "9px 11px",
                    borderRadius: 10,
                    border: `1px solid ${HIVE_UI.border}`,
                    background: HIVE_UI.shell2,
                    fontSize: 10,
                    lineHeight: 1.45,
                    color: HIVE_UI.textSoft,
                    maxWidth: 640,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px 12px",
                      alignItems: "baseline",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: "0.14em",
                        color:
                          (paperOrderObs.snapshot_freshness ?? "") === "LOOKUP FAILED / UNKNOWN"
                            ? HIVE_UI.danger
                            : (paperOrderObs.snapshot_freshness ?? "") ===
                                "RESOLVED FROM BROKER ORDER LOOKUP"
                              ? HIVE_UI.good
                              : HIVE_UI.textDim,
                      }}
                    >
                      {paperOrderObs.snapshot_freshness ?? "STALE / LAST KNOWN"}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "0.12em",
                        color: HIVE_UI.accent,
                      }}
                    >
                      {paperOrderObs.hive_lifecycle_label ?? "STATUS UNKNOWN"}
                    </span>
                    {paperOrderObs.broker_status ? (
                      <span style={{ color: HIVE_UI.textMuted }}>
                        Alpaca:{" "}
                        <span style={{ color: HIVE_UI.textSoft }}>
                          {String(paperOrderObs.broker_status)}
                        </span>
                      </span>
                    ) : paperOrderObs.prior_broker_status ? (
                      <span style={{ color: HIVE_UI.textMuted }}>
                        Last known Alpaca status:{" "}
                        <span style={{ color: HIVE_UI.textSoft }}>
                          {String(paperOrderObs.prior_broker_status)}
                        </span>
                      </span>
                    ) : null}
                  </div>
                  <div style={{ color: HIVE_UI.textMuted }}>
                    Qty{" "}
                    <span style={{ color: HIVE_UI.textSoft }}>
                      {paperOrderObs.qty != null ? paperOrderObs.qty : "—"}
                    </span>
                    {" · "}
                    Broker filled qty{" "}
                    <span style={{ color: HIVE_UI.textSoft }}>
                      {paperOrderObs.filled_qty != null ? paperOrderObs.filled_qty : "—"}
                    </span>
                    {paperOrderObs.filled_avg_price != null ? (
                      <>
                        {" · "}
                        Avg fill price (broker){" "}
                        <span style={{ color: HIVE_UI.textSoft }}>
                          {paperOrderObs.filled_avg_price}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div style={{ color: HIVE_UI.textMuted, marginTop: 3 }}>
                    Submitted{" "}
                    <span style={{ color: HIVE_UI.textSoft }}>
                      {formatHiveObsTime(paperOrderObs.submitted_at ?? undefined)}
                    </span>
                    {paperOrderObs.filled_at ? (
                      <>
                        {" · "}
                        Filled at (broker){" "}
                        <span style={{ color: HIVE_UI.textSoft }}>
                          {formatHiveObsTime(paperOrderObs.filled_at)}
                        </span>
                      </>
                    ) : null}
                    {paperOrderObs.canceled_at ? (
                      <>
                        {" · "}
                        Canceled{" "}
                        <span style={{ color: HIVE_UI.textSoft }}>
                          {formatHiveObsTime(paperOrderObs.canceled_at)}
                        </span>
                      </>
                    ) : null}
                    {paperOrderObs.expired_at ? (
                      <>
                        {" · "}
                        Expired{" "}
                        <span style={{ color: HIVE_UI.textSoft }}>
                          {formatHiveObsTime(paperOrderObs.expired_at)}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div style={{ marginTop: 5, fontSize: 9, color: HIVE_UI.textDim }}>
                    order {paperOrderObs.order_id ? String(paperOrderObs.order_id).slice(0, 14) : "—"} · cid{" "}
                    {paperOrderObs.client_order_id
                      ? String(paperOrderObs.client_order_id).slice(0, 20)
                      : "—"}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 9, color: HIVE_UI.textDim, lineHeight: 1.4 }}>
                    {paperOrderObs.truth_note ? (
                      <>
                        {paperOrderObs.truth_note}{" "}
                      </>
                    ) : null}
                    <strong style={{ color: HIVE_UI.textMuted }}>Sync broker</strong> or load{" "}
                    <strong style={{ color: HIVE_UI.textMuted }}>/state</strong> reconciles against Alpaca open orders
                    (no extra polling). <strong style={{ color: HIVE_UI.textMuted }}>Accepted / working ≠ filled.</strong>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="hive-lower-grid">
            <div className="hive-stack">
              <Panel
                variant="diagnostics"
                title="Extended diagnostics"
                subtitle="Secondary depth · operator deck above"
              >
                <div className="hive-signal-grid hive-signal-grid--tight">
                  <div>
                    <PanelSection title="Rationale detail" isFirst subdued>
                      <HiveRow
                        label="Supporting notes"
                        value={
                          Array.isArray(top?.rationale?.points) &&
                          top.rationale.points.length
                            ? top.rationale.points.slice(0, 8).join(" · ")
                            : "—"
                        }
                      />
                    </PanelSection>

                    <PanelSection title="Guardrails" subdued>
                      <HiveRow
                        label="Triggered rules"
                        value={
                          Array.isArray(guard?.triggered_rules) &&
                          guard.triggered_rules.length
                            ? `${guard.triggered_rules.length}: ${guard.triggered_rules.join(", ")}`
                            : "—"
                        }
                      />
                      <HiveRow
                        label="Warnings"
                        value={
                          Array.isArray(guard?.warnings) && guard.warnings.length
                            ? guard.warnings.join(" · ")
                            : "—"
                        }
                      />
                    </PanelSection>
                  </div>

                  <div>
                    <PanelSection title="Contract signals · notes" isFirst subdued>
                      <HiveRow
                        label="Signals"
                        value={
                          Array.isArray(cq?.signals) && cq.signals.length
                            ? cq.signals.join(", ")
                            : "—"
                        }
                        muted
                      />
                      <HiveRow
                        label="CQ notes"
                        value={
                          Array.isArray(cq?.notes) && cq.notes.length
                            ? cq.notes
                                .map((n: unknown) => (typeof n === "string" ? n : ""))
                                .filter(Boolean)
                                .slice(0, 3)
                                .map((n) => (n.length > 90 ? `${n.slice(0, 90)}…` : n))
                                .join(" · ") || "—"
                            : "—"
                        }
                        muted
                      />
                    </PanelSection>

                    <PanelSection title="Execution blockers (full)" subdued>
                      <HiveRow
                        label="Blockers"
                        value={
                          Array.isArray(edge?.blockers) && edge.blockers.length
                            ? edge.blockers.join(" · ")
                            : "—"
                        }
                      />
                    </PanelSection>
                  </div>

                  <div className="hive-signal-span">
                    <PanelSection title="In-process context (this run only)" subdued>
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
              <Panel
                variant="diagnostics"
                title="Bee log"
                subtitle="In-process activity stream (this worker only)"
              >
                <div className="hive-bee-log-inner">
                  {(fullState?.logs || []).length
                    ? (fullState.logs as string[]).join("\n")
                    : (
                        <span style={{ color: HIVE_UI.textMuted, letterSpacing: "0.06em" }}>
                          No bee activity yet
                        </span>
                      )}
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
function TacticalFieldDeck({
  running,
  swarmRunningKnown,
  tradingEnabled,
  system,
  signal,
  top,
  recommended,
  guard,
  promo,
  cq,
  edge,
  delta,
  regime,
  gatePromoted,
  gateSuppressed,
  gateHold,
  gatePillText,
}: {
  running: boolean;
  swarmRunningKnown: boolean;
  tradingEnabled: boolean;
  system: any;
  signal: any;
  top: any;
  recommended: any;
  guard: any;
  promo: any;
  cq: any;
  edge: any;
  delta: any;
  regime: any;
  gatePromoted: boolean;
  gateSuppressed: boolean;
  gateHold: boolean;
  gatePillText: string;
}) {
  const postureTitle = !swarmRunningKnown
    ? "SWARM RUNTIME UNKNOWN"
    : !running
      ? "SWARM IDLE"
      : tradingEnabled
        ? "SWARM ACTIVE · ARMED"
        : "SWARM ACTIVE · DISARMED";

  const postureSub =
    typeof system?.operator_posture_hint === "string" && system.operator_posture_hint.length
      ? system.operator_posture_hint
      : typeof system?.lifecycle_phase === "string"
        ? `${system.lifecycle_phase}${
            typeof system.lifecycle_hint === "string" && system.lifecycle_hint.length
              ? ` — ${system.lifecycle_hint}`
              : ""
          }`
        : !swarmRunningKnown
          ? "Health probe failed or returned a non-object while structured contract fields were missing — do not infer loop state from pills alone; fix /api/hive/health or confirm /state."
          : running
            ? "Loop online — awaiting structured posture from hive core."
            : "No active loop. Launch bees or pulse cycle to run a tactical refresh.";

  const lastCycle = formatVal(system?.last_cycle_at);
  const pulseAge =
    system?.signal_age_seconds !== undefined && system?.signal_age_seconds !== null
      ? `${system.signal_age_seconds}s`
      : "—";

  const sessionLine = regime?.code ? String(regime.code) : "—";
  const rth = regime?.market_hours ? "RTH on" : "RTH off";

  const gateShort = gatePillText.replace(/^Gate:\s*/i, "").trim() || "—";

  const cqWarnings =
    Array.isArray(cq?.warnings) && cq.warnings.length ? cq.warnings.slice(0, 2).join(" · ") : "";
  const cqLine =
    `${formatVal(cq?.status)} · score ${cq?.score !== undefined && cq?.score !== null ? String(cq.score) : "—"}` +
    (cqWarnings ? ` · ${cqWarnings}` : "");

  const edgeBlock =
    Array.isArray(edge?.blockers) && edge.blockers.length
      ? edge.blockers.slice(0, 2).join(" · ")
      : "none";

  const guardRules =
    Array.isArray(guard?.triggered_rules) && guard.triggered_rules.length
      ? guard.triggered_rules.slice(0, 4).join(", ")
      : "";

  const deltaLine = delta
    ? `${delta.status} · ${typeof delta.detail === "string" && delta.detail.length ? delta.detail : "—"}`
    : "—";

  const thesis =
    typeof top?.rationale?.thesis === "string" && top.rationale.thesis.length
      ? top.rationale.thesis.length > 160
        ? `${top.rationale.thesis.slice(0, 160)}…`
        : top.rationale.thesis
      : "";

  const recActionEmph = gatePromoted && recommended?.action === "trade";

  const miniCard = {
    border: `1px solid rgba(255,255,255,0.055)`,
    borderRadius: 10,
    padding: "9px 11px",
    background: "linear-gradient(180deg, rgba(255,255,255,0.026), rgba(0,0,0,0.1))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
    minWidth: 0,
  } as const;

  const miniTitle = {
    fontSize: 8,
    fontWeight: 800,
    letterSpacing: "0.22em",
    color: HIVE_UI.textDim,
    textTransform: "uppercase" as const,
    marginBottom: 7,
  } as const;

  return (
    <div>
      <div
        style={{
          paddingBottom: 12,
          marginBottom: 13,
          borderBottom: `1px solid rgba(255,255,255,0.09)`,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "0.12em",
            color: HIVE_UI.text,
            marginBottom: 5,
            textRendering: "geometricPrecision",
          }}
        >
          {postureTitle}
        </div>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.48,
            color: HIVE_UI.textSoft,
            marginBottom: 9,
            maxWidth: "60ch",
          }}
        >
          {postureSub}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px 14px",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: HIVE_UI.textDim,
          }}
        >
          <span>Last cycle {lastCycle}</span>
          <span>Pulse age {pulseAge}</span>
          <span>Session {sessionLine}</span>
          <span>{rth}</span>
        </div>
      </div>

      {gateSuppressed ? (
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: "#ffdede",
            marginBottom: 12,
            padding: "10px 12px",
            background: "linear-gradient(180deg, rgba(217,107,107,0.14), rgba(217,107,107,0.07))",
            borderRadius: 12,
            border: `1px solid ${HIVE_UI.danger}`,
          }}
        >
          <strong>Gate suppressed.</strong> Tactical readouts below are for awareness only — not a green light to
          size risk from the trade leg.
        </div>
      ) : null}
      {gateHold && !gateSuppressed ? (
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: HIVE_UI.textSoft,
            marginBottom: 12,
            padding: "10px 12px",
            background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.012))",
            borderRadius: 12,
            border: `1px solid ${HIVE_UI.border}`,
            borderLeft: `3px solid ${HIVE_UI.accent}`,
          }}
        >
          <strong>Gate on hold.</strong> Confirm guardrails and execution edge before treating any trade leg as
          actionable.
        </div>
      ) : null}

      <div className="hive-deck-grid-2" style={{ marginBottom: 12 }}>
        <div
          style={{
            border: `1px solid rgba(199,154,49,0.28)`,
            borderRadius: 11,
            padding: "11px 13px",
            background: "linear-gradient(180deg, rgba(199,154,49,0.085), rgba(0,0,0,0.16))",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <div style={{ ...miniTitle, color: "#c9a24a", marginBottom: 8, letterSpacing: "0.2em" }}>
            Top signal · leg
          </div>
          <div
            style={{
              fontSize: recActionEmph ? 23 : 20,
              fontWeight: 800,
              color: recActionEmph ? "#f1deb0" : HIVE_UI.text,
              marginBottom: 10,
              letterSpacing: "0.045em",
            }}
          >
            {formatVal(recommended?.action)}
          </div>
          <HiveRow label="Structure" value={formatVal(recommended?.structure)} muted={gateSuppressed || gateHold} />
          <HiveRow label="DTE" value={formatVal(recommended?.dte)} muted={gateSuppressed} />
          <HiveRow label="Delta (leg)" value={formatVal(recommended?.delta)} muted={gateSuppressed} />
        </div>

        <div
          style={{
            border: `1px solid ${HIVE_UI.borderDeep}`,
            borderRadius: 11,
            padding: "11px 13px",
            background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.14))",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.022)",
          }}
        >
          <div style={{ ...miniTitle, marginBottom: 8 }}>Market · setup</div>
          <HiveRow
            label="Spot"
            value={formatVal(signal?.spot)}
            emphasized={!!signal?.spot}
          />
          <HiveRow label="Bias" value={formatVal(signal?.bias)} emphasized={!!signal?.bias} />
          <HiveRow
            label="Score"
            value={formatVal(signal?.setup_score)}
            emphasized={signal?.setup_score !== undefined && signal?.setup_score !== null}
          />
          <HiveRow
            label="Hive rank"
            value={
              top?.rank_score !== undefined && top?.rank_score !== null ? String(top.rank_score) : "—"
            }
          />
          <HiveRow label="VWAP" value={formatVal(signal?.vwap)} muted />
        </div>
      </div>

      <div className="hive-deck-mini-row" style={{ marginBottom: 12 }}>
        <div style={miniCard}>
          <div style={miniTitle}>Contract quality</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: HIVE_UI.textSoft }}>{cqLine}</div>
        </div>
        <div style={miniCard}>
          <div style={miniTitle}>Execution edge</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: HIVE_UI.textSoft }}>
            {formatVal(edge?.status)} · score{" "}
            {edge?.score !== undefined && edge?.score !== null ? String(edge.score) : "—"}
          </div>
          <div style={{ fontSize: 11, color: HIVE_UI.textDim, marginTop: 5, lineHeight: 1.4 }}>
            Blockers: {edgeBlock}
          </div>
        </div>
        <div style={miniCard}>
          <div style={miniTitle}>Guard · gate</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: HIVE_UI.textSoft }}>
            {guard?.status ? `${guard.status}${guard.actionable ? " · act" : ""}` : "—"} · {gateShort}
          </div>
          <div style={{ fontSize: 11, color: HIVE_UI.textDim, marginTop: 5, lineHeight: 1.4 }}>
            {promo && typeof promo.reason === "string" && promo.reason.length
              ? promo.reason.length > 120
                ? `${promo.reason.slice(0, 120)}…`
                : promo.reason
              : "—"}
          </div>
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${HIVE_UI.borderDeep}`,
          borderRadius: 11,
          padding: "11px 13px",
          background: "linear-gradient(180deg, rgba(255,255,255,0.018), rgba(0,0,0,0.1))",
          marginBottom: thesis ? 10 : 0,
        }}
      >
        <div style={{ ...miniTitle, marginBottom: 7 }}>Cycle delta · blockers</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: HIVE_UI.textSoft, lineHeight: 1.5 }}>
          {deltaLine}
        </div>
        {guardRules ? (
          <div style={{ fontSize: 12, color: "#ffcdcd", marginTop: 8, lineHeight: 1.45 }}>
            Rules: {guardRules}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: HIVE_UI.textDim, marginTop: 8 }}>
            No guard rule flags on this pulse.
          </div>
        )}
        {Array.isArray(guard?.warnings) && guard.warnings.length ? (
          <div style={{ fontSize: 12, color: HIVE_UI.textSoft, marginTop: 8, lineHeight: 1.45 }}>
            Warnings: {guard.warnings.slice(0, 3).join(" · ")}
          </div>
        ) : null}
      </div>

      {thesis ? (
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.55,
            color: HIVE_UI.textMuted,
            paddingTop: 4,
            borderTop: `1px solid ${HIVE_UI.borderDeep}`,
          }}
        >
          <span style={{ fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Thesis ·{" "}
          </span>
          {thesis}
        </div>
      ) : (
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.14em",
            fontWeight: 700,
            textTransform: "uppercase",
            color: HIVE_UI.textDim,
            paddingTop: 8,
            borderTop: `1px solid ${HIVE_UI.borderDeep}`,
          }}
        >
          Thesis not published on this pulse
        </div>
      )}
    </div>
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
        minWidth: 72,
        border: `1px solid ${accent ? HIVE_UI.accentLine : HIVE_UI.border}`,
        borderRadius: 8,
        padding: "5px 8px",
        background: accent
          ? "linear-gradient(180deg, rgba(199,154,49,0.11), rgba(199,154,49,0.04))"
          : "linear-gradient(180deg, rgba(255,255,255,0.028), rgba(255,255,255,0.012))",
      }}
    >
      <div
        style={{
          fontSize: 8,
          fontWeight: 800,
          letterSpacing: "0.2em",
          color: HIVE_UI.textMuted,
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: accent ? "#f1deb0" : HIVE_UI.text,
          letterSpacing: "0.02em",
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
        padding: "8px 0",
        borderBottom: `1px solid ${HIVE_UI.borderDeep}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: muted ? HIVE_UI.textDim : HIVE_UI.textMuted,
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          textAlign: "right",
          letterSpacing: accent ? "0.02em" : "0",
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
  dense = false,
}: {
  text: string;
  active?: boolean;
  tone?: PillTone;
  dense?: boolean;
}) {
  const base = {
    borderRadius: 999,
    padding: dense ? "3px 8px" : "7px 12px",
    fontSize: dense ? 10 : 12,
    fontWeight: 700,
    letterSpacing: dense ? "0.015em" : "0.03em",
    lineHeight: dense ? 1.22 : 1.3,
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
        background: active ? HIVE_UI.goodSoft : "rgba(255,255,255,0.02)",
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
  compact = false,
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  compact?: boolean;
  disabled?: boolean;
}) {
  const restShadow = "inset 0 1px 0 rgba(255,255,255,0.03)";
  const activeShadow = `inset 0 0 0 1px ${HIVE_UI.accentLine}`;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        background: active
          ? "linear-gradient(180deg, rgba(199,154,49,0.14), rgba(199,154,49,0.06))"
          : "linear-gradient(180deg, #10141a, #0b0e13)",
        color: active ? "#f1deb0" : HIVE_UI.textSoft,
        border: active ? `1px solid ${HIVE_UI.accentLine}` : `1px solid ${HIVE_UI.border}`,
        borderRadius: compact ? 999 : 12,
        padding: compact ? "5px 10px" : "11px 14px",
        fontWeight: 700,
        fontSize: compact ? 9.5 : 12,
        letterSpacing: compact ? "0.065em" : "0.08em",
        textTransform: "uppercase" as const,
        boxShadow: active ? activeShadow : restShadow,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
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

function Panel({
  title,
  subtitle,
  children,
  variant = "default",
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  variant?: "default" | "diagnostics";
  className?: string;
}) {
  const isDiag = variant === "diagnostics";
  return (
    <div
      className={className}
      style={{
        background: isDiag
          ? "linear-gradient(180deg, rgba(255,255,255,0.012), rgba(0,0,0,0.04)), linear-gradient(180deg, #080a0e, #050608)"
          : "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01)), linear-gradient(180deg, #0b0e13, #090b10)",
        border: `1px solid ${isDiag ? HIVE_UI.borderDeep : HIVE_UI.border}`,
        borderRadius: isDiag ? 14 : 16,
        padding: isDiag ? 12 : 14,
        boxShadow: isDiag
          ? "inset 0 1px 0 rgba(255,255,255,0.018), 0 6px 22px rgba(0,0,0,0.2)"
          : "inset 0 1px 0 rgba(255,255,255,0.03), 0 10px 30px rgba(0,0,0,0.24)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: subtitle ? (isDiag ? 8 : 10) : isDiag ? 6 : 8,
        }}
      >
        <h2
          style={{
            margin: 0,
            color: isDiag ? HIVE_UI.textSoft : HIVE_UI.text,
            fontSize: isDiag ? 10 : 12,
            fontWeight: 800,
            letterSpacing: isDiag ? "0.17em" : "0.17em",
            textTransform: "uppercase",
            textRendering: "geometricPrecision",
          }}
        >
          {title}
        </h2>
        {subtitle ? (
          <div
            style={{
              fontSize: isDiag ? 9 : 10,
              color: isDiag ? HIVE_UI.textDim : HIVE_UI.textMuted,
              letterSpacing: isDiag ? "0.1em" : "0.12em",
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
  subdued = false,
}: {
  title: string;
  children: React.ReactNode;
  isFirst?: boolean;
  subdued?: boolean;
}) {
  return (
    <div style={{ marginTop: isFirst ? 0 : subdued ? 11 : 14 }}>
      <div
        style={{
          fontSize: subdued ? 9 : 10,
          letterSpacing: subdued ? "0.16em" : "0.18em",
          fontWeight: 800,
          color: subdued ? HIVE_UI.textDim : HIVE_UI.textMuted,
          textTransform: "uppercase",
          marginBottom: subdued ? 8 : 10,
          borderBottom: `1px solid ${subdued ? HIVE_UI.borderDeep : HIVE_UI.border}`,
          paddingBottom: subdued ? 6 : 8,
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
        padding: "8px 0",
        borderBottom: `1px solid ${HIVE_UI.borderDeep}`,
      }}
    >
      <div
        style={{
          color: muted ? HIVE_UI.textDim : HIVE_UI.textMuted,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: valueColor,
          fontWeight: 800,
          textAlign: "right",
          fontSize,
          letterSpacing: emphasized && !muted ? "0.02em" : "0",
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