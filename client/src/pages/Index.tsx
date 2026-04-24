import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const Index = () => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.status === "pending") return <Navigate to="/pending" replace />;
  const home = user.role === "admin" ? "/admin" : user.role === "manager" ? "/manager" : "/bidder";
  return <Navigate to={home} replace />;
};

export default Index;
