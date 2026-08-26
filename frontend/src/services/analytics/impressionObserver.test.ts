// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import { observeCaseImpression, resetCaseImpressionMemoryForTests } from './impressionObserver';

describe('case impression observer', () => {
  let element: HTMLDivElement;
  let emit: (ratio: number) => void;
  let observerFactory: any;
  let observer: any;

  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
    resetCaseImpressionMemoryForTests();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    element = document.createElement('div');
    document.body.appendChild(element);
    observer = {
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    };
    observerFactory = jest.fn((callback: IntersectionObserverCallback) => {
      emit = (ratio: number) => callback([{
        target: element,
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
      } as IntersectionObserverEntry], observer);
      return observer;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.useRealTimers();
  });

  it('records only after at least 50 percent remains visible for 1000ms', () => {
    const onImpression = jest.fn();
    observeCaseImpression(element, { caseKey: 'case-1', onImpression, observerFactory });

    emit(0.49);
    jest.advanceTimersByTime(1500);
    expect(onImpression).not.toHaveBeenCalled();

    emit(0.5);
    jest.advanceTimersByTime(999);
    expect(onImpression).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onImpression).toHaveBeenCalledTimes(1);
  });

  it('cancels dwell time when the card leaves the threshold', () => {
    const onImpression = jest.fn();
    observeCaseImpression(element, { caseKey: 'case-2', onImpression, observerFactory });
    emit(0.7);
    jest.advanceTimersByTime(800);
    emit(0.2);
    jest.advanceTimersByTime(1000);
    expect(onImpression).not.toHaveBeenCalled();
  });

  it('does not count hidden-tab dwell time', () => {
    const onImpression = jest.fn();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    observeCaseImpression(element, { caseKey: 'case-3', onImpression, observerFactory });
    emit(0.8);
    jest.advanceTimersByTime(2000);
    expect(onImpression).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    jest.advanceTimersByTime(1000);
    expect(onImpression).toHaveBeenCalledTimes(1);
  });

  it('deduplicates the same case for the browser session', () => {
    const first = jest.fn();
    const cleanup = observeCaseImpression(element, { caseKey: 'case-4', onImpression: first, observerFactory });
    emit(0.5);
    jest.advanceTimersByTime(1000);
    cleanup();
    expect(first).toHaveBeenCalledTimes(1);

    const second = jest.fn();
    observeCaseImpression(element, { caseKey: 'case-4', onImpression: second, observerFactory });
    jest.advanceTimersByTime(2000);
    expect(second).not.toHaveBeenCalled();
  });
});
