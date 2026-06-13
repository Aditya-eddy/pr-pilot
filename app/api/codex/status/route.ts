import { NextRequest, NextResponse } from "next/server";

import { getCodexStatus } from "@/lib/codex";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    return NextResponse.json(await getCodexStatus(refresh));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read Codex usage";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
