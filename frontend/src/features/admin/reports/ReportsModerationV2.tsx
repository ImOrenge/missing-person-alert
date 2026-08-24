import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Archive, Building2, CheckCircle2, Eye, FileSearch, Image,
  Loader2, MapPin, RefreshCw, Send, ShieldCheck, UserCheck,
} from 'lucide-react';
import {
  approvePublicReport, approveReportMedia, archiveReport, confirmReport, decryptReportContact,
  forwardReportToAgency, getAdminReportDetail, listAdminReportQueue, markReportDuplicate,
  rejectReport, requestReportInformation, startReportReview, unpublishReport,
} from '../../../services/adminReportingService';
import type { AdminReportDetail, AdminReportQueueItem, DecryptedReportContact } from '../../../types/adminReporting';
import type { AdminRoles } from '../../../utils/adminUtils';

const STATUS_GROUPS = [
  { label: '접수·검토', values: [['submitted', '신규'], ['triage', '검토 중'], ['needs_information', '추가정보']] },
  { label: '승인·기관', values: [['approved', '승인'], ['forwarded', '기관 전달'], ['confirmed', '기관 확인']] },
  { label: '종료', values: [['rejected', '반려'], ['duplicate', '중복'], ['withdrawn', '취소'], ['archived', '종료']] },
] as const;

const STATUS_LABELS: Record<string, string> = {
  submitted: '신규 접수', triage: '검토 중', needs_information: '추가정보 필요', approved: '공개 승인',
  forwarded: '관계기관 전달', confirmed: '관계기관 확인', rejected: '반려', duplicate: '중복 통합',
  withdrawn: '사용자 취소', archived: '처리 종료',
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  sighting: '공식 사건 목격', lead: '공식 사건 관련 단서', new_case_lead: '새 실종 관련 단서',
};

const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#1e3a5f]';
type ReviewDecision = 'request' | 'approve' | 'duplicate' | 'reject';

const formatDateTime = (value: string | undefined): string => {
  if (!value) return '일시 정보 없음';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('ko-KR') : '일시 정보 없음';
};

interface ReportsModerationV2Props {
  roles: AdminRoles;
  adminEnabled: boolean;
  publicApprovalEnabled: boolean;
}

