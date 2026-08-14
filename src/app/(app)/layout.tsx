import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { impersonationFromSession } from "@/lib/impersonation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const impersonating = impersonationFromSession(session);

  return (
    <div className="flex h-full">
      <Sidebar user={session.user ?? {}} role={(session.user as any)?.role ?? "EMPLOYEE"} />
      <main className="flex-1 overflow-auto bg-muted/30 pt-14 md:pt-0">
        {impersonating && (
          <ImpersonationBanner
            naam={session.user?.name ?? ""}
            realName={impersonating.realName}
          />
        )}
        <div className="container mx-auto p-6 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
