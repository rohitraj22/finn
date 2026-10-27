import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const r = await fetch(
      `${process.env.FINN_BACKEND_URL || "http://127.0.0.1:8000"}/api/announcements/insights`,
      { cache: "no-store", signal: AbortSignal.timeout(90_000) },
    );
    return NextResponse.json(await r.json(), { status: r.status });
  } catch {
    return NextResponse.json({ error: "AI unavailable" }, { status: 503 });
  }
}
