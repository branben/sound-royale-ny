import React from 'react';
import { WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReconnectingBannerProps {
  isVisible: boolean;
  className?: string;
}

export const ReconnectingBanner: React.FC<ReconnectingBannerProps> = ({ isVisible, className }) => {
  if (!isVisible) return null;

  return (
    <div
      data-testid="reconnecting-banner"
      role="status"
      aria-live="polite"
      className={cn(
        'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 shadow-md animate-in fade-in duration-300',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <WifiOff className="h-5 w-5 text-amber-500" />
        <span className="text-sm font-semibold text-zinc-100">Reconnecting…</span>
      </div>
    </div>
  );
};
