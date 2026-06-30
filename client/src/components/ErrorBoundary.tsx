import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-12 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Something went wrong on this page.</p>
              {this.state.error?.message && (
                <p className="max-w-sm text-xs text-muted-foreground">{this.state.error.message}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={this.reset}>
              Try again
            </Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
