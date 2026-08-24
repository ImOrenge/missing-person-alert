import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, FileCheck2, ImagePlus,
  Info, Loader2, MapPin, PhoneCall, ShieldCheck,
} from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { executeRecaptcha, loadRecaptchaScript } from '../../utils/recaptcha';
import { createReportV2 } from '../../services/reportingService';
import { uploadReportMediaDrafts, validateReportMedia, waitForReportMediaDrafts } from '../../services/reportMediaService';
import type { CreateReportV2Response, ReportLocationInput, ReportTypeV2 } from '../../types/reporting';
import ReportLocationPicker from './ReportLocationPicker';

interface ReportWizardProps {
  onComplete: () => void;
  mediaEnabled: boolean;
  submissionEnabled: boolean;
}

const STEP_LABELS = ['대상 선택', '목격 정보', '내용·연락', '검토·제출'];
const STEP_DESCRIPTIONS = [
  '어떤 사건에 관한 제보인지 선택합니다.',
  '언제, 어디에서 보았는지 기록합니다.',
  '확인한 사실과 선택 연락처를 작성합니다.',
  '비공개 접수 내용을 확인하고 제출합니다.',
];

const REPORT_TYPE_LABELS: Record<ReportTypeV2, string> = {
  sighting: '공식 사건 목격',
  lead: '공식 사건 관련 단서',
  new_case_lead: '새 실종 관련 단서',
};

const REPORT_TYPE_HELP: Record<ReportTypeV2, string> = {
  sighting: '공개된 실종 사건의 대상자를 직접 본 경우',
  lead: '공개된 사건과 관련된 장소·차량·물건 등의 단서',
  new_case_lead: '아직 이 서비스의 공식 사건을 특정하기 어려운 경우',
};

const createClientRequestId = () => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
};

const initialOccurredAt = () => {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
};

