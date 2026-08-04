import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canLeadStandup } from "@/lib/roles";
import { StandupClient } from "@/components/standup/standup-client";

export default async function StandupPage() {
  const session = await auth();
  if (!canLeadStandup((session?.user as any)?.role ?? "EMPLOYEE")) redirect("/");

  return <StandupClient />;
}
