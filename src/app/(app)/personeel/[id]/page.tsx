import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { serializeContract, contractSelect } from "@/app/api/contracts/route";
import { ContractsClient } from "@/components/personeel/contracts-client";
import { reviewSelect, serializeReview } from "@/app/api/reviews/route";
import { ReviewsAdminClient } from "@/components/personeel/reviews-admin-client";
import { CommuteTemplateClient } from "@/components/personeel/commute-template-client";

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
      kmTemplates: {
        where: { managedByAdmin: true },
        orderBy: { name: "asc" },
        include: {
          project: { select: { id: true, name: true, customer: { select: { name: true } } } },
          activityType: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!user) notFound();

  const [projects, activityTypes] = await Promise.all([
    prisma.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, customer: { select: { name: true } } },
    }),
    prisma.activityType.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <ContractsClient
        user={{ id: user.id, name: user.name, email: user.email, role: user.role }}
        initialContracts={user.contracts.map(serializeContract)}
      />
      <ReviewsAdminClient userId={user.id} initialReviews={user.reviews.map(serializeReview)} />
      <CommuteTemplateClient
        employeeId={user.id}
        initialTemplates={user.kmTemplates.map((t) => ({ ...t, km: Number(t.km) }))}
        projects={projects}
        activityTypes={activityTypes}
      />
    </div>
  );
}
