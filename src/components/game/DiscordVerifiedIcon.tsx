import { BadgeCheck } from 'lucide-react';

interface DiscordVerifiedIconProps {
  username?: string;
}

export function DiscordVerifiedIcon({ username }: DiscordVerifiedIconProps) {
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#5865F2]/20 text-[#93A4FF]"
      title={username ? `Verified Discord: ${username}` : 'Verified Discord'}
      aria-label={username ? `Verified Discord: ${username}` : 'Verified Discord'}
    >
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}
