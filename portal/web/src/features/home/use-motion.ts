import { type RefObject, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { countUpValue, nextCycleStep } from "./motion.ts";

// Hooks das animações do Início. Com `prefers-reduced-motion`, tudo aparece no estado final.

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  try {
    const query = window.matchMedia(REDUCED_MOTION);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  } catch {
    return () => {};
  }
}

function readReducedMotion(): boolean {
  try {
    return window.matchMedia(REDUCED_MOTION).matches;
  } catch {
    return false;
  }
}

/** O usuário pediu menos movimento no sistema. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
}

/**
 * A seção já apareceu na tela (uma vez só). Sem `IntersectionObserver`, considera visível.
 */
export function useInView<T extends Element>(threshold = 0.2): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || inView) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [inView, threshold]);
  return [ref, inView];
}

/** Número que conta de 0 até `target` quando `start` fica verdadeiro. */
export function useCountUp(target: number, start: boolean, durationMs = 1400): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) {
      return;
    }
    if (reduced) {
      setValue(target);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const next = countUpValue(target, now - began, durationMs);
      setValue(next);
      if (next !== target) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, start, reduced, durationMs]);
  return value;
}

/**
 * Passo de uma animação em ciclo (0 até `last`, segura `hold` passos e recomeça), enquanto
 * `active`. Com movimento reduzido, fica parado no último passo.
 */
export function useCycle(last: number, active: boolean, intervalMs: number, hold = 2): number {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active || reduced) {
      return;
    }
    const timer = setInterval(
      () => setStep((current) => nextCycleStep(current, last, hold)),
      intervalMs,
    );
    return () => clearInterval(timer);
  }, [active, reduced, last, hold, intervalMs]);
  return reduced ? last : Math.min(step, last);
}
