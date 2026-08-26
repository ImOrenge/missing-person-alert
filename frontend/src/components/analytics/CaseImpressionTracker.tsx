import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { MissingPersonType } from '../../types';
import { logPublicImpactEvent } from '../../services/analyticsService';
import {
  buildCaseImpactContext,
  PUBLIC_IMPACT_EVENT_NAMES,
  type CaseCategory,
  type CaseSurface,
  type SourceAgency,
} from '../../services/analytics/events';
import { observeCaseImpression } from '../../services/analytics/impressionObserver';

interface CaseImpressionTrackerProps {
  caseKey: string;
  caseCategory?: CaseCategory | MissingPersonType;
  address?: string;
  surface: CaseSurface;
  sourceAgency?: SourceAgency;
  enabled?: boolean;
  children: (ref: React.RefCallback<HTMLElement>) => React.ReactNode;
}
export default function CaseImpressionTracker({
  caseKey,
  caseCategory,
  address,
  surface,
  sourceAgency = 'police',
  enabled = true,
  children,
}: CaseImpressionTrackerProps) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const ref = useCallback<React.RefCallback<HTMLElement>>((node) => setElement(node), []);
  const context = useMemo(
    () => buildCaseImpactContext({ caseCategory, address, surface, sourceAgency }),
    [address, caseCategory, sourceAgency, surface],
  );

  useEffect(() => {
    if (!enabled || !element || !caseKey) return undefined;
    return observeCaseImpression(element, {
      caseKey,
      onImpression: () => logPublicImpactEvent(PUBLIC_IMPACT_EVENT_NAMES.CASE_IMPRESSION, context),
    });
  }, [caseKey, context, element, enabled]);

  return <>{children(ref)}</>;
}
