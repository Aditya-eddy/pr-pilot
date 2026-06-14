import { NextResponse } from "next/server";

import { getReviewQueue } from "@/lib/reviews/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const jobs = await getReviewQueue().getAllActive();
    return NextResponse.json({ jobs });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load active reviews";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
