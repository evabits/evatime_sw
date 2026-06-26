import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PayrollClient } from "@/components/payroll/payroll-client";

export default async function PayrollPage() {
  const session = await auth();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  if (!isAdmin) redirect("/");

  return <PayrollClient />;
}
