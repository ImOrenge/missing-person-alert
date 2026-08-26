export interface PublicDataSyncRun {
  id: string; type: string; trigger: string; status: string; startedAt: string | null; completedAt: string | null;
  counts: Record<string, number> | null; sourceHashPrefix: string | null; warnings: string[]; error: {code:string;message:string}|null;
}
export interface DataQualityIssue {
  id:string; type:string; status:string; severity:string; sourceId:string; target:string; code:string;
  assignedTo:string|null; resolutionReason:string|null; createdAt:string|null; updatedAt:string|null;
}
export interface ImpactDraft {
  month:string; events:Record<string,number>; estimatedUsers:number; rates:Record<string,number|null>;
  service?:Record<string,number>; anomalies?:string[]; aggregation?:Record<string,unknown>; review?:{state:string;reason?:string}; updatedAt?:string|null;
}
export interface PublicDataAuditEntry {
  id:string; actorUid:string; actorRole:string; action:string; target:string; before:unknown; after:unknown; reason:string|null; createdAt:string|null;
}
export interface StatisticsImportPreview {
  runId:string; sourceHash:string; status:'dry_run'|'success'|'unchanged'; years:number[]; created:number; updated:number; unchanged:number; warnings:string[];
}
