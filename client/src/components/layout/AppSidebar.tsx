import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Bell,
  Sparkles,
  Users,
  CreditCard,
  BarChart3,
  ShieldCheck,
  ScrollText,
  Cpu,
  UserCheck,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const groups: Record<Role, { label: string; items: NavItem[] }[]> = {
  bidder: [
    {
      label: "Workspace",
      items: [
        { to: "/bidder", label: "Dashboard", icon: LayoutDashboard },
        { to: "/bidder/applications", label: "Applications", icon: FileText },
        { to: "/bidder/resume", label: "Resume generator", icon: Sparkles },
        { to: "/bidder/notifications", label: "Notifications", icon: Bell },
      ],
    },
  ],
  manager: [
    {
      label: "Workspace",
      items: [
        { to: "/manager", label: "Overview", icon: LayoutDashboard },
        { to: "/manager/applications", label: "Applications", icon: FileText },
        { to: "/manager/payments", label: "Payments", icon: CreditCard },
        { to: "/manager/analytics", label: "Analytics", icon: BarChart3 },
        { to: "/manager/bidders", label: "Bidders", icon: Users },
        { to: "/manager/resumes", label: "Resumes", icon: FileText },
        { to: "/manager/notifications", label: "Notifications", icon: Bell },
      ],
    },
  ],
  admin: [
    {
      label: "Operations",
      items: [
        { to: "/admin", label: "Overview", icon: LayoutDashboard },
        { to: "/admin/approvals", label: "Pending approvals", icon: UserCheck },
        { to: "/admin/users", label: "Users", icon: Users },
      ],
    },
    {
      label: "System",
      items: [
        { to: "/admin/audit", label: "Audit logs", icon: ScrollText },
        { to: "/admin/jobs", label: "Background jobs", icon: Cpu },
        { to: "/admin/monitor", label: "Live monitor", icon: Activity },
      ],
    },
  ],
};

export function AppSidebar({ role }: { role: Role }) {
  const location = useLocation();
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-white">Topbrass</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups[role].map((g) => (
          <div key={g.label} className="mb-4">
            <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
              {g.label}
            </p>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active =
                  location.pathname === item.to ||
                  (item.to !== `/${role}` && location.pathname.startsWith(item.to));
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === `/${role}`}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent text-white"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white",
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <p className="text-2xs text-sidebar-foreground/60">Topbrass | v1.0</p>
      </div>
    </aside>
  );
}

