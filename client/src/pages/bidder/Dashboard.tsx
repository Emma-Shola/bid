import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Briefcase, CalendarCheck2, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import type { Application } from "@/lib/types";

function formatDate(value?: string) {
  if (!value) return "—";
  return format(new Date(value), "MMM d, yyyy");
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ApplicationRow({ app }: { app: Application }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3 hover:bg-muted/30 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{app.jobTitle}</p>
        <p className="truncate text-xs text-muted-foreground">{app.company}</p>
      </div>
      <div className="shrink-0 text-right">
        <StatusBadge value={app.status} />
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDate(app.appliedAt ?? app.createdAt ?? app.updatedAt)}
        </p>
      </div>
    </div>
  );
}

export default function BidderDashboard() {
  const { user } = useAuth();

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["applications", "bidder-dashboard"],
    queryFn: () => api.listApplications(),
    enabled: !!user,
    refetchOnMount: "always",
  });

  const interviews = useMemo(
    () => applications.filter((a) => a.status === "interviewed"),
    [applications],
  );

  const stats = useMemo(() => ({
    total: applications.length,
    interviews: interviews.length,
    hired: applications.filter((a) => a.status === "hired").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
  }), [applications, interviews]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="An overview of your applications and interview activity."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total applied" value={stats.total} icon={Briefcase} color="bg-primary/10 text-primary" />
        <StatCard label="Interviews" value={stats.interviews} icon={CalendarCheck2} color="bg-blue-100 text-blue-600" />
        <StatCard label="Hired" value={stats.hired} icon={CheckCircle2} color="bg-emerald-100 text-emerald-600" />
        <StatCard label="Rejected" value={stats.rejected} icon={XCircle} color="bg-red-100 text-red-500" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Places applied to */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">Places applied to</h2>
            <p className="text-xs text-muted-foreground">All companies you have submitted applications to.</p>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {applications.map((app) => (
                <ApplicationRow key={app.id} app={app} />
              ))}
            </div>
          )}
        </section>

        {/* Interviews */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">Interviews had</h2>
            <p className="text-xs text-muted-foreground">Applications that reached the interview stage.</p>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : interviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No interviews recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {interviews.map((app) => (
                <ApplicationRow key={app.id} app={app} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
