import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export function AuthLayout({
  title,
  subtitle,
  helperText,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  helperText?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Topbrass</span>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-elev-1">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          {helperText && <p className="mt-2 text-xs text-muted-foreground">{helperText}</p>}
          <div className="mt-5">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          By continuing, you agree to our{" "}
          <Link to="#" className="underline-offset-2 hover:underline">Terms</Link> and{" "}
          <Link to="#" className="underline-offset-2 hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
