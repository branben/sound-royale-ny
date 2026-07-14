import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectionErrorBannerProps {
  message: string | null;
  className?: string;
}

/**
 * Persistent, non-dismissing banner shown when the WebSocket connection has
 * errored out (and reconnect attempts have failed). Replaces the previous
 * behavior where WS errors were only logged to the console and never surfaced
 * to the user. The user keeps playing; the banner stays until the socket
 * recovers.
 */
export const ConnectionErrorBanner: React.FC<ConnectionErrorBannerProps> = ({
  message,
  className,
}) => {
  if (!message) return null;

  return (
    <div
      data-testid="connection-error-banner"
      role="alert"
      aria-live="assertive"
      className={cn(
        'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-destructive border border-destructive-foreground/20 rounded-lg px-4 py-2 shadow-lg animate-in fade-in duration-300 max-w-[90vw]',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-destructive-foreground" />
        <span className="text-sm font-semibold text-destructive-foreground">
          {message}
        </span>
      </div>
    </div>
  );
};
