import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string; reason?: string } };
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expired = location.state?.reason === "session-expired";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      const home = user.role === "admin" ? "/admin" : user.role === "manager" ? "/manager" : "/bidder";
      navigate(location.state?.from ?? home, { replace: true });
    } catch (err) {
      const msg = (err as Error).message.toLowerCase();
      if (msg.includes("pending")) {
        navigate("/pending", { replace: true });
      } else {
        setError("Invalid username or password.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in to Topbrass"
      subtitle="Access your role-based workspace."
      helperText={expired ? "Your session expired. Please sign in again." : "Use your assigned username and password."}
      footer={
        <span>
          New to Topbrass?{" "}
          <Link to="/register" className="font-medium text-foreground underline-offset-2 hover:underline">
            Create an account
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p className="rounded-md bg-[hsl(var(--destructive)/0.08)] px-3 py-2 text-xs text-[hsl(var(--destructive))]">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