export default function ReportsModerationV2({ roles, adminEnabled, publicApprovalEnabled }: ReportsModerationV2Props) {
  const hasReadRole = roles.reportModerator || roles.seniorModerator || roles.agencyOperator || roles.privacyOfficer;
  const canRead = adminEnabled && hasReadRole;
  const canReview = roles.reportModerator || roles.seniorModerator;
  const canApprove = roles.seniorModerator;
  const canAgency = roles.agencyOperator;
  const canContact = roles.privacyOfficer || roles.agencyOperator;
  const [status, setStatus] = useState('submitted');
  const [items, setItems] = useState<AdminReportQueueItem[]>([]);
  const [selected, setSelected] = useState<AdminReportDetail | null>(null);
  const [loading, setLoading] = useState(canRead);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<ReviewDecision>('request');
  const [requestMessage, setRequestMessage] = useState('');
  const [publicRadiusM, setPublicRadiusM] = useState(500);
  const [rejectionReason, setRejectionReason] = useState('');
  const [mediaReviewNote, setMediaReviewNote] = useState('식별 가능한 제3자와 민감정보가 없음을 확인했습니다.');
  const [primaryReportId, setPrimaryReportId] = useState('');
  const [duplicateReason, setDuplicateReason] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [forwardingChannel, setForwardingChannel] = useState('official_system');
  const [externalReceiptNumber, setExternalReceiptNumber] = useState('');
  const [forwardingOutcome, setForwardingOutcome] = useState('');
  const [confirmationReference, setConfirmationReference] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const [unpublishReason, setUnpublishReason] = useState('');
  const [contactPurpose, setContactPurpose] = useState<'agency_callback' | 'identity_verification' | 'legal_request'>('agency_callback');
  const [contact, setContact] = useState<DecryptedReportContact | null>(null);

  const load = useCallback(() => {
    const controller = new AbortController();
    if (!canRead) {
      setItems([]);
      setSelected(null);
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    setError(null);
    listAdminReportQueue(status, controller.signal)
      .then(setItems)
      .catch((requestError: any) => !controller.signal.aborted && setError(requestError?.response?.data?.error || '검토 대기열을 불러오지 못했습니다.'))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [canRead, status]);

  useEffect(load, [load]);

  const open = async (reportId: string) => {
    if (!canRead) return;
    setError(null);
    setSelected(null);
    setContact(null);
    setReviewDecision('request');
    setDetailLoading(true);
    try {
      const detail = await getAdminReportDetail(reportId);
      setSelected(detail);
      setError(null);
    } catch (requestError: any) {
      setSelected(null);
      setError(requestError?.response?.data?.error || '제보 상세를 열지 못했습니다.');
    } finally {
      setDetailLoading(false);
    }
  };

  const run = async (action: () => Promise<unknown>, successStatus?: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await action();
      setSelected(null);
      setContact(null);
      if (successStatus && successStatus !== status) setStatus(successStatus);
      else load();
    } catch (requestError: any) {
      setError(requestError?.response?.status === 409
        ? '다른 운영자가 먼저 변경했습니다. 상세를 다시 열어 주세요.'
        : requestError?.response?.data?.error || '운영 작업을 완료하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const revealContact = async () => {
    if (!selected || !canContact) return;
    setSubmitting(true);
    setContact(null);
    setError(null);
    try {
      setContact(await decryptReportContact(selected.reportId, contactPurpose));
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || '연락처를 확인할 수 없습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!adminEnabled) return <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="text-lg font-black text-amber-950">제보 검토 기능이 일시 중지되었습니다</h2><p className="mt-2 text-sm leading-6 text-amber-900">운영 플래그가 꺼져 있어 조회와 상태 변경을 시작하지 않습니다. 기존 제보 데이터는 보존됩니다.</p></section>;
  if (!hasReadRole) return <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="text-lg font-black text-amber-950">비공개 제보 접근 권한 없음</h2><p className="mt-2 text-sm leading-6 text-amber-900">systemAdmin 권한만으로는 제보 원문·정확 위치·연락처를 열 수 없습니다. 업무상 필요한 별도 역할을 최소 범위로 발급해야 합니다.</p></section>;

  const approvedMediaIds = selected?.media.filter((media) => media.status === 'approved' && media.manualMaskConfirmed).map((media) => media.mediaId) || [];
  const decisionOptions: Array<{ value: ReviewDecision; label: string; help: string }> = [];
  if (selected && canReview && ['submitted', 'triage'].includes(selected.status)) {
    decisionOptions.push({ value: 'request', label: '추가정보 요청', help: '판단에 필요한 내용을 제보자에게 요청' });
    decisionOptions.push({ value: 'reject', label: '반려', help: '처리할 수 없는 이유를 기록하고 종료' });
  }
  if (selected && canApprove && ['submitted', 'triage', 'needs_information'].includes(selected.status)) {
    if (publicApprovalEnabled) decisionOptions.push({ value: 'approve', label: '공개 승인', help: '민감정보를 제거한 전체 공개본 게시' });
    decisionOptions.push({ value: 'duplicate', label: '중복 통합', help: '기존 대표 제보에 연결' });
  }

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="report-moderation-v2-title">
      <header className="border-b border-slate-200 bg-slate-50/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d94841]">REPORT OPERATIONS</p><h2 id="report-moderation-v2-title" className="mt-1 text-xl font-black text-slate-950">제보 검토·처리</h2><p className="mt-2 text-sm text-slate-600">접수 내용을 확인하고 보호정보를 점검한 뒤 하나의 처리 결정을 선택합니다.</p></div>
          <button type="button" onClick={load} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"><RefreshCw size={14} />새로고침</button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="제보 검토 순서"><div className="rounded-lg bg-white p-3 text-xs font-bold text-slate-700"><span className="mr-2 text-[#d94841]">1</span>접수 내용 확인</div><div className="rounded-lg bg-white p-3 text-xs font-bold text-slate-700"><span className="mr-2 text-[#d94841]">2</span>보호정보 점검</div><div className="rounded-lg bg-white p-3 text-xs font-bold text-slate-700"><span className="mr-2 text-[#d94841]">3</span>처리 결정</div></div>
      </header>

      <nav className="border-b border-slate-200 p-3" aria-label="제보 상태 필터">
        <div className="flex gap-4 overflow-x-auto">{STATUS_GROUPS.map((group) => <div key={group.label} className="flex flex-none items-center gap-1"><span className="mr-1 whitespace-nowrap text-[10px] font-black text-slate-400">{group.label}</span>{group.values.map(([value, label]) => <button key={value} type="button" onClick={() => { setStatus(value); setSelected(null); setContact(null); }} aria-pressed={status === value} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${status === value ? 'bg-[#10213a] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}</div>)}</div>
      </nav>

      {error && <p className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert"><AlertCircle className="mr-2 inline" size={16} />{error}</p>}

      <div className="grid min-h-[560px] lg:grid-cols-[340px_1fr]">
        <aside className="border-b border-slate-200 p-3 lg:border-b-0 lg:border-r" aria-label={`${STATUS_LABELS[status] || status} 제보 목록`}>
          <div className="mb-3 flex items-center justify-between px-1"><strong className="text-sm text-slate-800">{STATUS_LABELS[status] || status}</strong><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">{items.length}건</span></div>
          {loading ? <p className="py-12 text-center text-sm text-slate-500" role="status"><Loader2 className="mx-auto mb-2 animate-spin" />불러오는 중</p>
            : items.length === 0 ? <p className="rounded-xl bg-slate-50 py-12 text-center text-sm text-slate-400">이 상태의 제보가 없습니다.</p>
              : <div className="space-y-2">{items.map((item) => <button key={item.reportId} type="button" onClick={() => open(item.reportId)} disabled={detailLoading} className={`w-full rounded-xl border p-3 text-left disabled:cursor-wait disabled:opacity-60 ${selected?.reportId === item.reportId ? 'border-[#1e3a5f] bg-blue-50 ring-1 ring-[#1e3a5f]' : 'border-slate-200 hover:bg-slate-50'}`}><span className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] text-slate-400">{item.receiptNumber}</span>{item.hasMedia && <span className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-1 text-[10px] font-bold text-slate-500"><Image size={11} />사진</span>}</span><strong className="mt-2 block text-sm text-slate-900">{item.locationLabel}</strong><span className="mt-1 block text-xs text-slate-500">{REPORT_TYPE_LABELS[item.reportType] || item.reportType}</span><span className="mt-1 block text-[11px] text-slate-400">{formatDateTime(item.occurredAt)} · v{item.version}</span></button>)}</div>}
        </aside>

        <div className="p-4 sm:p-6">
          {detailLoading ? <div className="rounded-2xl border border-slate-200 py-20 text-center text-sm text-slate-500" role="status"><Loader2 className="mx-auto mb-3 animate-spin" size={32} /><strong className="block text-slate-700">제보 상세를 불러오는 중입니다</strong></div> : !selected ? <div className="rounded-2xl border border-dashed border-slate-200 py-20 text-center text-sm text-slate-400"><Eye className="mx-auto mb-3" size={32} /><strong className="block text-slate-600">왼쪽 목록에서 제보를 선택하세요</strong><span className="mt-2 block">원문 접근은 목적 코드와 함께 감사 기록에 남습니다.</span></div> : <div className="space-y-5">
            <section className="rounded-xl border border-slate-200 p-4" aria-label="선택한 제보 요약">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#1e3a5f]">{STATUS_LABELS[selected.status] || selected.status}</span><h3 className="mt-3 font-mono text-sm font-black text-slate-900">{selected.receiptNumber}</h3></div>{canReview && ['submitted', 'needs_information'].includes(selected.status) && <button type="button" onClick={() => run(() => startReportReview(selected.reportId, selected.version), 'triage')} disabled={submitting} className="rounded-lg bg-[#10213a] px-3 py-2 text-xs font-black text-white disabled:opacity-60">검토 시작</button>}</div>
              <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4"><div><dt className="font-bold text-slate-400">유형</dt><dd className="mt-1 font-bold text-slate-700">{REPORT_TYPE_LABELS[selected.reportType] || selected.reportType}</dd></div><div><dt className="font-bold text-slate-400">목격 시각</dt><dd className="mt-1 font-bold text-slate-700">{formatDateTime(selected.occurredAt)}</dd></div><div><dt className="font-bold text-slate-400">사건 연결</dt><dd className="mt-1 break-all font-bold text-slate-700">{selected.caseId || '미연결'}</dd></div><div><dt className="font-bold text-slate-400">버전·미디어</dt><dd className="mt-1 font-bold text-slate-700">v{selected.version} · {selected.media.length}건</dd></div></dl>
            </section>

            <section className="rounded-xl border border-slate-200 p-4" aria-labelledby="report-facts-title">
              <h3 id="report-facts-title" className="flex items-center gap-2 text-sm font-black text-slate-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#10213a] text-xs text-white">1</span>접수 내용 확인</h3>
              <div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="text-xs font-black text-slate-500">비공개 원문</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{selected.rawText}</p></div>
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-4 text-xs leading-5 text-red-800"><MapPin className="mt-0.5 flex-none" size={15} /><span><strong className="block">정확 위치 · 외부 공유 금지</strong>{selected.exactLocation.address}<br />좌표 {selected.exactLocation.lat.toFixed(5)}, {selected.exactLocation.lng.toFixed(5)}</span></div>
              {selected.additionalInformation.length > 0 && <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="사용자 추가정보"><p className="text-xs font-black text-blue-900">사용자 추가정보 {selected.additionalInformation.length}건</p>{selected.additionalInformation.map((item, index) => <div key={`${item.createdAt || 'response'}-${index}`} className="mt-2 border-t border-blue-100 pt-2"><p className="whitespace-pre-wrap text-sm leading-6 text-blue-950">{item.message}</p>{item.createdAt && <time className="mt-1 block text-[11px] text-blue-700">{formatDateTime(item.createdAt)}</time>}</div>)}</div>}
            </section>

            <section className="rounded-xl border border-slate-200 p-4" aria-labelledby="report-protection-title">
              <h3 id="report-protection-title" className="flex items-center gap-2 text-sm font-black text-slate-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#10213a] text-xs text-white">2</span>보호정보 점검</h3>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4"><p className="flex items-center gap-2 text-xs font-black text-slate-700"><Image size={15} />미디어 {selected.media.length}건</p>{selected.media.length === 0 ? <p className="mt-2 text-xs text-slate-500">첨부된 미디어가 없습니다.</p> : selected.media.map((media) => <div key={media.mediaId} className="mt-2 rounded-lg bg-white p-3"><span className="text-xs text-slate-600">{media.mediaId.slice(0, 10)}… · {media.status}<br />EXIF {media.exifStripped ? '제거' : '미확인'}</span>{canApprove && media.status === 'normalized' && <><textarea value={mediaReviewNote} onChange={(event) => setMediaReviewNote(event.target.value)} rows={2} className={inputClass} aria-label="미디어 검토 메모" /><button type="button" disabled={submitting || mediaReviewNote.trim().length < 10} onClick={() => run(() => approveReportMedia(selected.reportId, media.mediaId, selected.version, mediaReviewNote.trim()), status)} className="mt-2 rounded bg-[#10213a] px-3 py-2 text-xs font-black text-white disabled:opacity-50">안전 확인 후 승인</button></>}</div>)}</div>
                <div className="rounded-xl bg-amber-50 p-4"><p className="flex items-center gap-2 text-xs font-black text-amber-950"><ShieldCheck size={15} />민감 연락처</p>{canContact ? <><p className="mt-2 text-xs leading-5 text-amber-900">업무 목적을 선택해야 복호화되며 모든 접근이 기록됩니다.</p><select value={contactPurpose} onChange={(event) => setContactPurpose(event.target.value as typeof contactPurpose)} className={inputClass}><option value="agency_callback">기관 회신</option><option value="identity_verification">신원 확인</option><option value="legal_request">법적 요청</option></select><button type="button" onClick={revealContact} disabled={submitting} className="mt-2 w-full rounded-lg border border-amber-300 px-4 py-2 text-sm font-black text-amber-950">감사 로그를 남기고 확인</button>{contact && <div className="mt-3 rounded-lg bg-white p-3 text-sm" role="status"><p>전화: {contact.phone || '없음'}</p><p>이메일: {contact.email || '없음'}</p><p className="mt-1 text-xs text-red-700">복사·별도 저장하지 말고 승인된 목적에만 사용하세요.</p></div>}</> : <p className="mt-2 text-xs leading-5 text-amber-900">현재 역할에는 연락처 복호화 권한이 없습니다.</p>}</div>
              </div>
            </section>

            {decisionOptions.length > 0 && <section className="rounded-xl border-2 border-[#1e3a5f] p-4" aria-labelledby="report-decision-title">
              <h3 id="report-decision-title" className="flex items-center gap-2 text-sm font-black text-slate-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#d94841] text-xs text-white">3</span>처리 결정</h3>
              {!publicApprovalEnabled && canApprove && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">공개 기능이 운영 승인 전이라 ‘공개 승인’ 결정은 잠겨 있습니다. 추가정보·중복·반려 처리는 가능합니다.</p>}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">{decisionOptions.map((option) => <button key={option.value} type="button" onClick={() => setReviewDecision(option.value)} aria-pressed={reviewDecision === option.value} className={`rounded-xl border p-3 text-left ${reviewDecision === option.value ? 'border-[#1e3a5f] bg-blue-50 ring-1 ring-[#1e3a5f]' : 'border-slate-200'}`}><strong className="block text-sm text-slate-900">{option.label}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{option.help}</span></button>)}</div>

              {reviewDecision === 'request' && decisionOptions.some((option) => option.value === 'request') && <div className="mt-4 rounded-xl bg-slate-50 p-4"><label className="text-xs font-black text-slate-700">제보자에게 필요한 정보<textarea value={requestMessage} onChange={(event) => setRequestMessage(event.target.value)} rows={3} placeholder="예: 목격 당시 이동 방향과 옷 색상을 알려주세요. (10자 이상)" className={inputClass} /></label><p className="mt-2 text-xs text-slate-500">제보자는 ‘내 제보’에서 요청 내용을 보고 답변합니다.</p><button type="button" onClick={() => requestMessage.trim().length >= 10 ? run(() => requestReportInformation(selected.reportId, selected.version, requestMessage.trim()), 'needs_information') : setError('추가정보 요청 문구를 10자 이상 입력해 주세요.')} disabled={submitting} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#10213a] px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"><Send size={16} />추가정보 요청 보내기</button></div>}

              {reviewDecision === 'approve' && decisionOptions.some((option) => option.value === 'approve') && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h4 className="text-sm font-black text-emerald-950">전체 제보 공개 확인</h4><p className="mt-1 text-xs leading-5 text-emerald-900">별도의 축약문을 작성하지 않습니다. 제출된 제보 내용과 주소 문구가 그대로 공개되며 지도 좌표만 선택한 안전 반경 안에서 비식별화됩니다.</p><div className="mt-3 rounded-lg bg-white p-3"><p className="text-xs font-black text-slate-500">공개 위치</p><p className="mt-1 text-sm font-bold text-slate-800">{selected.locationLabel}</p><p className="mt-3 text-xs font-black text-slate-500">공개 제보 내용</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{selected.rawText}</p></div><label className="mt-3 block text-xs font-bold text-slate-600">지도 좌표 안전 반경(m)<input type="number" min={500} max={20000} value={publicRadiusM} onChange={(event) => setPublicRadiusM(Number(event.target.value))} className={inputClass} /></label><p className="mt-2 text-xs leading-5 text-amber-700">연락처·주민번호가 제보 본문에 포함되어 있으면 서버가 공개를 거부합니다. 수동 승인된 미디어 {approvedMediaIds.length}건만 복사됩니다.</p><button type="button" onClick={() => run(() => approvePublicReport(selected.reportId, { expectedVersion: selected.version, publicRadiusM, approvedMediaIds }), 'approved')} disabled={submitting} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-60"><CheckCircle2 size={18} />전체 제보 공개 승인</button></div>}

              {reviewDecision === 'duplicate' && decisionOptions.some((option) => option.value === 'duplicate') && <div className="mt-4 rounded-xl bg-slate-50 p-4"><label className="text-xs font-black text-slate-700">대표 제보 ID<input value={primaryReportId} onChange={(event) => setPrimaryReportId(event.target.value)} placeholder="기존 대표 제보 ID" className={inputClass} /></label><label className="mt-3 block text-xs font-black text-slate-700">통합 사유<textarea value={duplicateReason} onChange={(event) => setDuplicateReason(event.target.value)} rows={3} placeholder="같은 목격으로 판단한 근거 (10자 이상)" className={inputClass} /></label><button type="button" onClick={() => run(() => markReportDuplicate(selected.reportId, selected.version, primaryReportId.trim(), duplicateReason.trim()), 'duplicate')} disabled={submitting || primaryReportId.trim().length < 8 || duplicateReason.trim().length < 10} className="mt-3 w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">대표 제보로 통합</button></div>}

              {reviewDecision === 'reject' && decisionOptions.some((option) => option.value === 'reject') && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4"><label className="text-xs font-black text-red-900">반려 사유<textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={3} placeholder="처리할 수 없는 이유를 제보자가 이해할 수 있게 작성 (10자 이상)" className={inputClass} /></label><button type="button" onClick={() => rejectionReason.trim().length >= 10 ? run(() => rejectReport(selected.reportId, selected.version, rejectionReason.trim()), 'rejected') : setError('반려 사유를 10자 이상 입력해 주세요.')} disabled={submitting} className="mt-3 w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">사유를 기록하고 반려</button></div>}
            </section>}

            {(canAgency || canApprove) && ['approved', 'forwarded', 'confirmed', 'rejected', 'duplicate', 'withdrawn'].includes(selected.status) && <section className="rounded-xl border border-slate-200 p-4" aria-labelledby="report-followup-title"><h3 id="report-followup-title" className="flex items-center gap-2 text-sm font-black text-slate-900"><FileSearch size={17} />현재 상태의 다음 처리</h3>
              {canAgency && selected.status === 'approved' && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4"><h4 className="flex items-center gap-2 text-sm font-black text-violet-950"><Building2 size={17} />관계기관 전달</h4><div className="mt-2 grid gap-3 sm:grid-cols-2"><input value={agencyName} onChange={(event) => setAgencyName(event.target.value)} placeholder="기관명" className={inputClass} /><select value={forwardingChannel} onChange={(event) => setForwardingChannel(event.target.value)} className={inputClass}><option value="official_system">공식 시스템</option><option value="secure_email">보안 이메일</option><option value="phone">전화</option><option value="in_person">대면</option></select></div><input value={externalReceiptNumber} onChange={(event) => setExternalReceiptNumber(event.target.value)} placeholder="외부 접수번호 (선택)" className={inputClass} /><textarea value={forwardingOutcome} onChange={(event) => setForwardingOutcome(event.target.value)} rows={2} placeholder="전달 결과" className={inputClass} /><button type="button" onClick={() => run(() => forwardReportToAgency(selected.reportId, { expectedVersion: selected.version, agencyName: agencyName.trim(), channel: forwardingChannel, externalReceiptNumber: externalReceiptNumber.trim() || undefined, outcome: forwardingOutcome.trim() }), 'forwarded')} disabled={submitting || agencyName.trim().length < 2 || forwardingOutcome.trim().length < 5} className="mt-2 w-full rounded-lg bg-violet-800 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">기관 전달 기록</button></div>}
              {canAgency && ['approved', 'forwarded'].includes(selected.status) && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4"><h4 className="flex items-center gap-2 text-sm font-black text-blue-950"><UserCheck size={17} />관계기관 확인</h4><input value={confirmationReference} onChange={(event) => setConfirmationReference(event.target.value)} placeholder="확인 참조번호 또는 근거" className={inputClass} /><button type="button" onClick={() => run(() => confirmReport(selected.reportId, selected.version, confirmationReference.trim()), 'confirmed')} disabled={submitting || confirmationReference.trim().length < 5} className="mt-2 w-full rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">확인 상태로 전환</button></div>}
              {canApprove && ['approved', 'forwarded', 'confirmed'].includes(selected.status) && <details className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4"><summary className="cursor-pointer text-sm font-black text-red-950">긴급 공개 취소</summary><textarea value={unpublishReason} onChange={(event) => setUnpublishReason(event.target.value)} rows={2} placeholder="공개 취소 사유 (10자 이상)" className={inputClass} /><button type="button" onClick={() => run(() => unpublishReport(selected.reportId, selected.version, unpublishReason.trim()), 'triage')} disabled={submitting || unpublishReason.trim().length < 10} className="mt-2 w-full rounded-lg bg-red-800 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">공개본·미디어 차단 후 재검토</button></details>}
              {canApprove && ['rejected', 'duplicate', 'withdrawn', 'confirmed'].includes(selected.status) && <div className="mt-4 rounded-xl bg-slate-50 p-4"><h4 className="flex items-center gap-2 text-sm font-black"><Archive size={17} />처리 종료</h4><textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} rows={2} placeholder="종료 사유 (10자 이상)" className={inputClass} /><button type="button" onClick={() => run(() => archiveReport(selected.reportId, selected.version, archiveReason.trim()), 'archived')} disabled={submitting || archiveReason.trim().length < 10} className="mt-2 w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">보존기간을 설정하고 종료</button></div>}
            </section>}
          </div>}
        </div>
      </div>
    </section>
  );
}
