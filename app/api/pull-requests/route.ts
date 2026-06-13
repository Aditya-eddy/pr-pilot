import { NextRequest, NextResponse } from "next/server";

import { listOpenPullRequests } from "@/lib/pull-requests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const result = await listOpenPullRequests(refresh);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load pull requests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
