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
  className
}) => {
  if (!isVisible) return null;

  return (
    <div 
      data-testid="host-migration-indicator"
      className={cn(
        "fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-[#EAB308]/10 border-2 border-[#EAB308]/50 rounded-lg px-4 py-2 animate-in slide-in-from-top duration-500",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Crown className="h-5 w-5 text-[#EAB308] animate-pulse" />
        <span className="text-sm font-semibold text-[#EAB308]">
          New host: {newHostName}
        </span>
      </div>
    </div>
  );
};
