import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { NotificationsDrawer } from "./NotificationsDrawer";
import { useChannel } from "@/lib/realtime";

export function AppShell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { data: notifications = [] } = useQuery({ queryKey: ["notifications"], queryFn: api.listNotifications });
  const unread = notifications.filter((notification) => !notification.read).length;

  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useChannel("notification.created", () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
  });

  useEffect(() => {
    setNotificationsOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  return (
    <div className="flex h-screen w-full bg-surface">
      <AppSidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          unread={unread}
          onToggleNotifications={() => setNotificationsOpen((current) => !current)}
          notificationsOpen={notificationsOpen}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
        <NotificationsDrawer
          open={notificationsOpen}
          notifications={notifications}
          onClose={() => setNotificationsOpen(false)}
          onMarkRead={(id) => markRead.mutate(id)}
          onMarkAll={() => markAll.mutate()}
          onOpenNotification={(link) => {
            setNotificationsOpen(false);
            if (link) navigate(link);
          }}
        />
      </div>
    </div>
  );
}
