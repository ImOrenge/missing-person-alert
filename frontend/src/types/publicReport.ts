export interface PublicMapReportDto {
  id: string;
  kind: 'report';
  caseId: string;
  reportType: string;
  occurredAt: string;
  publicDescription: string;
  publicLocationText: string;
  publicLocation: { lat: number; lng: number };
  publicRadiusM: number;
  publicStatus: 'approved' | 'forwarded' | 'confirmed';
  sourceLabel: string;
  href: string;
}
