import { X, Bell, CheckCheck, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/lib/types";

export function NotificationsDrawer({
  open,
  notifications,
  onClose,
  onMarkRead,
  onMarkAll,
  onOpenNotification,
}: {
  open: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAll: () => void;
  onOpenNotification: (link?: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close notifications"
        className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col border-l border-border bg-card shadow-2xl max-sm:max-w-full">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">Live updates from the app.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onMarkAll} disabled={notifications.length === 0}>
              <CheckCheck className="mr-1.5 h-4 w-4" />
              Mark all read
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close notifications">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {notifications.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              <div className="space-y-2">
                <Bell className="mx-auto h-5 w-5" />
                <p>No notifications yet.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={cn(
                    "w-full rounded-lg border border-border bg-background p-4 text-left transition hover:border-primary/40 hover:bg-primary/5",
                    !notification.read && "ring-1 ring-primary/20",
                  )}
                  onClick={() => {
                    if (!notification.read) {
                      onMarkRead(notification.id);
                    }
                    onOpenNotification(notification.link);
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                        notification.type === "success" && "bg-[hsl(var(--success))]",
                        notification.type === "warning" && "bg-[hsl(var(--warning))]",
                        notification.type === "error" && "bg-[hsl(var(--destructive))]",
                        notification.type === "info" && "bg-[hsl(var(--info))]",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{notification.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                        </div>
                        {notification.link && <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
