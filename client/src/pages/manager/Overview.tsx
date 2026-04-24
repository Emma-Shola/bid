import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { ChartCard } from "@/components/ChartCard";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import type { Application } from "@/lib/types";

export default function ManagerOverview() {
  const navigate = useNavigate();
  const { data: stats } = useQuery({ queryKey: ["bidder-stats"], queryFn: api.bidderStats });
  const { data: report } = useQuery({ queryKey: ["payments-report"], queryFn: api.paymentsReport });
  const { data: applications = [] } = useQuery({ queryKey: ["applications"], queryFn: () => api.listApplications() });

  const recent = [...applications].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 8);

  const columns: Column<Application>[] = [
    { key: "bidder", header: "Bidder", cell: (row) => <span className="font-medium">{row.bidderName}</span> },
    { key: "company", header: "Company", cell: (row) => row.company },
    { key: "title", header: "Role", cell: (row) => <span className="text-muted-foreground">{row.jobTitle}</span> },
    { key: "status", header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
    { key: "updated", header: "Updated", cell: (row) => <span className="tabular-nums text-muted-foreground">{format(new Date(row.updatedAt), "MMM d, HH:mm")}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Pipeline health, payouts, and recent activity." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Applications" value={stats?.totals.applications ?? "—"} hint="All bidders" />
        <StatCard label="Interviews" value={stats?.totals.interviews ?? "—"} />
        <StatCard label="Offers" value={stats?.totals.offers ?? "—"} trend={{ value: "+3 wk", positive: true }} />
        <StatCard
          label="Payouts paid"
          value={`$${(report?.paid ?? 0).toLocaleString()}`}
          hint={`$${(report?.pending ?? 0).toLocaleString()} pending`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Weekly applications" description="Last 8 weeks" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats?.weekly ?? []} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Area type="monotone" dataKey="applications" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#g1)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <div className="space-y-3">
          <StatCard label="Conversion" value={`${stats ? Math.round(((stats.totals.offers || 0) / Math.max(stats.totals.applications, 1)) * 100) : 0}%`} hint="Offers / applications" />
          <StatCard label="Active pipeline" value={applications.filter((application) => ["submitted", "reviewed", "interviewed"].includes(application.status)).length} />
          <StatCard label="Completed hires" value={applications.filter((application) => application.status === "hired").length} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Recent activity</h2>
        <DataTable
          data={recent}
          columns={columns}
          rowKey={(row) => row.id}
          searchable={false}
          pageSize={8}
          onRowClick={(row) => navigate(`/manager/applications?focus=${row.id}`)}
        />
      </div>
    </div>
  );
}
