import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CheckCircle, Settings } from 'lucide-react';

interface DiscordProfileCardProps {
  discordUsername: string;
  discordAvatarUrl?: string;
  linkedAt?: string;
  onManage: () => void;
}

export function DiscordProfileCard({
  discordUsername,
  discordAvatarUrl,
  linkedAt,
  onManage,
}: DiscordProfileCardProps) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-[#5865F2]/10 border border-[#5865F2]/30">
      <Avatar className="h-12 w-12 border-2 border-[#5865F2]/50">
        {discordAvatarUrl ? (
          <AvatarImage src={discordAvatarUrl} alt="Discord Avatar" />
        ) : (
          <AvatarFallback className="bg-[#5865F2]/20 text-[#5865F2] font-semibold">
            {discordUsername.charAt(0).toUpperCase()}
          </AvatarFallback>
        )}
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white truncate">{discordUsername}</span>
          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
        </div>
        <p className="text-xs text-gray-400">