export default function ReportWizard({ onComplete, mediaEnabled, submissionEnabled }: ReportWizardProps) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [step, setStep] = useState(0);
  const [clientRequestId] = useState(createClientRequestId);
  const [reportType, setReportType] = useState<ReportTypeV2>(params.get('personId') ? 'sighting' : 'new_case_lead');
  const [caseId, setCaseId] = useState(params.get('personId') || '');
  const [occurredAt, setOccurredAt] = useState(initialOccurredAt);
  const [location, setLocation] = useState<ReportLocationInput | null>(null);
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [preferredContact, setPreferredContact] = useState<'phone' | 'email'>('phone');
  const [consent, setConsent] = useState({ processing: false, accuracy: false, sensitiveLocation: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CreateReportV2Response | null>(null);

  const occurredAtValid = Boolean(occurredAt) && Date.parse(occurredAt) <= Date.now() + 5 * 60_000;
  const phoneValid = !contactPhone.trim() || /^\+?[0-9][0-9 -]{7,19}$/.test(contactPhone.trim());
  const emailValid = !contactEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim());

  const validateStep = (targetStep = step) => {
    if (targetStep === 0 && reportType !== 'new_case_lead' && !caseId.trim()) return '공식 사건을 연결해 주세요. 사건을 특정하기 어렵다면 ‘새 실종 관련 단서’를 선택할 수 있습니다.';
    if (targetStep === 1 && !occurredAtValid) return '목격·발생 시각을 확인해 주세요. 미래 시각은 접수할 수 없습니다.';
    if (targetStep === 1 && !location) return '주소 검색 결과에서 목격 위치를 선택해 주세요.';
    if (targetStep === 2 && description.trim().length < 20) return '확인한 내용을 20자 이상 구체적으로 작성해 주세요.';
    if (targetStep === 2 && !phoneValid) return '연락 가능한 전화번호 형식을 확인해 주세요.';
    if (targetStep === 2 && !emailValid) return '연락 가능한 이메일 형식을 확인해 주세요.';
    if (targetStep === 3 && !Object.values(consent).every(Boolean)) return '필수 확인 항목 3개를 모두 확인해 주세요.';
    if (targetStep === 3 && !submissionEnabled) return '현재 제보 접수를 준비 중입니다. 잠시 후 다시 시도해 주세요.';
    return null;
  };

  const requirements = useMemo(() => {
    if (step === 0) return [
      { label: '제보 유형 선택', complete: true },
      { label: reportType === 'new_case_lead' ? '사건 연결 필요 없음' : '공식 사건 연결', complete: reportType === 'new_case_lead' || Boolean(caseId.trim()) },
    ];
    if (step === 1) return [
      { label: '목격·발생 시각', complete: occurredAtValid },
      { label: '검색 결과에서 위치 선택', complete: Boolean(location) },
    ];
    if (step === 2) return [
      { label: `확인한 내용 20자 이상 (${description.trim().length}/20)`, complete: description.trim().length >= 20 },
      { label: '연락처 형식 확인', complete: phoneValid && emailValid },
    ];
    return [
      { label: `필수 확인 ${Object.values(consent).filter(Boolean).length}/3`, complete: Object.values(consent).every(Boolean) },
      { label: submissionEnabled ? '비공개 접수 가능' : '현재 접수 준비 중', complete: submissionEnabled },
    ];
  }, [caseId, consent, description, emailValid, location, occurredAtValid, phoneValid, reportType, step, submissionEnabled]);

  const next = () => {
    const validationError = validateStep();
    if (validationError) return setError(validationError);
    setError(null);
    setStep((current) => Math.min(STEP_LABELS.length - 1, current + 1));
  };

  const submit = async () => {
    const validationError = validateStep();
    if (validationError || !location) return setError(validationError || '위치를 확인해 주세요.');
    const user = getAuth().currentUser;
    if (!user) return setError('로그인이 필요합니다.');
    setSubmitting(true);
    setError(null);
    try {
      validateReportMedia(files);
      await loadRecaptchaScript();
      const recaptchaToken = await executeRecaptcha('report_submit');
      const mediaIds = files.length > 0 ? await uploadReportMediaDrafts(files, user.uid, clientRequestId) : [];
      await waitForReportMediaDrafts(clientRequestId, mediaIds);
      const response = await createReportV2({
        clientRequestId,
        caseId: caseId.trim() || undefined,
        reportType,
        occurredAt: new Date(occurredAt).toISOString(),
        location,
        description: description.trim(),
        mediaIds,
        ...((contactPhone.trim() || contactEmail.trim()) ? {
          contact: {
            phone: contactPhone.trim() || undefined,
            email: contactEmail.trim() || undefined,
            preferred: contactPhone.trim() && contactEmail.trim()
              ? preferredContact
              : contactPhone.trim() ? 'phone' as const : 'email' as const,
          },
        } : {}),
        consent,
      }, recaptchaToken);
      setReceipt(response);
    } catch (submitError: any) {
      setError(submitError?.response?.data?.error || submitError?.message || '제보를 접수하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-emerald-100 bg-white p-6 text-center shadow-sm sm:p-8">
        <CheckCircle2 className="mx-auto text-emerald-600" size={48} />
        <h2 className="mt-4 text-2xl font-black text-slate-950">제보가 비공개로 접수되었습니다</h2>
        <p className="mt-2 text-sm text-slate-600">운영자가 내용을 검토하기 전에는 지도·검색·알림에 공개되지 않습니다.</p>
        <div className="mx-auto mt-5 max-w-sm rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">접수번호</p><p className="mt-1 font-mono text-lg font-black text-[#1e3a5f]">{receipt.receiptNumber}</p><p className="mt-2 text-xs font-bold text-emerald-700">{receipt.displayStatus}</p></div>
        {receipt.nextActions.length > 0 && <ul className="mx-auto mt-4 max-w-md space-y-2 text-left text-sm text-slate-600">{receipt.nextActions.map((action) => <li key={action} className="flex gap-2"><Check className="mt-0.5 flex-none text-emerald-600" size={16} />{action}</li>)}</ul>}
        <button type="button" onClick={onComplete} className="mt-6 rounded-lg bg-[#10213a] px-5 py-2.5 text-sm font-black text-white">내 제보 진행상황 보기</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-50/70 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black tracking-[0.16em] text-[#d94841]">안전 제보 접수</p><h1 className="mt-1 text-2xl font-black text-slate-950">확인한 사실을 알려주세요</h1><p className="mt-2 text-sm leading-6 text-slate-600">약 3분 소요 · 입력 내용은 먼저 비공개로 접수됩니다.</p></div><span className="rounded-full bg-[#10213a] px-3 py-1.5 text-xs font-black text-white">{step + 1} / {STEP_LABELS.length}</span></div>
        <ol className="mt-5 grid grid-cols-4 gap-2" aria-label="제보 작성 진행률">{STEP_LABELS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}><div className={`h-1.5 rounded-full ${index <= step ? 'bg-[#1e3a5f]' : 'bg-slate-200'}`} /><span className={`mt-2 block text-[11px] font-bold ${index === step ? 'text-slate-950' : 'text-slate-400'}`}>{label}</span></li>)}</ol>
      </header>

      <div className="p-5 sm:p-7">
        <a href="tel:112" className="mb-6 flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-800"><PhoneCall className="flex-none" size={20} /><span>현재 위험하거나 즉시 출동이 필요하면 온라인 입력보다 <strong>112 신고</strong>가 우선입니다.</span><ArrowRight className="ml-auto flex-none" size={17} /></a>
        <div className="mb-6"><p className="text-xs font-black text-[#d94841]">{STEP_LABELS[step]}</p><h2 className="mt-1 text-xl font-black text-slate-950">{STEP_DESCRIPTIONS[step]}</h2></div>

        {step === 0 && <div><fieldset><legend className="text-sm font-black text-slate-800">제보 유형 <span className="text-red-600">*</span></legend><div className="mt-3 grid gap-3 sm:grid-cols-3">{(Object.keys(REPORT_TYPE_LABELS) as ReportTypeV2[]).map((value) => <button key={value} type="button" onClick={() => setReportType(value)} aria-pressed={reportType === value} className={`rounded-xl border p-4 text-left ${reportType === value ? 'border-[#1e3a5f] bg-blue-50 ring-1 ring-[#1e3a5f]' : 'border-slate-200 hover:bg-slate-50'}`}><span className="block text-sm font-black text-slate-900">{REPORT_TYPE_LABELS[value]}</span><span className="mt-2 block text-xs leading-5 text-slate-500">{REPORT_TYPE_HELP[value]}</span></button>)}</div></fieldset>{reportType !== 'new_case_lead' && <label className="mt-5 block text-sm font-bold text-slate-700">공식 사건 연결 <span className="text-red-600">*</span><input value={caseId} onChange={(event) => setCaseId(event.target.value)} maxLength={200} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 font-normal outline-none focus:border-[#1e3a5f]" placeholder="사건 상세의 ‘제보하기’에서 자동으로 연결됩니다" /><span className="mt-2 block text-xs font-normal leading-5 text-slate-500">사건 ID를 모르면 사건 상세에서 다시 제보하거나 ‘새 실종 관련 단서’를 선택해 주세요.</span></label>}</div>}

        {step === 1 && <div><label className="block text-sm font-bold text-slate-700">목격·발생 시각 <span className="text-red-600">*</span><span className="relative mt-2 block"><Clock3 className="absolute left-3 top-3 text-slate-400" size={18} /><input type="datetime-local" value={occurredAt} max={initialOccurredAt()} onChange={(event) => setOccurredAt(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 pl-10 pr-3 font-normal outline-none focus:border-[#1e3a5f]" /></span></label><p className="mt-2 text-xs leading-5 text-slate-500">정확하지 않아도 기억나는 범위에서 가장 가까운 시각을 입력해 주세요.</p><div className="mt-6"><div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700"><MapPin size={17} />목격·발생 위치 <span className="text-red-600">*</span></div><ReportLocationPicker value={location} onChange={setLocation} /><p className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 flex-none" size={15} />승인된 공개 제보에는 입력한 주소 문구가 전체 표시되며, 지도 좌표만 선택한 안전 반경 안에서 비식별화됩니다.</p></div></div>}

        {step === 2 && <div><label className="block text-sm font-bold text-slate-700">확인한 내용 <span className="text-red-600">*</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={7} className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-normal leading-6 outline-none focus:border-[#1e3a5f]" placeholder="인상착의, 이동 방향, 함께 있던 사람 등 직접 확인한 사실을 시간 순서로 적어 주세요." /></label><div className="mt-1 flex justify-between text-xs"><span className={description.trim().length >= 20 ? 'font-bold text-emerald-700' : 'text-slate-500'}>최소 20자</span><span className="text-slate-400">{description.length}/2000</span></div>{mediaEnabled ? <><label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm font-bold text-slate-600 hover:bg-slate-50"><ImagePlus size={21} />사진 첨부 <span className="font-normal text-slate-400">선택 · 최대 5장, 각 10MB</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event) => { const nextFiles = Array.from(event.target.files || []); try { validateReportMedia(nextFiles); setFiles(nextFiles); setError(null); } catch (fileError: any) { setError(fileError.message); } }} /></label>{files.length > 0 && <p className="mt-2 text-xs font-bold text-emerald-700">{files.length}장 선택됨 · 원본은 비공개 저장</p>}</> : <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"><ImagePlus className="mt-0.5 flex-none text-slate-400" size={20} /><div><strong className="block text-slate-800">사진 첨부는 현재 준비 중입니다</strong><span className="mt-1 block text-xs leading-5">텍스트 제보는 정상적으로 접수할 수 있습니다.</span></div></div>}<fieldset className="mt-5 rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-black text-slate-800">회신 연락처 <span className="font-normal text-slate-400">선택</span></legend><p className="mb-3 text-xs leading-5 text-slate-500">추가 확인이 필요한 경우에만 사용하며 KMS로 암호화해 별도 보관합니다.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">전화번호<input type="tel" autoComplete="tel" inputMode="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} maxLength={20} placeholder="010-1234-5678" className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 font-normal outline-none focus:border-[#1e3a5f]" /></label><label className="text-xs font-bold text-slate-600">이메일<input type="email" autoComplete="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength={254} placeholder="name@example.com" className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 font-normal outline-none focus:border-[#1e3a5f]" /></label></div>{contactPhone.trim() && contactEmail.trim() && <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-700"><span className="font-bold">우선 연락:</span><label className="flex items-center gap-1"><input type="radio" name="preferred-contact" value="phone" checked={preferredContact === 'phone'} onChange={() => setPreferredContact('phone')} />전화</label><label className="flex items-center gap-1"><input type="radio" name="preferred-contact" value="email" checked={preferredContact === 'email'} onChange={() => setPreferredContact('email')} />이메일</label></div>}</fieldset></div>}

        {step === 3 && <div><div className="grid gap-3 sm:grid-cols-2"><section className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-black text-slate-500">대상</p><p className="mt-2 text-sm font-bold text-slate-900">{REPORT_TYPE_LABELS[reportType]}</p><p className="mt-1 break-all text-xs text-slate-500">{caseId.trim() ? `사건 ${caseId.trim()}` : '공식 사건 미연결'}</p></section><section className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-black text-slate-500">언제·어디서</p><p className="mt-2 text-sm font-bold text-slate-900">{new Date(occurredAt).toLocaleString('ko-KR')}</p><p className="mt-1 text-xs text-slate-500">{location?.address}</p></section><section className="rounded-xl border border-slate-200 p-4 sm:col-span-2"><p className="text-xs font-black text-slate-500">확인한 내용</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{description}</p></section><section className="rounded-xl border border-slate-200 p-4 sm:col-span-2"><p className="text-xs font-black text-slate-500">첨부·회신</p><p className="mt-2 text-sm text-slate-700">사진 {files.length}장 · {[contactPhone.trim() && '전화 제공', contactEmail.trim() && '이메일 제공'].filter(Boolean).join(' · ') || '연락처 제공하지 않음'}</p></section></div><div className="mt-5 space-y-3">{([['processing','수색 지원과 제보 검토를 위한 개인정보 처리에 동의합니다.'],['accuracy','확인한 사실을 성실히 작성했으며 고의의 허위 제보가 아닙니다.'],['sensitiveLocation','승인 전에는 제보가 비공개이며, 승인 후에는 제보 본문과 주소 문구가 전체 공개되고 지도 좌표만 비식별화됨을 확인했습니다.']] as const).map(([key,label]) => <label key={key} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm leading-6 text-slate-700"><input type="checkbox" checked={consent[key]} onChange={(event) => setConsent((current) => ({ ...current, [key]: event.target.checked }))} className="mt-1" /><span>{label}</span></label>)}</div><div className="mt-5 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-[#1e3a5f]"><ShieldCheck className="mt-0.5 flex-none" size={17} />제출하면 먼저 비공개 검토 대기 상태가 됩니다. 공개 승인 후에는 제보 본문과 주소 문구가 전체 공개되며, 연락처·계정 식별자·정확 좌표는 공개되지 않습니다.</div></div>}

        {step === 3 && <p className="mt-3 text-right text-xs text-slate-600"><a href="/privacy" target="_blank" rel="noreferrer" className="font-black text-[#1e3a5f] underline underline-offset-2">개인정보 처리방침 전문 보기</a></p>}
        <div className="mt-6 rounded-xl bg-slate-50 p-4" aria-label="이 단계의 완료 조건"><p className="flex items-center gap-2 text-xs font-black text-slate-700"><Info size={15} />이 단계의 완료 조건</p><ul className="mt-2 grid gap-2 sm:grid-cols-2">{requirements.map((requirement) => <li key={requirement.label} className={`flex items-center gap-2 text-xs font-bold ${requirement.complete ? 'text-emerald-700' : 'text-slate-500'}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full ${requirement.complete ? 'bg-emerald-100' : 'bg-slate-200'}`}>{requirement.complete && <Check size={13} />}</span>{requirement.label}</li>)}</ul></div>
        {error && <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700" role="alert">{error}</p>}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 p-4 sm:px-7"><button type="button" onClick={() => { setError(null); setStep((current) => Math.max(0, current - 1)); }} disabled={step === 0 || submitting} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold text-slate-600 disabled:opacity-30"><ArrowLeft size={16} />이전</button>{step < STEP_LABELS.length - 1 ? <button type="button" onClick={next} className="flex items-center gap-1 rounded-lg bg-[#10213a] px-4 py-2.5 text-sm font-black text-white">다음: {STEP_LABELS[step + 1]} <ArrowRight size={16} /></button> : <button type="button" onClick={submit} disabled={submitting || !submissionEnabled} className="flex items-center gap-2 rounded-lg bg-[#d94841] px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{submitting ? <Loader2 className="animate-spin" size={17} /> : <FileCheck2 size={17} />}{submitting ? '비공개로 접수 중' : '비공개로 제보 제출'}</button>}</div>
    </div>
  );
}
