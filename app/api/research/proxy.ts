import { NextResponse } from "next/server";
export async function researchProxy(path: string, body?: unknown) {
  const base = process.env.FINN_BACKEND_URL || "http://127.0.0.1:8000";
  try {
    const response = await fetch(
      `${base.replace(/\/$/, "")}/api/research/${path}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(150_000),
      },
    );
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "The research service is unavailable. Please retry." },
      { status: 503 },
    );
  }
}
