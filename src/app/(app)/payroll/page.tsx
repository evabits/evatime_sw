import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PayrollClient } from "@/components/payroll/payroll-client";

export default async function PayrollPage() {
  const session = await auth();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  if (!isAdmin) redirect("/");

  // Het id gaat mee omdat de selectie "wie in beeld" per admin bewaard wordt:
  // vier mensen zijn admin en er kan er meer dan één op dezelfde computer
  // inloggen.
  return <PayrollClient userId={session!.user!.id!} />;
}
