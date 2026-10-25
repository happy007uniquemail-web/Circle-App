/**
 * utility functions shared across the codebase
 */

export function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}