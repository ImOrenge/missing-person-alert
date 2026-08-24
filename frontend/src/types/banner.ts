export type BannerKind = 'emergency' | 'info';
export type BannerSeverity = 'critical' | 'high' | 'normal';

export interface BannerAction {
  label: string;
  href: string;
}

export interface BannerDto {
  id: string;
  kind: BannerKind;
  severity: BannerSeverity;
  title: string;
  summary: string;
  sourceLabel: string;
  targetRegionCodes: string[];
  startsAt?: string;
  endsAt?: string;
  action?: BannerAction;
  dismissible: boolean;
  revision: number;
  approvedAt?: string;
}
