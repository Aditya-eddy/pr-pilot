import { NextRequest, NextResponse } from "next/server";

import { getReviewQueue } from "@/lib/reviews/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const raw = Number(request.nextUrl.searchParams.get("limit"));
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 100) : 50;
    const jobs = await getReviewQueue().listRecent(limit);
    return NextResponse.json({ jobs });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load reviews";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
