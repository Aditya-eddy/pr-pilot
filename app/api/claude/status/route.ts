import { NextRequest, NextResponse } from "next/server";

import { getClaudeStatus } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    return NextResponse.json(await getClaudeStatus(refresh));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read Claude usage";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
