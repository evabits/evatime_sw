import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reviewSelect, serializeReview } from "@/app/api/reviews/route";
import { MyReviewsClient } from "@/components/reviews/my-reviews-client";

export default async function MyReviewsPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id ?? "";
  const reviews = await prisma.performanceReview.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: reviewSelect,
  });
  return <MyReviewsClient initialReviews={reviews.map(serializeReview)} />;
}
