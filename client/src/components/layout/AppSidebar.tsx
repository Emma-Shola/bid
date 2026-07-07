import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  LogIn,
  LogOut,
  Clock,
  Timer,
  TrendingUp,
  Building2,
  ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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
        { to: "/bidder/resume", label: "Resume generator", icon: Sparkles },
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
        { to: "/manager/resume-activity", label: "Resume activity", icon: Sparkles },
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
        { to: "/admin/resume-builder", label: "Resume converter", icon: FileText },
        { to: "/admin/time-tracking", label: "Time tracking", icon: Timer },
        { to: "/admin/bidder-bids", label: "Bidder bids", icon: TrendingUp },
      ],
    },
    {
      label: "System",
      items: [
        { to: "/admin/audit", label: "Audit logs", icon: ScrollText },
        { to: "/admin/jobs", label: "Background jobs", icon: Cpu },
      ],
    },
  ],
};

function WorkspaceSwitcher() {
  const { user, refresh } = useAuth();
  const queryClient = useQueryClient();

  const { data: clients = [] } = useQuery({
    queryKey: ["bidder-clients"],
    queryFn: api.bidderClients,
    enabled: user?.role === "bidder",
    retry: false,
    refetchOnMount: "always",
  });

  const switchWorkspace = useMutation({
    mutationFn: api.switchWorkspace,
    onSuccess: async () => {
      // Refresh auth so user.managerId updates, then invalidate all workspace queries
      await refresh();
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["bidder-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["bidder-clients"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to switch workspace"),
  });

  if (clients.length <= 1) return null;

  return (
    <div className="border-b border-sidebar-border px-3 py-3">
      <div className="flex items-center gap-1.5 mb-2">
        <ChevronsUpDown className="h-3 w-3 text-sidebar-foreground/50" />
        <span className="text-2xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
          Client Workspace
        </span>
      </div>
      <div className="space-y-0.5">
        {clients.map((client) => {
          const active = client.isActive;
          return (
            <button
              key={client.managerId}
              onClick={() => {
                if (!active && !switchWorkspace.isPending) {
                  switchWorkspace.mutate(client.managerId);
                }
              }}
              disabled={switchWorkspace.isPending}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors disabled:opacity-60",
                active
                  ? "bg-sidebar-accent text-white"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white cursor-pointer"
              )}
            >
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate text-left">{client.managerName}</span>
              {active && <div className="h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatElapsed(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function ClockWidget() {
  const queryClient = useQueryClient();
  const [elapsed, setElapsed] = useState(0);

  const { data: status, isFetched } = useQuery({
    queryKey: ["clock-status"],
    queryFn: api.clockStatus,
    refetchOnMount: "always",
    retry: false,
    staleTime: 0,
  });

  // Derive clockedInAt only once the server response has landed.
  // While still loading (isFetched=false) keep whatever elapsed was —
  // avoids a 00:00:00 flash on page load/refresh while the fetch is in flight.
  const clockedInAt = status?.isClockedIn ? status.activeEntry?.clockedInAt : null;
  useEffect(() => {
    if (!clockedInAt) {
      if (isFetched) setElapsed(0); // only reset once we KNOW the user isn't clocked in
      return;
    }
    const start = new Date(clockedInAt).getTime();
    setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    const id = setInterval(
      () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000))),
      1000
    );
    return () => clearInterval(id);
  }, [clockedInAt, isFetched]);

  const clockIn = useMutation({
    mutationFn: api.clockIn,
    onSuccess: (data) => {
      // Update cache immediately — no waiting for refetch
      queryClient.setQueryData(["clock-status"], {
        isClockedIn: true,
        activeEntry: { id: data.id, clockedInAt: data.clockedInAt },
      });
      toast.success("Clocked in");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to clock in"),
  });

  const clockOut = useMutation({
    mutationFn: api.clockOut,
    onSuccess: () => {
      queryClient.setQueryData(["clock-status"], {
        isClockedIn: false,
        activeEntry: null,
      });
      toast.success("Clocked out");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to clock out"),
  });

  const isClockedIn = status?.isClockedIn ?? false;
  const busy = clockIn.isPending || clockOut.isPending;

  return (
    <div className="border-t border-sidebar-border px-3 pt-3 pb-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors",
              isClockedIn ? "bg-green-400 animate-pulse" : "bg-sidebar-foreground/30"
            )}
          />
          <span className="text-2xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            {isClockedIn ? "On clock" : "Off clock"}
          </span>
        </div>
        {isClockedIn && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-green-400" />
            <span className="text-xs font-mono text-green-400 tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          </div>
        )}
      </div>

      <button
        onClick={() => (isClockedIn ? clockOut.mutate() : clockIn.mutate())}
        disabled={busy}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
          isClockedIn
            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
            : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
        )}
      >
        {isClockedIn ? (
          <>
            <LogOut className="h-3.5 w-3.5" />
            {busy ? "Clocking out…" : "Clock Out"}
          </>
        ) : (
          <>
            <LogIn className="h-3.5 w-3.5" />
            {busy ? "Clocking in…" : "Clock In"}
          </>
        )}
      </button>
    </div>
  );
}

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

      {role === "bidder" && <WorkspaceSwitcher />}

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
                          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white"
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

      {role === "bidder" && <ClockWidget />}

      <div className="border-t border-sidebar-border p-3">
        <p className="text-2xs text-sidebar-foreground/60">Topbrass | v1.0</p>
      </div>
    </aside>
  );
}
