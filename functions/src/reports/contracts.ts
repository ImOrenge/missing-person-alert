export type ReportType = "sighting" | "lead" | "new_case_lead";
export type ReportStatus = "submitted" | "triage" | "needs_information" | "approved" | "forwarded" | "confirmed" | "rejected" | "duplicate" | "withdrawn" | "archived";

export interface CreateReportInput {
  clientRequestId: string;
  caseId?: string;
  reportType: ReportType;
  occurredAt: string;
  location: {address: string; lat: number; lng: number; placeId?: string};
  description: string;
  mediaIds?: string[];
  contact?: {phone?: string; email?: string; preferred?: "phone" | "email"};
  consent: {processing: boolean; accuracy: boolean; sensitiveLocation: boolean};
}

export interface OwnReportListItemDto {
  reportId: string;
  receiptNumber: string;
  caseId?: string;
  reportType: ReportType;
  occurredAt: string;
  locationLabel: string;
  displayStatus: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  needsInformation: boolean;
  informationRequestMessage?: string;
}
