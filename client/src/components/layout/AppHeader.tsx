import { useNavigate } from "react-router-dom";
import { Bell, LogOut, User as UserIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { StatusBadge } from "@/components/StatusBadge";
import { useChannel } from "@/lib/realtime";

export function AppHeader({
  unread,
  onToggleNotifications,
  notificationsOpen,
}: {
  unread: number;
  onToggleNotifications: () => void;
  notificationsOpen: boolean;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useChannel("notification.created", () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
  });
  useChannel("user.created", () => {
    qc.invalidateQueries({ queryKey: ["pending-users"] });
    qc.invalidateQueries({ queryKey: ["users"] });
  });
  useChannel("user.approved", () => {
    qc.invalidateQueries({ queryKey: ["pending-users"] });
    qc.invalidateQueries({ queryKey: ["users"] });
  });

  if (!user) return null;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold capitalize text-foreground">{user.role} workspace</span>
        <StatusBadge value={user.status} />
      </div>
      <div className="flex items-center gap-2">
        <ConnectionIndicator className="hidden sm:inline-flex" />
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => {
            if (notificationsOpen) {
              onToggleNotifications();
              return;
            }
            onToggleNotifications();
          }}
          aria-label="Notifications"
          aria-pressed={notificationsOpen}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(var(--destructive))] px-1 text-[10px] font-medium text-white">
              {unread}
            </span>
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                {(user.name || user.username || "U")
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span className="hidden text-sm sm:inline">{user.name || user.username}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user.name || user.username}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <UserIcon className="mr-2 h-4 w-4" />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void logout().finally(() => navigate("/login"));
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
