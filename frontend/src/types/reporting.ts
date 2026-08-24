export type ReportTypeV2 = 'sighting' | 'lead' | 'new_case_lead';

export interface ReportLocationInput {
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
}

export interface CreateReportV2Input {
  clientRequestId: string;
  caseId?: string;
  reportType: ReportTypeV2;
  occurredAt: string;
  location: ReportLocationInput;
  description: string;
  mediaIds: string[];
  contact?: { phone?: string; email?: string; preferred?: 'phone' | 'email' };
  consent: { processing: boolean; accuracy: boolean; sensitiveLocation: boolean };
}

export interface CreateReportV2Response {
  success: true;
  reportId: string;
  receiptNumber: string;
  displayStatus: string;
  version: number;
  nextActions: string[];
}

export interface OwnReportListItemDto {
  reportId: string;
  receiptNumber: string;
  caseId?: string;
  reportType: ReportTypeV2;
  occurredAt: string;
  locationLabel: string;
  displayStatus: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  needsInformation: boolean;
  informationRequestMessage?: string;
}

export interface OwnReportDetailDto extends OwnReportListItemDto {
  description: string;
  mediaCount: number;
}
