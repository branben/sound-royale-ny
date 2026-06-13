import type { Transition, Variants } from 'framer-motion';

/**
 * Sound Royale Animation System.
 * All animations communicate state changes — decoration or looping is banned.
 * Everything gated behind prefers-reduced-motion via CSS (index.css).
 */

export const transitions = {
  spring: { type: 'spring' as const, stiffness: 300, damping: 25 },
  springBouncy: { type: 'spring' as const, stiffness: 400, damping: 15 },
  smooth: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  slow: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
} satisfies Record<string, Transition>;

export const variants: Record<string, Variants> = {
  fadeIn: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slideUp: {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  },
  scaleIn: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
  },
  slideInLeft: {
    hidden: { opacity: 0, x: -12 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 12, height: 0, marginBottom: 0 },
  },
};

export const stagger = {
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06 } },
    exit: { transition: { staggerChildren: 0.03 } },
  },
  containerSlow: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
    exit: { transition: { staggerChildren: 0.05 } },
  },
};

/**
 * Hover effects — ONLY scale changes. No rotateZ, no rotate, no skew.
 * Animations communicate state changes, not decoration.
 */
export const hover = {
  subtle: { scale: 1.02 },
  medium: { scale: 1.04 },
  tap: { scale: 0.97 },
};
