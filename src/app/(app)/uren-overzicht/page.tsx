import { auth } from "@/lib/auth";
import { HoursOverviewClient } from "@/components/hours-overview/hours-overview-client";

export default async function UrenOverzichtPage() {
  const session = await auth();
  const currentUser = session?.user as any;
  const isAdmin = currentUser?.role === "ADMIN";

  return <HoursOverviewClient isAdmin={isAdmin} />;
}
