"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const ADMIN_KEY = "mysecret123";

type PillTone = "neutral" | "promoted" | "hold" | "suppressed";

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
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #2b2100 0%, #15120a 42%, #0b0a08 100%)",
        color: "#f9ecb8",
        fontFamily: "Arial, sans-serif",
        padding: 18,
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <section
          style={{
            background: "rgba(255,213,92,0.06)",
            border: "1px solid #6c5416",
            borderRadius: 24,
            padding: 22,
            marginBottom: 18,
            boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
          }}
        >
          <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ width: 132, height: 132, position: "relative", flex: "0 0 auto" }}>
              <Image src="/hive-logo.png" alt="HIVE Logo" fill style={{ objectFit: "contain" }} priority />
            </div>

            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 12, letterSpacing: 2.2, color: "#d3b04f", textTransform: "uppercase", marginBottom: 8 }}>
                Hyper-Intelligent Volatility Execution
              </div>
              <h1 style={{ margin: 0, fontSize: 44, color: "#ffd55c", letterSpacing: 1.2 }}>HIVE</h1>
              <div style={{ marginTop: 10, fontSize: 16, color: "#f3df9d" }}>
                Mechanical swarm intelligence for SPY volatility trading
              </div>
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, color: "#a89050", letterSpacing: 0.4 }}>Ops</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <StatusPill text={running ? "Swarm Active" : "Swarm Idle"} active={running} />
                  <StatusPill text={`Trading ${tradingEnabled ? "Armed" : "Safe"}`} />
                  <StatusPill text={surfacePillText} />
                  <StatusPill text={`Bias ${formatVal(signal?.bias)}`} />
                  <StatusPill text={`Score ${formatVal(signal?.setup_score)}`} />
                  <StatusPill text={autoRefresh ? "Auto refresh on" : "Auto refresh off"} active={autoRefresh} />
                </div>
                <div style={{ fontSize: 11, color: "#a89050", letterSpacing: 0.4 }}>Governance (at a glance)</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
          </div>
        </section>

        {error ? (
          <div
            style={{
              background: "rgba(255,120,120,0.12)",
              color: "#ffd8d8",
              padding: 12,
              borderRadius: 12,
              marginBottom: 16,
              border: "1px solid #a34c4c",
            }}
          >
            <strong>Hive warning:</strong> {error}
          </div>
        ) : null}

        <section style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <HiveButton onClick={loadAll} label="Refresh Hive" />
          <HiveButton onClick={runCycle} label="Pulse Cycle" />
          <HiveButton onClick={startBot} label="Launch Bees" />
          <HiveButton onClick={stopBot} label="Recall Bees" />
          <HiveButton onClick={enableTrading} label="Arm Hive" />
          <HiveButton onClick={disableTrading} label="Disarm Hive" />
          <HiveButton onClick={() => setAutoRefresh(!autoRefresh)} label={autoRefresh ? "Auto Swarm On" : "Auto Swarm Off"} active={autoRefresh} />
        </section>

        <section
          style={{
            background: "linear-gradient(180deg, rgba(255,213,92,0.06) 0%, rgba(255,213,92,0.02) 100%)",
            border: "1px solid #5f4a15",
            borderRadius: 24,
            padding: 18,
            marginBottom: 20,
            boxShadow: "0 10px 24px rgba(0,0,0,0.22)",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: "#ffd55c", marginBottom: 12 }}>Hive Live View</div>
          <OrbitHive cards={cards} autoRefresh={autoRefresh} running={running} />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
            gap: 16,
          }}
        >
          <Panel title="Signal, gate & trade">
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
                    color: "#f0d4d4",
                    marginBottom: 10,
                    padding: "10px 12px",
                    background: "rgba(140,60,60,0.14)",
                    borderRadius: 10,
                    border: "1px solid rgba(180,90,90,0.4)",
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
                    color: "#ffe8c8",
                    marginBottom: 10,
                    padding: "10px 12px",
                    background: "rgba(200,140,40,0.12)",
                    borderRadius: 10,
                    border: "1px solid rgba(210,150,50,0.45)",
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
            <PanelSection title="Contract quality">
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
                      : "—"
                }
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
          </Panel>

          <Panel title="Hive Treasury">
            <HiveRow
              label="Session (clock · ET)"
              value={
                regime
                  ? `${regime.code} · RTH ${regime.market_hours ? "on" : "off"}${typeof regime.detail === "string" && regime.detail.length ? ` — ${regime.detail.length > 72 ? `${regime.detail.slice(0, 72)}…` : regime.detail}` : ""}`
                  : "—"
              }
            />
            <HiveRow label="Cash" value={formatVal(perf?.cash ?? fullState?.cash)} />
            <HiveRow label="Equity" value={formatVal(perf?.equity ?? fullState?.equity)} />
            <HiveRow label="Daily P&L" value={formatVal(perf?.realized_pnl_today ?? fullState?.realized_pnl_today)} />
            <HiveRow label="Loss Streak" value={formatVal(perf?.consecutive_losses ?? fullState?.consecutive_losses)} />
          </Panel>
        </section>

        <section style={{ marginTop: 18 }}>
          <Panel title="Bee Log">
            <div
              style={{
                background: "rgba(0,0,0,0.25)",
                border: "1px solid #4f3d12",
                borderRadius: 14,
                padding: 12,
                maxHeight: 280,
                overflowY: "auto",
                fontSize: 13,
                color: "#f2e4a0",
                whiteSpace: "pre-wrap",
              }}
            >
              {(fullState?.logs || []).length ? (fullState.logs as string[]).join("\n") : "No bee activity yet"}
            </div>
          </Panel>
        </section>
      </div>
    </main>
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
        <div style={{ position: "absolute", inset: 0, opacity: 0.12, backgroundImage: "radial-gradient(#5f4a15 1px, transparent 1px)", backgroundSize: "26px 26px" }} />

        <svg viewBox="0 0 720 720" width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.18 }}>
          <circle cx="360" cy="360" r="248" fill="none" stroke="#7a5d17" strokeWidth="1.5" strokeDasharray="7 10" />
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
            left: center - 140,
            top: center - 160,
            width: 280,
            height: 320,
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
          <div style={{ width: 220, height: 250, animation: running ? "hiveGlow 3.4s ease-in-out infinite" : undefined }}>
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
          0% { filter: drop-shadow(0 0 0 rgba(255,213,92,0)); }
          50% { filter: drop-shadow(0 0 18px rgba(255,213,92,0.35)); }
          100% { filter: drop-shadow(0 0 0 rgba(255,213,92,0)); }
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
        width: 280,
        height: 320,
        transform: active ? "scale(1.01)" : "scale(1)",
        filter: active ? "drop-shadow(0 0 16px rgba(255,180,43,0.32))" : "none",
        transition: "transform 0.25s ease, filter 0.25s ease",
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

        <g opacity="0.55">
          <path d="M100 82 Q150 68 200 82" fill="none" stroke="#3a2a12" strokeWidth="3" />
          <path d="M76 120 Q150 100 224 120" fill="none" stroke="#3a2a12" strokeWidth="3" />
          <path d="M58 166 Q150 140 242 166" fill="none" stroke="#3a2a12" strokeWidth="3" />
          <path d="M72 214 Q150 194 228 214" fill="none" stroke="#3a2a12" strokeWidth="3" />
          <path d="M96 252 Q150 238 204 252" fill="none" stroke="#3a2a12" strokeWidth="3" />
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
    padding: "8px 12px" as const,
    fontSize: 13 as const,
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
        background: active ? "rgba(86,211,100,0.18)" : "rgba(255,213,92,0.08)",
        border: active ? "1px solid #56d364" : "1px solid #6f5719",
        color: active ? "#d8ffd8" : "#f5e2a3",
      }}
    >
      {text}
    </div>
  );
}

