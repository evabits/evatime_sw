"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Clock,
  Car,
  Receipt,
  FolderOpen,
  Users,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Activity,
  UserCog,
  Tag,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
}

interface NavGroup {
  label?: string;
  roles?: string[];
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/time", label: "Uren", icon: Clock },
      { href: "/km", label: "Kilometers", icon: Car },
      { href: "/expenses", label: "Uitgaven", icon: Receipt },
      { href: "/invoices", label: "Facturen", icon: FileText, roles: ["ADMIN", "FINANCE"] },
      { href: "/quotes", label: "Offertes", icon: ClipboardList, roles: ["ADMIN"] },
      { href: "/reports", label: "Rapporten", icon: BarChart3, roles: ["ADMIN"] },
    ],
  },
  {
    label: "Beheer",
    roles: ["ADMIN"],
    items: [
      { href: "/customers", label: "Klanten", icon: Users },
      { href: "/projects", label: "Projecten", icon: FolderOpen },
      { href: "/activity-types", label: "Activiteiten", icon: Activity },
      { href: "/expense-categories", label: "Uitgavencategorieën", icon: Tag },
      { href: "/users", label: "Gebruikers", icon: UserCog },
      { href: "/settings", label: "Instellingen", icon: Settings },
    ],
  },
];

interface SidebarProps {
  user: { name?: string | null; email?: string | null };
  role: string;
}

export function Sidebar({ user, role }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-card border-r flex flex-col h-full shrink-0">
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold text-primary">EvaTime</h1>
        <p className="text-xs text-muted-foreground mt-1">Tijdregistratie</p>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto space-y-4">
        {navGroups.map((group, gi) => {
          if (group.roles && !group.roles.includes(role)) return null;

          const visibleItems = group.items.filter(
            (item) => !item.roles || item.roles.includes(role)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={gi}>
              {group.label && (
                <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {visibleItems.map((item) => {
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
              </div>
            </div>
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
