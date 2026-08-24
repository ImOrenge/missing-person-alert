import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { DEFAULT_MODULE_ORDER } from './dashboard-module-registry';
import { getDashboardPreferences, saveDashboardPreferences } from '../../services/dashboardPreferenceService';
import type { DashboardPreferences } from '../../types/dashboardPreferences';

const STORAGE_KEY = 'missingalert_dashboard_preferences_v1';
const EVENT_NAME = 'missingalert:dashboard-preferences';

const defaults = (): DashboardPreferences => ({
  schemaVersion: 1,
  viewport: typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop',
  moduleOrder: [...DEFAULT_MODULE_ORDER], collapsed: [], hidden: [], density: 'comfortable', defaultExploreView: 'list',
});

const readLocal = (): DashboardPreferences => {
  if (typeof window === 'undefined') return defaults();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    return parsed?.schemaVersion === 1 ? { ...defaults(), ...parsed } : defaults();
  } catch { return defaults(); }
};

export const useDashboardPreferences = (user: User | null, enabled: boolean) => {
  const [preferences, setPreferences] = useState<DashboardPreferences>(readLocal);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enabled || !user) return undefined;
    const controller = new AbortController();
    getDashboardPreferences(controller.signal).then((remote) => {
      setPreferences(remote);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: remote }));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [enabled, user]);

  useEffect(() => {
    const sync = (event: Event) => setPreferences((event as CustomEvent<DashboardPreferences>).detail || readLocal());
    window.addEventListener(EVENT_NAME, sync);
    return () => window.removeEventListener(EVENT_NAME, sync);
  }, []);

  const update = useCallback(async (next: DashboardPreferences) => {
    if (!enabled) return;
    setPreferences(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
    if (user) {
      setSaving(true);
      try { setPreferences(await saveDashboardPreferences(next)); } finally { setSaving(false); }
    }
  }, [enabled, user]);

  const moduleOrder = useMemo(() => new Map(preferences.moduleOrder.map((id, index) => [id, index])), [preferences.moduleOrder]);
  return { preferences, update, saving, moduleOrder };
};
