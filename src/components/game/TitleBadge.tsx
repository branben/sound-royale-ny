import { Gem, ShieldCheck, Sparkles } from 'lucide-react';
import { Player } from '@/types/game';
import { cn } from '@/lib/utils';

interface TitleBadgeProps {
  title?: Player['currentTitle'];
  compact?: boolean;
}

const titleConfig = {
  JACKPOT: {
    label: 'Jackpot',
    description: 'Jackpot title',
    Icon: Gem,
    className: 'border-yellow-500/40 bg-yellow-500/15 text-yellow-300',
  },
  SWEEPER: {
    label: 'Sweeper',
    description: 'Sweeper title',
    Icon: Sparkles,
    className: 'border-red-500/40 bg-red-500/15 text-red-300',
  },
  CHECKED_IN: {
    label: 'Checked In',
    description: 'Checked In title',
    Icon: ShieldCheck,
    className: 'border-blue-500/40 bg-blue-500/15 text-blue-300',
  },
} as const;

export function TitleBadge({ title, compact = false }: TitleBadgeProps) {
  if (!title || title === 'NONE') return null;

  const config = titleConfig[title];
  if (!config) return null;

  const Icon = config.Icon;
  return (
    <span
      aria-label={config.description}
      title={config.description}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded border font-medium leading-none',
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
        config.className
      )}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      <span>{compact ? config.label.split(' ')[0] : config.label}</span>
    </span>
  );
}
