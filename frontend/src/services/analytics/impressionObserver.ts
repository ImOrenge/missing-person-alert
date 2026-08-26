const SESSION_KEY_PREFIX = 'missingalert:impact:case_impression:v1:';
const memoryDedup = new Set<string>();

export interface CaseImpressionObserverOptions {
  caseKey: string;
  onImpression: () => void;
  threshold?: number;
  dwellMs?: number;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  documentRef?: Document;
  observerFactory?: (callback: IntersectionObserverCallback, options: IntersectionObserverInit) => IntersectionObserver;
}

const getSessionKey = (caseKey: string) => `${SESSION_KEY_PREFIX}${caseKey}`;

const hasRecorded = (key: string, storage?: Pick<Storage, 'getItem' | 'setItem'> | null): boolean => {
  if (memoryDedup.has(key)) return true;
  try {
    return storage?.getItem(key) === '1';
  } catch {
    return false;
  }
};
const markRecorded = (key: string, storage?: Pick<Storage, 'getItem' | 'setItem'> | null): void => {
  memoryDedup.add(key);
  try {
    storage?.setItem(key, '1');
  } catch {
    // Privacy or quota settings may block sessionStorage. In-memory dedup still applies.
  }
};

export const observeCaseImpression = (
  element: Element,
  {
    caseKey,
    onImpression,
    threshold = 0.5,
    dwellMs = 1000,
    storage = typeof window !== 'undefined' ? window.sessionStorage : null,
    documentRef = document,
    observerFactory,
  }: CaseImpressionObserverOptions,
): (() => void) => {
  const sessionKey = getSessionKey(caseKey);
  if (!caseKey || hasRecorded(sessionKey, storage)) return () => undefined;

  const factory = observerFactory ?? (
    typeof IntersectionObserver !== 'undefined'
      ? (callback: IntersectionObserverCallback, options: IntersectionObserverInit) => new IntersectionObserver(callback, options)
      : null
  );
  if (!factory) return () => undefined;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let visibleRatio = 0;
  let disposed = false;

  const cancelTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const observer = factory((entries) => {
    const entry = entries.find((candidate) => candidate.target === element);
    if (!entry) return;
    visibleRatio = entry.isIntersecting ? entry.intersectionRatio : 0;
    evaluate();
  }, { threshold: [threshold] });

  const record = () => {
    timer = null;
    if (disposed || visibleRatio < threshold || documentRef.visibilityState !== 'visible' || hasRecorded(sessionKey, storage)) return;
    markRecorded(sessionKey, storage);
    observer.unobserve(element);
    onImpression();
  };

  function evaluate() {
    if (disposed || visibleRatio < threshold || documentRef.visibilityState !== 'visible' || hasRecorded(sessionKey, storage)) {
      cancelTimer();
      return;
    }
    if (!timer) timer = setTimeout(record, dwellMs);
  }

  const handleVisibilityChange = () => evaluate();
  documentRef.addEventListener('visibilitychange', handleVisibilityChange);
  observer.observe(element);

  return () => {
    disposed = true;
    cancelTimer();
    documentRef.removeEventListener('visibilitychange', handleVisibilityChange);
    observer.disconnect();
  };
};

export const resetCaseImpressionMemoryForTests = (): void => {
  memoryDedup.clear();
};
