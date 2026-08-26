import {getFunctions, httpsCallable} from 'firebase/functions';
import {firebaseApp} from './firebase';
import apiClient from './apiClient';
import type {DataQualityIssue, ImpactDraft, PublicDataAuditEntry, PublicDataSyncRun, StatisticsImportPreview} from '../types/publicDataAdmin';

const functions = getFunctions(firebaseApp,'asia-northeast3');

export const loadPublicDataOverview = async (signal?:AbortSignal) => (await apiClient.get('/api/v2/admin/public-data/overview',{signal})).data.overview;
export const listPublicDataSyncRuns = async (signal?:AbortSignal):Promise<PublicDataSyncRun[]> => (await apiClient.get('/api/v2/admin/public-data/sync-runs',{signal})).data.runs;
export const listDataQualityIssues = async (signal?:AbortSignal):Promise<DataQualityIssue[]> => (await apiClient.get('/api/v2/admin/public-data/issues',{params:{status:'active'},signal})).data.issues;
export const listImpactDrafts = async (signal?:AbortSignal):Promise<ImpactDraft[]> => (await apiClient.get('/api/v2/admin/public-data/impact-drafts',{signal})).data.drafts;
export const listPublicDataAudit = async (signal?:AbortSignal):Promise<PublicDataAuditEntry[]> => (await apiClient.get('/api/v2/admin/public-data/audit',{signal})).data.entries;
export const listPublicDataSources = async (signal?:AbortSignal) => (await apiClient.get('/api/v2/admin/public-data/sources',{signal})).data.sources;

const bytesToBase64 = (bytes:Uint8Array):string => {
  let binary='';
  const chunk=0x8000;
  for(let offset=0;offset<bytes.length;offset+=chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(offset, offset + chunk)));
  }
  return btoa(binary);
};

export const runStatisticsImport = async (file:File,input:{encoding:'cp949'|'utf8';dryRun:boolean;datasetCutoff:string;officialPageUrl:string;reason?:string}):Promise<StatisticsImportPreview> => {
  const callable=httpsCallable(functions,'importPoliceStatistics');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const result=await callable({contentBase64:bytesToBase64(bytes),encoding:input.encoding,dryRun:input.dryRun,datasetCutoff:input.datasetCutoff||null,officialPageUrl:input.officialPageUrl||null,reason:input.reason||null});
  return result.data as StatisticsImportPreview;
};
export const publishImpactDraft = async (month:string,reason:string) => (await httpsCallable(functions,'publishImpactMonth')({month,reason})).data;
export const rejectImpactDraft = async (month:string,reason:string) => (await httpsCallable(functions,'rejectImpactMonth')({month,reason})).data;
export const changeDataQualityIssueStatus = async (issueId:string,status:'investigating'|'resolved'|'ignored',reason:string) => (await httpsCallable(functions,'updateDataQualityIssue')({issueId,status,reason})).data;
