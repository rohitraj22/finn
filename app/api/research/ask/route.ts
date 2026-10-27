import { NextResponse } from "next/server";
import { researchProxy } from "../proxy";
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 6000)
      return NextResponse.json(
        { error: "Question is too long." },
        { status: 413 },
      );
    return researchProxy("ask", JSON.parse(text));
  } catch {
    return NextResponse.json(
      { error: "Invalid research request." },
      { status: 400 },
    );
  }
}
