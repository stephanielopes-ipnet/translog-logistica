// Limite de tentativas de login erradas por IP, em memória (some ao reiniciar a API; basta
// para este escopo). Só falhas contam: quem acerta não é bloqueado por ter errado antes.
// A memória é limitada: janelas vencidas saem a cada falha registrada e, passando de
// `maxTrackedIps`, os IPs mais antigos são esquecidos (proteção contra muitos IPs diferentes).

export interface LoginLimiter {
  /** O IP já passou do limite na janela atual? */
  isBlocked(ip: string): boolean;
  recordFailure(ip: string): void;
  reset(ip: string): void;
  /** Quantos IPs estão sendo acompanhados agora (para os testes). */
  trackedIps(): number;
}

export interface LoginLimiterOptions {
  maxFailures: number;
  windowMs: number;
  /** Máximo de IPs acompanhados ao mesmo tempo. Padrão 10.000. */
  maxTrackedIps?: number;
  now?: () => number;
}

export function createLoginLimiter({
  maxFailures,
  windowMs,
  maxTrackedIps = 10_000,
  now = Date.now,
}: LoginLimiterOptions): LoginLimiter {
  // Map em ordem de inserção: o primeiro é sempre a janela mais antiga.
  const failures = new Map<string, { count: number; windowStart: number }>();

  function current(ip: string) {
    const entry = failures.get(ip);
    if (entry && now() - entry.windowStart >= windowMs) {
      failures.delete(ip);
      return undefined;
    }
    return entry;
  }

  /** Remove as janelas vencidas (do começo do Map) e os excedentes do teto. */
  function prune() {
    for (const [ip, entry] of failures) {
      if (now() - entry.windowStart < windowMs && failures.size <= maxTrackedIps) {
        break;
      }
      failures.delete(ip);
    }
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
      prune();
    },
    reset: (ip) => {
      failures.delete(ip);
    },
    trackedIps: () => failures.size,
  };
}
