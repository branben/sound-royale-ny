import { motion, AnimatePresence } from 'framer-motion';

interface ReconnectingBannerProps {
  /** Whether the banner should be shown (during a disconnect→reconnect window). */
  visible: boolean;
}

/**
 * Lightweight banner shown while the WebSocket is reconnecting, so the player
 * knows why the board is momentarily frozen instead of assuming the room hung.
 * Visibility is driven by GameContext's `isReconnecting` state (set on
 * `onDisconnect`, cleared on `onConnect`).
 */
export function ReconnectingBanner({ visible }: ReconnectingBannerProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          data-testid="reconnecting-banner"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.2 }}
          className="fixed top-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-amber-500/90 text-black font-semibold px-4 py-2 rounded-b-lg shadow-lg"
        >
          <span className="inline-block h-3 w-3 rounded-full bg-black/70 animate-pulse" />
          Reconnecting…
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ReconnectingBanner;
