# HIVE runtime ownership & hosting contract

**Scope:** SPY-only HIVE stack in this repo (`backend/` FastAPI + `dashboard/` Next.js). **Not** EXCALIBUR. **Not** a scheduler migration guide.

## 1. True runtime model

| Piece | Truth |
|--------|--------|
| **Process owner** | Whoever runs **`uvicorn spy_options_bot_backend:app`** (see `backend/Procfile`). That process holds **in-memory** `state` and the bot flag. |
| **Assumption** | **One long-lived worker** (always-on container/VM/dyno). Not “one HTTP request at a time” unless that request never ends. |
| **`bot_loop`** | After **`POST /bot/start`**, FastAPI schedules **`asyncio.create_task(bot_loop)`**. The loop runs **while** `state["running"]` is true: if `state["config"]["enabled"]`, it calls **`run_signal_cycle()`**, then **`asyncio.sleep(poll_seconds)`** (clamped 1–3600s, default 10). |
| **`POST /bot/stop`** | Sets `running` false; the loop **exits after the current sleep** (not instant). |
| **`POST /cycle`** | Runs **one** `run_signal_cycle()` **manually** (shared lock with the loop). Does **not** replace the loop. |
| **`GET /state`** | Read-only snapshot + `hive_contract_v1`. **Does not** advance the signal engine. |
| **Dashboard** | **`loadAll()`** polls **`/state`** (e.g. every 5s when auto-refresh is on) for **observability only**. Buttons call **`/bot/start`**, **`/bot/stop`**, **`/config`**, **`/cycle`**. **The browser is not the scheduler.** |

## 2. Safe vs unsafe hosting

| Hosting pattern | Verdict |
|-----------------|--------|
| Persistent process (container/VM/Heroku-style web dyno, always-on VPS, local dev `uvicorn` left running) | **Safe enough** for this design. |
| Serverless function per request, scale-to-zero, or any runtime that **destroys the process** between invocations | **Unsafe** — `bot_loop` and in-memory state **do not survive**. |
| Multiple unrelated replicas of the same API without shared state | **Fragile** — each instance has its **own** `state`; not coordinated here. |

## 3. Minimum health expectations

1. **Backend reachable** — dashboard or operator can `GET /health` and authenticated `GET /state`.
2. **Truth in `hive_contract_v1.system_state`** — `bot_running` ↔ loop started; `trading_enabled` ↔ `config.enabled`; `last_cycle_at` updates when cycles actually run (loop or `/cycle`).
3. **Poll cadence** — with swarm **running** and **armed**, expect a pulse about every **`poll_seconds`** (unless only manual `/cycle` is used).
4. **UI vs loop** — **Fast UI refresh does not imply** the backend is cycling. Confirm **`bot_running`**, **`trading_enabled`**, and **`last_cycle_at` / signal age** to know the loop is alive and pulsing.

## 4. Operator takeaway

**Production heartbeat = always-on FastAPI process + optional `bot_loop` after `/bot/start` + `enabled` true.** GitHub Actions / CI are **not** part of this repo’s live cadence. External schedulers are **out of scope** for this contract.

## 5. H2 — admin surface & CORS (paper-capable API)

| Variable | Where | Purpose |
|----------|--------|---------|
| **`BOT_ADMIN_KEY`** | FastAPI env + Next **server** env | Shared secret; **min 32 characters** unless **`HIVE_ALLOW_WEAK_ADMIN_KEY=1`** (local dev only; allows legacy default when key unset). |
| **`HIVE_ALLOW_WEAK_ADMIN_KEY`** | FastAPI only | Set to `1` / `true` / `yes` only on trusted localhost. |
| **`HIVE_CORS_ORIGINS`** | FastAPI | Comma-separated extra browser origins (e.g. production dashboard URL). Default list is localhost/127.0.0.1 on ports 3000 and 3005. **No** `*.vercel.app` wildcard. |
| **`HIVE_API_ORIGIN`** | Next **server** only | FastAPI base URL for the BFF (e.g. `http://127.0.0.1:8000`). |

The dashboard calls **`/api/hive/*`** on the Next origin; Route Handlers inject **`x-bot-admin-key`** — the browser never sees the key.
