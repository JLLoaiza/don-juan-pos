/** Caps exponential retries so a failed printer does not create a hot loop. */
export function retryDelaySeconds(attempts: number): number {
  const normalizedAttempts = Math.max(attempts, 0);
  return normalizedAttempts >= 9 ? 300 : 2 ** normalizedAttempts;
}
