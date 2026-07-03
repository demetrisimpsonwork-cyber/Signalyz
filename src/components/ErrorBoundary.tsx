import { Component, type ReactNode, type ErrorInfo } from "react";
import { Button } from "@/components/ui/button";
import { trackReliabilityError } from "@/lib/analytics";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

function sanitizeComponentHint(info: ErrorInfo): string | undefined {
  const line = info.componentStack
    ?.split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("at ") && !entry.includes("ErrorBoundary"));
  if (!line) return undefined;
  return line.slice(0, 160);
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const componentHint = sanitizeComponentHint(info);
    console.error(
      "Application error:",
      error.name,
      error.message,
      componentHint ? `(near ${componentHint})` : "",
    );
    try {
      trackReliabilityError("unexpected_error", error.name, {
        feature_name: "error_boundary",
        output_type: componentHint,
      });
    } catch {
      /* analytics must never throw */
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-center space-y-4 max-w-md px-6">
            <h1 className="text-2xl font-bold text-foreground">This page didn't load correctly</h1>
            <p className="text-sm text-muted-foreground">
              Something unexpected happened. Refreshing the page usually fixes it. If it keeps happening, email{" "}
              <a href="mailto:support@signalyz.ai" className="text-primary hover:underline">support@signalyz.ai</a>.
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.href = "/";
              }}
            >
              Return Home
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
