import { useEffect, useRef } from 'react';

export type BackHandler = () => void | Promise<void>;

interface BackEntry {
  id: string;
  onBack: BackHandler;
}

const stack: BackEntry[] = [];
let currentDepth = 0;
let suppressNextPopCount = 0;
let reconcileScheduled = false;
let initialized = false;

function scheduleReconcile(): void {
  if (reconcileScheduled || typeof window === 'undefined') return;
  reconcileScheduled = true;

  queueMicrotask(() => {
    reconcileScheduled = false;
    const targetDepth = stack.length;

    if (targetDepth > currentDepth) {
      while (currentDepth < targetDepth) {
        currentDepth += 1;
        window.history.pushState(
          { ...(window.history.state || {}), __ecDepth: currentDepth },
          ''
        );
      }
    } else if (targetDepth < currentDepth) {
      const diff = currentDepth - targetDepth;
      currentDepth = targetDepth;
      suppressNextPopCount += 1;
      window.history.go(-diff);
    }
  });
}

function handlePopState(event: PopStateEvent): void {
  if (suppressNextPopCount > 0) {
    suppressNextPopCount -= 1;
    return;
  }

  const nextDepth =
    typeof event.state?.__ecDepth === 'number' ? event.state.__ecDepth : 0;
  currentDepth = Math.max(0, nextDepth);

  if (stack.length > currentDepth) {
    const top = stack.pop();
    if (top) {
      Promise.resolve(top.onBack()).catch((err) => {
        console.error('Sequential back handler failed:', err);
      });
    }
  }
}

export function initNavigationHistory(): void {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;

  if (typeof window.history.state?.__ecDepth !== 'number') {
    window.history.replaceState(
      { ...(window.history.state || {}), __ecDepth: 0 },
      ''
    );
  }

  currentDepth = window.history.state?.__ecDepth || 0;
  window.addEventListener('popstate', handlePopState);
}

export function registerBackLayer(id: string, onBack: BackHandler): () => void {
  initNavigationHistory();

  const existingIdx = stack.findIndex((entry) => entry.id === id);
  if (existingIdx !== -1) {
    stack.splice(existingIdx, 1);
  }
  stack.push({ id, onBack });
  scheduleReconcile();

  return () => {
    const idx = stack.findIndex((entry) => entry.id === id);
    if (idx !== -1) {
      stack.splice(idx, 1);
      scheduleReconcile();
    }
  };
}

export function useBackHandler(
  id: string,
  isActive: boolean,
  onBack: BackHandler
): void {
  const onBackRef = useRef<BackHandler>(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!isActive) return;
    return registerBackLayer(id, () => onBackRef.current());
  }, [id, isActive]);
}
