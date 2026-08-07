import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canLeadStandup } from "@/lib/roles";
import { StandupClient } from "@/components/standup/standup-client";

export default async function StandupPage() {
  const session = await auth();
  if (!canLeadStandup((session?.user as any)?.role ?? "EMPLOYEE")) redirect("/");

  // Het id gaat mee omdat de selectie "wie in beeld" per leider bewaard wordt:
  // vijf mensen mogen de standup leiden en er kan er meer dan één op dezelfde
  // computer inloggen.
  return <StandupClient userId={session!.user!.id!} />;
}
