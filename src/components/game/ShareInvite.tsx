import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Share2, Check } from 'lucide-react';

interface ShareInviteProps {
  roomCode: string;
  /** Inline icon variant (default) or full button with text */
  variant?: 'icon' | 'button';
  className?: string;
}

/**
 * Copies the room invite URL (?spectator=1) to clipboard.
 * Icon variant: small icon button for inline placement.
 * Button variant: full text button with "Share Invite" label.
 */
export function ShareInvite({ roomCode, variant = 'icon', className }: ShareInviteProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/room/${roomCode}?spectator=1`;

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers/environments without clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }

    setCopied(true);
    toast.success('Invite link copied!');
    setTimeout(() => setCopied(false), 2000);
  }, [roomCode]);

  if (variant === 'button') {
    return (
      <button
        onClick={handleShare}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5',
          'text-xs font-medium text-zinc-300',
          'hover:border-zinc-600 hover:bg-zinc-700 hover:text-zinc-100',
          'active:scale-[0.97] transition-all duration-150',
          className,
        )}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-400" />
        ) : (
          <Share2 className="h-3.5 w-3.5" />
        )}
        {copied ? 'Copied!' : 'Share Invite'}
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      className={cn(
        'inline-flex items-center justify-center rounded-md p-1.5',
        'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
        'active:scale-[0.92] transition-all duration-150',
        className,
      )}
      title="Copy invite link"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-400" />
      ) : (
        <Share2 className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
