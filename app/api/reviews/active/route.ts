import { NextResponse } from "next/server";

import { listOpenPullRequests } from "@/lib/pull-requests";
import { getReviewQueue } from "@/lib/reviews/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const pullRequests = await listOpenPullRequests();
    const jobs = await getReviewQueue().getActive(
      pullRequests.pullRequests,
    );
    return NextResponse.json({ jobs });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load active reviews";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
