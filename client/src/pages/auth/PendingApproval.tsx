import { Link, useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export default function PendingApproval() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <AuthLayout
      title="Awaiting approval"
      subtitle="Your account has been created and is waiting for an administrator to review it."
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--warning)/0.15)]">
            <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
          </div>
          <div className="text-sm text-muted-foreground">
            You will receive access once an admin approves your account.
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              void logout().finally(() => navigate("/login"));
            }}
          >
            Back to sign in
          </Button>
          <Button asChild className="w-full">
            <Link to="mailto:support@topbrass.app">Contact support</Link>
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
