import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// PR ERROR 1: Missing return type - causes TypeScript build failure
export function formatScore(score): string {
  return `Score: ${score}`;
}