function HiveButton({ onClick, label, active = false }: { onClick: () => void; label: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "linear-gradient(180deg, #d1a51f 0%, #9b7110 100%)" : "linear-gradient(180deg, #ffd55c 0%, #d9a620 100%)",
        color: "#251b00",
        border: "none",
        borderRadius: 999,
        padding: "12px 16px",
        fontWeight: 700,
        fontSize: 14,
        boxShadow: active ? "inset 0 3px 10px rgba(0,0,0,0.25)" : "0 6px 18px rgba(217,166,32,0.25)",
        cursor: "pointer",
        transition: "transform 0.08s ease, filter 0.08s ease, box-shadow 0.08s ease",
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.filter = "brightness(0.84)";
        e.currentTarget.style.transform = "translateY(1px) scale(0.99)";
        e.currentTarget.style.boxShadow = "inset 0 4px 10px rgba(0,0,0,0.28)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.filter = "brightness(1)";
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = active ? "inset 0 3px 10px rgba(0,0,0,0.25)" : "0 6px 18px rgba(217,166,32,0.25)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = "brightness(1)";
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = active ? "inset 0 3px 10px rgba(0,0,0,0.25)" : "0 6px 18px rgba(217,166,32,0.25)";
      }}
      onTouchStart={(e) => {
        e.currentTarget.style.filter = "brightness(0.84)";
        e.currentTarget.style.transform = "translateY(1px) scale(0.99)";
        e.currentTarget.style.boxShadow = "inset 0 4px 10px rgba(0,0,0,0.28)";
      }}
      onTouchEnd={(e) => {
        e.currentTarget.style.filter = "brightness(1)";
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = active ? "inset 0 3px 10px rgba(0,0,0,0.25)" : "0 6px 18px rgba(217,166,32,0.25)";
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
            ? "linear-gradient(180deg, rgba(255,213,92,0.18) 0%, rgba(255,170,40,0.08) 100%)"
            : "linear-gradient(180deg, rgba(255,213,92,0.10) 0%, rgba(255,213,92,0.04) 100%)",
          border: featured ? "1px solid #d9a620" : "1px solid #6f5719",
          boxShadow: featured ? "0 0 24px rgba(255,213,92,0.12)" : "0 8px 20px rgba(0,0,0,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "#c5ab5b", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ fontSize: featured ? 23 : 19, fontWeight: 700, color: "#fff1b8" }}>{value}</div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, #1d1708 0%, #12100a 100%)",
        border: "1px solid #5f4a15",
        borderRadius: 20,
        padding: 16,
        boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: 14, color: "#ffd55c" }}>{title}</h2>
      {children}
    </div>
  );
}

function PanelSection({ title, children, isFirst }: { title: string; children: React.ReactNode; isFirst?: boolean }) {
  return (
    <div style={{ marginTop: isFirst ? 0 : 12 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.8,
          color: "#9a8344",
          textTransform: "uppercase",
          marginBottom: 4,
          borderBottom: "1px solid rgba(255,213,92,0.12)",
          paddingBottom: 6,
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
  const valueColor = muted ? "#8f8268" : emphasized ? "#ffd55c" : "#fff1b8";
  const fontSize = emphasized && !muted ? 18 : muted ? 15 : 16;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "10px 0",
        borderBottom: "1px solid rgba(255,213,92,0.1)",
      }}
    >
      <div style={{ color: muted ? "#9a8b65" : "#c5ab5b" }}>{label}</div>
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
