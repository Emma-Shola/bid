import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { ChartCard } from "@/components/ChartCard";
import type { Application } from "@/lib/types";

const colors: Record<string, string> = {
  submitted: "hsl(var(--info))",
  reviewed: "hsl(var(--info))",
  interviewed: "hsl(var(--warning))",
  hired: "hsl(var(--success))",
  rejected: "hsl(var(--destructive))",
};

export default function Analytics() {
  const { data: stats } = useQuery({ queryKey: ["bidder-stats"], queryFn: api.bidderStats });
  const { data: applications = [] } = useQuery({ queryKey: ["applications"], queryFn: () => api.listApplications() });

  const statusCounts = applications.reduce<Record<string, number>>((acc, application) => {
    acc[application.status] = (acc[application.status] ?? 0) + 1;
    return acc;
  }, {});

  const chartData = Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
    fill: colors[status] ?? "hsl(var(--primary))",
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="Application performance and conversion trends." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Applications" value={stats?.totals.applications ?? "—"} />
        <StatCard label="Interviews" value={stats?.totals.interviews ?? "—"} />
        <StatCard label="Offers" value={stats?.totals.offers ?? "—"} />
        <StatCard label="Rejected" value={stats?.totals.rejected ?? "—"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Status mix" description="Current application distribution">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="status" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Weekly activity" description="Applications submitted by week">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats?.weekly ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
              <Tooltip />
              <Bar dataKey="applications" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
