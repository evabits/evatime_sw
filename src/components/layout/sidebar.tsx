"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Clock,
  Car,
  FolderOpen,
  Users,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/time", label: "Uren", icon: Clock },
  { href: "/km", label: "Kilometers", icon: Car },
  { href: "/reports", label: "Rapporten", icon: BarChart3 },
  { href: "/customers", label: "Klanten", icon: Users },
  { href: "/projects", label: "Projecten", icon: FolderOpen },
  { href: "/activity-types", label: "Activiteiten", icon: Activity },
  { href: "/invoices", label: "Facturen", icon: FileText },
  { href: "/settings", label: "Instellingen", icon: Settings },
];

interface SidebarProps {
  user: { name?: string | null; email?: string | null };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-card border-r flex flex-col h-full shrink-0">
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold text-primary">EvaTime</h1>
        <p className="text-xs text-muted-foreground mt-1">Tijdregistratie</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t">
        <div className="mb-2 px-3">
          <p className="text-sm font-medium truncate">{user.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" />
          Uitloggen
        </Button>
      </div>
    </aside>
  );
}
