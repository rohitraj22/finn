import { NextResponse } from "next/server";
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^(nse|bse)-[a-f0-9]{24}$/.test(id))
    return NextResponse.json({ error: "Invalid filing" }, { status: 400 });
  try {
    const r = await fetch(
      `${process.env.FINN_BACKEND_URL || "http://127.0.0.1:8000"}/api/announcements/${id}/analyze`,
      { method: "POST", signal: AbortSignal.timeout(90_000) },
    );
    return NextResponse.json(await r.json(), { status: r.status });
  } catch {
    return NextResponse.json({ error: "AI unavailable" }, { status: 503 });
  }
}
