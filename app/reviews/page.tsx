import type { ReactElement } from "react";

import { ReviewsBoard } from "@/components/reviews-board";

export const dynamic = "force-dynamic";

export default function ReviewsPage(): ReactElement {
  return <ReviewsBoard />;
}
