import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

export function RequireAuth({
  roles,
  children,
}: {
  roles?: Role[];
  children: React.ReactNode;
}) {
  const { user, loading, sessionExpired } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        state={{
          from: location.pathname,
          reason: sessionExpired ? "session-expired" : undefined,
        }}
        replace
      />
    );
  }

  if (user.status === "pending") {
    return <Navigate to="/pending" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    const home =
      user.role === "admin" ? "/admin" : user.role === "manager" ? "/manager" : "/bidder";
    return <Navigate to={home} replace />;
  }

  return <>{children}</>;
}
