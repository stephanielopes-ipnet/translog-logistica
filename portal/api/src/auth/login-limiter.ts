// Limite de tentativas de login erradas por IP, em memória (some ao reiniciar a API; basta
// para este escopo). Só falhas contam: quem acerta não é bloqueado por ter errado antes.

export interface LoginLimiter {
  /** O IP já passou do limite na janela atual? */
  isBlocked(ip: string): boolean;
  recordFailure(ip: string): void;
  reset(ip: string): void;
}

export interface LoginLimiterOptions {
  maxFailures: number;
  windowMs: number;
  now?: () => number;
}

export function createLoginLimiter({
  maxFailures,
  windowMs,
  now = Date.now,
}: LoginLimiterOptions): LoginLimiter {
  const failures = new Map<string, { count: number; windowStart: number }>();

  function current(ip: string) {
    const entry = failures.get(ip);
    if (entry && now() - entry.windowStart >= windowMs) {
      failures.delete(ip);
      return undefined;
    }
    return entry;
  }

  return {
    isBlocked: (ip) => (current(ip)?.count ?? 0) >= maxFailures,
    recordFailure(ip) {
      const entry = current(ip);
      if (entry) {
        entry.count++;
      } else {
        failures.set(ip, { count: 1, windowStart: now() });
      }
    },
    reset: (ip) => {
      failures.delete(ip);
    },
  };
}
