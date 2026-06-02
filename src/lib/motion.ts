import type { Transition, Variants } from 'framer-motion';

export const transitions = {
  spring: { type: 'spring' as const, stiffness: 300, damping: 25 },
  springBouncy: { type: 'spring' as const, stiffness: 400, damping: 15 },
  smooth: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  slow: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  dramatic: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
} satisfies Record<string, Transition>;

export const variants: Record<string, Variants> = {
  fadeIn: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slideUp: {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  },
  scaleIn: {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
  },
  slideInRight: {
    hidden: { opacity: 0, x: 30 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  },
  slideInLeft: {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20, height: 0, marginBottom: 0 },
  },
  slotMachine: {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
    exit: { y: -20, opacity: 0 },
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

export const hover = {
  subtle: { scale: 1.02 },
  medium: { scale: 1.04 },
  playful: { scale: 1.06, rotateZ: 2 },
  tap: { scale: 0.97 },
};

export const reducedMotion = {
  transition: { duration: 0 },
  initial: false,
  animate: undefined,
};
