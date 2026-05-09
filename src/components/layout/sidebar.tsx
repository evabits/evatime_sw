"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  CalendarCheck,
  Menu,
  X,
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
      { href: "/uren-overzicht", label: "Uren Overzicht", icon: CalendarCheck },
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const close = () => setMobileOpen(false);

  return (
    <>
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-card border-b flex items-center px-4 gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Image src="/logo.png" alt="EvaTime" width={100} height={34} className="object-contain" priority />
      </header>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed md:static inset-y-0 left-0 z-50 md:z-auto w-64 bg-card border-r flex flex-col h-full shrink-0 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-5 border-b flex items-center justify-between">
          <Image src="/logo.png" alt="EvaTime" width={110} height={37} className="object-contain" priority />
          <button
            onClick={close}
            className="md:hidden p-1 rounded-md text-muted-foreground hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
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
                        onClick={close}
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
    </>
  );
}
