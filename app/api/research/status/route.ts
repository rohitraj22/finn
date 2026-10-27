import { NextRequest } from "next/server";
import { researchProxy } from "../proxy";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return researchProxy(
    `status?symbol=${encodeURIComponent(request.nextUrl.searchParams.get("symbol") || "TCS")}`,
  );
}
