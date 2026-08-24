export interface AdminReportQueueItem {
  reportId: string;
  receiptNumber: string;
  caseId: string | null;
  reportType: string;
  occurredAt: string;
  status: string;
  version: number;
  hasMedia: boolean;
  locationLabel: string;
  updatedAt?: string;
}

export interface AdminReportDetail extends AdminReportQueueItem {
  exactLocation: { address: string; lat: number; lng: number };
  rawText: string;
  mediaIds: string[];
  media: Array<{ mediaId: string; status: string; exifStripped: boolean; manualMaskConfirmed: boolean }>;
  visibility: string;
  additionalInformation: Array<{ message: string; createdAt?: string }>;
}

export interface DecryptedReportContact {
  phone?: string;
  email?: string;
  preferred?: 'phone' | 'email';
}
