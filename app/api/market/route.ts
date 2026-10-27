import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const base = process.env.FINN_BACKEND_URL || "http://127.0.0.1:8000";
  try {
    const response = await fetch(
      `${base.replace(/\/$/, "")}/api/market/portfolio`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      },
    );
    const data = await response.json();
    return NextResponse.json(data, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Market service is unavailable. Start the FastAPI backend and try again. No sample prices are substituted.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
