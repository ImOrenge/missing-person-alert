import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Eye, FileText, Image, Loader2, MapPin, RotateCcw, Send } from 'lucide-react';
import { getOwnReportDetailV2, listOwnReportsV2, submitAdditionalReportInformation, withdrawOwnReportV2 } from '../../services/reportingService';
import type { OwnReportDetailDto, OwnReportListItemDto, ReportTypeV2 } from '../../types/reporting';

const REPORT_TYPE_LABELS: Record<ReportTypeV2, string> = {
  sighting: '목격 제보',
  lead: '관련 단서',
  new_case_lead: '새 실종 관련 단서',
};

export default function OwnReportsPage() {
  const [reports, setReports] = useState<OwnReportListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OwnReportDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailController = useRef<AbortController | null>(null);

  const load = () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listOwnReportsV2(controller.signal).then(setReports).catch((requestError: any) => {
      if (!controller.signal.aborted) setError(requestError?.response?.data?.error || '내 제보를 불러오지 못했습니다.');
    }).finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  };

  useEffect(load, []);
  useEffect(() => () => detailController.current?.abort(), []);

  const loadDetail = async (reportId: string) => {
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    setExpandedId(reportId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const response = await getOwnReportDetailV2(reportId, controller.signal);
      if (!controller.signal.aborted) setDetail(response);
    } catch (requestError: any) {
      if (!controller.signal.aborted) setDetailError(requestError?.response?.data?.error || '제보 상세를 불러오지 못했습니다.');
    } finally {
      if (!controller.signal.aborted) setDetailLoading(false);
    }
  };

  const toggleDetail = async (reportId: string) => {
    if (expandedId === reportId) {
      detailController.current?.abort();
      setExpandedId(null);
      setDetail(null);
      setDetailError(null);
      return;
    }
    await loadDetail(reportId);
  };

  const withdraw = async (report: OwnReportListItemDto) => {
    if (!window.confirm(`${report.receiptNumber} 제보를 취소하시겠습니까? 민감 원본은 정책에 따라 30일 후 파기됩니다.`)) return;
    try {
      await withdrawOwnReportV2(report.reportId);
      load();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || '제보를 취소하지 못했습니다.');
    }
  };

  const submitInformation = async (report: OwnReportListItemDto) => {
    const message = (responses[report.reportId] || '').trim();
    if (message.length < 10) return setError('추가정보를 10자 이상 입력해주세요.');
    setSubmittingId(report.reportId);
    setError(null);
    try {
      await submitAdditionalReportInformation(report.reportId, report.version, message);
      setResponses((current) => ({ ...current, [report.reportId]: '' }));
      load();
    } catch (requestError: any) {
      setError(requestError?.response?.status === 409 ? '검토 상태가 변경되었습니다. 목록을 새로고침해주세요.' : requestError?.response?.data?.error || '추가정보를 제출하지 못했습니다.');
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500" role="status"><Loader2 className="mx-auto mb-3 animate-spin" />내 제보를 불러오고 있습니다.</div>;

  return <div className="space-y-4">
    {error && <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700" role="alert"><AlertCircle className="mr-2 inline" size={17} />{error}<button type="button" onClick={load} className="ml-3 font-black underline"><RotateCcw className="mr-1 inline" size={14} />다시 시도</button></div>}
    {reports.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center"><FileText className="mx-auto text-slate-300" size={38} /><p className="mt-3 text-sm font-bold text-slate-600">접수한 제보가 없습니다.</p></div> : reports.map((report) => <article key={report.reportId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-slate-400">{report.receiptNumber}</p><h2 className="mt-1 font-black text-slate-950">{report.locationLabel}</h2><p className="mt-1 text-sm text-slate-500">목격 시각 {new Date(report.occurredAt).toLocaleString('ko-KR')}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#1e3a5f]">{report.displayStatus}</span></div>
      <button type="button" onClick={() => toggleDetail(report.reportId)} aria-expanded={expandedId === report.reportId} aria-controls={`report-detail-${report.reportId}`} className="mt-4 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-black text-slate-800 hover:bg-slate-100"><span className="flex items-center gap-2"><Eye size={17} />제보 상세 {expandedId === report.reportId ? '닫기' : '보기'}</span>{expandedId === report.reportId ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
      {expandedId === report.reportId && <section id={`report-detail-${report.reportId}`} className="mt-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4" aria-label={`${report.receiptNumber} 제보 상세`}>
        {detailLoading ? <p className="flex items-center gap-2 text-sm text-slate-500" role="status"><Loader2 className="animate-spin" size={16} />상세 내용을 불러오고 있습니다.</p> : detailError ? <div className="text-sm text-red-700" role="alert">{detailError}<button type="button" onClick={() => loadDetail(report.reportId)} className="ml-2 font-black underline">다시 시도</button></div> : detail ? <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-white p-3"><span className="text-[11px] font-bold text-slate-400">제보 유형</span><strong className="mt-1 block text-sm text-slate-900">{REPORT_TYPE_LABELS[detail.reportType]}</strong></div><div className="rounded-lg bg-white p-3"><span className="text-[11px] font-bold text-slate-400">공식 사건 연결</span><strong className="mt-1 block break-all text-sm text-slate-900">{detail.caseId || '연결되지 않음'}</strong></div></div>
          <div><h3 className="text-xs font-black text-slate-700">제출한 내용</h3><p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-4 text-sm leading-6 text-slate-700">{detail.description || '입력된 설명이 없습니다.'}</p></div>
          <div className="grid gap-3 text-sm sm:grid-cols-2"><p className="flex items-start gap-2 rounded-lg bg-white p-3 text-slate-600"><MapPin className="mt-0.5 shrink-0" size={16} /><span><strong className="block text-xs text-slate-800">목격 장소</strong>{detail.locationLabel}</span></p><p className="flex items-start gap-2 rounded-lg bg-white p-3 text-slate-600"><Image className="mt-0.5 shrink-0" size={16} /><span><strong className="block text-xs text-slate-800">첨부 사진</strong>{detail.mediaCount}건</span></p></div>
          <dl className="grid gap-2 border-t border-blue-100 pt-3 text-xs text-slate-500 sm:grid-cols-2"><div><dt className="font-bold">접수 일시</dt><dd className="mt-1">{new Date(detail.createdAt).toLocaleString('ko-KR')}</dd></div><div><dt className="font-bold">최근 처리 일시</dt><dd className="mt-1">{new Date(detail.updatedAt).toLocaleString('ko-KR')}</dd></div></dl>
        </div> : null}
      </section>}
      {report.needsInformation && <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="추가정보 요청"><p className="text-sm font-black text-amber-900">운영자 요청</p><p className="mt-1 text-sm leading-6 text-amber-800">{report.informationRequestMessage || '제보 내용을 보완해주세요.'}</p><textarea value={responses[report.reportId] || ''} onChange={(event) => setResponses((current) => ({ ...current, [report.reportId]: event.target.value }))} rows={3} maxLength={1000} placeholder="요청받은 추가정보를 입력해주세요." className="mt-3 w-full rounded-lg border border-amber-200 bg-white p-3 text-sm" /><button type="button" onClick={() => submitInformation(report)} disabled={submittingId === report.reportId} className="mt-2 flex items-center gap-2 rounded-lg bg-[#10213a] px-4 py-2 text-sm font-black text-white disabled:opacity-60">{submittingId === report.reportId ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}추가정보 제출</button></section>}
      {['접수 완료', '검토 중', '추가정보 필요'].includes(report.displayStatus) && <button type="button" onClick={() => withdraw(report)} className="mt-4 text-xs font-bold text-red-700 underline underline-offset-2">제보 취소</button>}
    </article>)}
  </div>;
}
