import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const hours = request.nextUrl.searchParams.get("hours") || "720";
  if (!["24", "168", "720"].includes(hours))
    return NextResponse.json(
      { error: "Choose 24, 168 or 720 hours." },
      { status: 400 },
    );
  const base = process.env.FINN_BACKEND_URL || "http://127.0.0.1:8000";
  try {
    const response = await fetch(
      `${base.replace(/\/$/, "")}/api/announcements?hours=${hours}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      },
    );
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The announcement service is unavailable. Please retry. No sample announcements are substituted.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
