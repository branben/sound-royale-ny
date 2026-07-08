import React from 'react';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HostMigrationIndicatorProps {
  newHostName: string;
  isVisible: boolean;
  className?: string;
}

export const HostMigrationIndicator: React.FC<HostMigrationIndicatorProps> = ({
  newHostName,
  isVisible,
  className,
}) => {
  if (!isVisible) return null;

  return (
    <div
      data-testid="host-migration-indicator"
      className={cn(
        'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 border border-zinc-700 border-l-4 border-l-yellow-500 rounded-lg px-4 py-2 shadow-md animate-in fade-in duration-300',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Crown className="h-5 w-5 text-yellow-500" />
        <span className="text-sm font-semibold text-zinc-100">New host: {newHostName}</span>
      </div>
    </div>
  );
};
