import { NextRequest, NextResponse } from "next/server";

const HIVE_API_ORIGIN = (process.env.HIVE_API_ORIGIN ?? "").replace(/\/+$/, "");
const BOT_ADMIN_KEY = process.env.BOT_ADMIN_KEY ?? "";
const MIN_KEY_LEN = 32;

/** method -> allowed path keys (joined with /, no leading slash) */
const ALLOWED: Record<string, Set<string>> = {
  GET: new Set(["health", "state"]),
  POST: new Set([
    "paper/sync",
    "paper/order",
    "config",
    "bot/start",
    "bot/stop",
    "cycle",
    "risk/reset",
  ]),
};

function misconfigured(): NextResponse {
  return NextResponse.json(
    {
      error:
        "BFF misconfigured: set HIVE_API_ORIGIN and BOT_ADMIN_KEY (min 32 chars) on the Next server",
    },
    { status: 503 },
  );
}

async function proxy(req: NextRequest, pathKey: string): Promise<NextResponse> {
  if (!HIVE_API_ORIGIN || !BOT_ADMIN_KEY || BOT_ADMIN_KEY.length < MIN_KEY_LEN) {
    return misconfigured();
  }

  const method = req.method.toUpperCase();
  const allowedSet = ALLOWED[method];
  if (!allowedSet || !allowedSet.has(pathKey)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const target = `${HIVE_API_ORIGIN}/${pathKey}${url.search}`;

  const headers: Record<string, string> = {
    "x-bot-admin-key": BOT_ADMIN_KEY,
  };

  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await req.text();
    const ct = req.headers.get("content-type");
    if (ct) {
      headers["Content-Type"] = ct;
    } else if (body) {
      headers["Content-Type"] = "application/json";
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { method, headers, body });
  } catch {
    return NextResponse.json({ error: "upstream unreachable" }, { status: 502 });
  }

  const text = await upstream.text();
  const ct = upstream.headers.get("content-type") ?? "application/json";
  return new NextResponse(text, { status: upstream.status, headers: { "Content-Type": ct } });
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path: segments } = await ctx.params;
  const pathKey = (segments ?? []).filter(Boolean).join("/");
  return proxy(req, pathKey);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path: segments } = await ctx.params;
  const pathKey = (segments ?? []).filter(Boolean).join("/");
  return proxy(req, pathKey);
}
