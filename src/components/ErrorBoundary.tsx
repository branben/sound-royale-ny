import React, { Component, ReactNode } from 'react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const ERROR_LOG_KEY = 'error_log';
const MAX_ERRORS = 50;

interface Props {
  children: ReactNode;
}

interface ErrorEntry {
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function loadErrorLog(): ErrorEntry[] {
  try {
    const raw = localStorage.getItem(ERROR_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistError(entry: ErrorEntry) {
  const log = loadErrorLog();
  log.unshift(entry);
  if (log.length > MAX_ERRORS) log.length = MAX_ERRORS;
  localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(log));
}

export function getErrorLog(): ErrorEntry[] {
  return loadErrorLog();
}

export function clearErrorLog() {
  localStorage.removeItem(ERROR_LOG_KEY);
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const entry: ErrorEntry = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
      timestamp: new Date().toISOString(),
    };
    persistError(entry);
    toast.error('An unexpected error occurred', {
      description: error.message,
      duration: 5000,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-4">
          <Alert variant="destructive" className="max-w-md">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <p className="text-sm opacity-80">
                {this.state.error?.message || 'An unexpected error occurred.'}
              </p>
              <Button variant="outline" size="sm" onClick={this.handleRetry}>
                <RotateCcw className="mr-2 h-3 w-3" />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}
