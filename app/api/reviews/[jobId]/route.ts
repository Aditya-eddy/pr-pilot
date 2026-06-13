import { NextResponse } from "next/server";

import { getReviewQueue } from "@/lib/reviews/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { jobId } = await context.params;
  const snapshot = await getReviewQueue().getSnapshot(jobId);

  if (!snapshot) {
    return NextResponse.json(
      { error: "Review job not found or expired." },
      { status: 404 },
    );
  }

  return NextResponse.json(snapshot);
}
