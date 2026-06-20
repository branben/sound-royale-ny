// THROWAWAY PROTOTYPE — Page wrapper around the harness-tab prototype.
// Stripped of any chrome from the real app so the UI variations render in a
// fixed full-screen canvas. Hitting Escape returns to the lobby.

import { useEffect } from 'react';
import HarnessTab from '@/prototypes/harness-tab';

export default function HarnessTabPrototype() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.location.assign('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <HarnessTab />;
}
