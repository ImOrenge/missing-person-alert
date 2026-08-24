import type { DashboardModuleId } from '../features/dashboard/dashboard-module-registry';

export interface DashboardPreferences {
  schemaVersion: 1;
  viewport: 'mobile' | 'desktop';
  moduleOrder: DashboardModuleId[];
  collapsed: DashboardModuleId[];
  hidden: DashboardModuleId[];
  density: 'comfortable' | 'compact';
  defaultRegionCode?: string;
  defaultExploreView: 'list' | 'map' | 'split' | 'cards';
}
