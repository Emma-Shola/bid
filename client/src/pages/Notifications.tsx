import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Notifications() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["notifications"], queryFn: api.listNotifications });
  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const dot = {
    info: "bg-[hsl(var(--info))]",
    success: "bg-[hsl(var(--success))]",
    warning: "bg-[hsl(var(--warning))]",
    error: "bg-[hsl(var(--destructive))]",
  } as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Realtime alerts about applications, approvals, payments, and jobs."
        actions={
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <CheckCheck className="mr-1.5 h-4 w-4" />
            Mark all read
          </Button>
        }
      />
      {isLoading ? (
        <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">Loading...</div>
      ) : data.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="You're all caught up." />
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-card">
          {data.map((notification) => (
            <li
              key={notification.id}
              className={cn(
                "flex items-start gap-3 border-b border-border p-4 last:border-b-0",
                !notification.read && "bg-primary-muted/40",
              )}
            >
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot[notification.type])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{notification.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{notification.body}</p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                </p>
              </div>
              {!notification.read && (
                <Button size="sm" variant="ghost" onClick={() => markRead.mutate(notification.id)}>
                  Mark read
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
