import { ReviewSession } from "@/components/review-session";

interface ReviewPageProps {
  params: Promise<{ jobId: string }>;
}

export default async function ReviewPage({
  params,
}: ReviewPageProps): Promise<React.ReactElement> {
  const { jobId } = await params;
  return <ReviewSession jobId={jobId} />;
}
