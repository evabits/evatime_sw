import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { serializeContract, contractSelect } from "@/app/api/contracts/route";
import { ContractsClient } from "@/components/personeel/contracts-client";
import { reviewSelect, serializeReview } from "@/app/api/reviews/route";
import { ReviewsAdminClient } from "@/components/personeel/reviews-admin-client";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true,
      contracts: { orderBy: [{ startDate: "desc" }, { createdAt: "desc" }], select: contractSelect },
      reviews: { orderBy: { createdAt: "desc" }, select: reviewSelect },
    },
  });
  if (!user) notFound();

  return (
    <div className="space-y-8">
      <ContractsClient
        user={{ id: user.id, name: user.name, email: user.email, role: user.role }}
        initialContracts={user.contracts.map(serializeContract)}
      />
      <ReviewsAdminClient userId={user.id} initialReviews={user.reviews.map(serializeReview)} />
    </div>
  );
}
