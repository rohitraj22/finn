import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
async function proxy(request?: Request) {
  try {
    const r = await fetch(
      `${process.env.FINN_BACKEND_URL || "http://127.0.0.1:8000"}/api/price-alerts`,
      {
        method: request ? "PUT" : "GET",
        headers: { "Content-Type": "application/json" },
        body: request ? JSON.stringify(await request.json()) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      },
    );
    return NextResponse.json(await r.json(), { status: r.status });
  } catch {
    return NextResponse.json(
      { detail: "EOD alert service unavailable. Please retry." },
      { status: 503 },
    );
  }
}
export async function GET() {
  return proxy();
}
export async function PUT(request: Request) {
  return proxy(request);
}
