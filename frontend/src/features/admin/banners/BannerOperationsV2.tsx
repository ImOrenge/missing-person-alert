import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Send, StopCircle } from 'lucide-react';
import { createAdminBanner, fetchAdminBanners, transitionAdminBanner } from '../../../services/bannerServiceV2';
import type { AdminBannerRecord } from '../../../services/bannerServiceV2';
import type { AdminRoles } from '../../../utils/adminUtils';

const localDateTime = (offsetHours: number) => {
  const date = new Date(Date.now() + offsetHours * 60 * 60_000 - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
};

interface BannerOperationsV2Props { roles: AdminRoles; }

export default function BannerOperationsV2({ roles }: BannerOperationsV2Props) {
  const canAuthor = roles.reportModerator || roles.seniorModerator || roles.systemAdmin;
  const canApproveOrEnd = roles.seniorModerator || roles.systemAdmin;
  const [items, setItems] = useState<AdminBannerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ kind: 'emergency' as 'emergency' | 'info', severity: 'critical' as 'critical' | 'high' | 'normal', title: '', summary: '', sourceLabel: '실종자알림 운영팀', startsAt: localDateTime(0), endsAt: localDateTime(24), actionLabel: '자세히 보기', actionHref: '/map', dismissible: false });

  const load = useCallback(() => {
    if (!canAuthor) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchAdminBanners()
      .then(setItems)
      .catch((requestError: any) => setError(requestError?.response?.data?.error || '배너를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [canAuthor]);

  useEffect(load, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!canAuthor) return setError('배너 작성 권한이 없습니다.');
    try {
      await createAdminBanner({ kind: form.kind, severity: form.severity, title: form.title, summary: form.summary, sourceLabel: form.sourceLabel, targetRegionCodes: [], startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(), action: { label: form.actionLabel, href: form.actionHref }, dismissible: form.dismissible });
      setForm((current) => ({ ...current, title: '', summary: '' }));
      load();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || '배너를 생성하지 못했습니다.');
    }
  };

  const transition = async (id: string, action: 'submit' | 'approve' | 'end') => {
    try {
      await transitionAdminBanner(id, action);
      load();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || '배너 상태를 변경하지 못했습니다.');
    }
  };

  if (!canAuthor) return <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="text-lg font-black text-amber-950">배너 운영 권한 없음</h2><p className="mt-2 text-sm text-amber-900">reportModerator, seniorModerator 또는 systemAdmin 역할이 필요합니다.</p></section>;

  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 p-5"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d94841]">BANNER OPERATIONS V2</p><h2 className="mt-1 text-xl font-black text-slate-950">긴급·정보 배너 승인 운영</h2><p className="mt-1 text-sm text-slate-500">작성자와 승인자는 달라야 하며 모든 전이는 감사 로그로 남습니다.</p></div>
    <form onSubmit={create} className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-2"><select value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as 'emergency' | 'info' }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm"><option value="emergency">긴급</option><option value="info">정보</option></select><select value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value as 'critical' | 'high' | 'normal' }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm"><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option></select><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="배너 제목" required maxLength={100} className="h-10 rounded-lg border border-slate-200 px-3 text-sm sm:col-span-2" /><textarea value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} placeholder="10자 이상의 안전 안내" required minLength={10} maxLength={500} rows={3} className="rounded-lg border border-slate-200 p-3 text-sm sm:col-span-2" /><input value={form.sourceLabel} onChange={(event) => setForm((current) => ({ ...current, sourceLabel: event.target.value }))} placeholder="출처" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" /><input value={form.actionHref} onChange={(event) => setForm((current) => ({ ...current, actionHref: event.target.value }))} placeholder="/map" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" /><label className="text-xs font-bold text-slate-600">시작<input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 font-normal" /></label><label className="text-xs font-bold text-slate-600">종료<input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 font-normal" /></label><button type="submit" className="flex items-center justify-center gap-2 rounded-lg bg-[#10213a] px-4 py-2.5 text-sm font-black text-white sm:col-span-2"><Plus size={16} />초안 생성</button></form>
    {error && <p className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert"><AlertTriangle className="mr-2 inline" size={16} />{error}</p>}
    <div className="p-5">{loading ? <p className="py-8 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin" />불러오는 중</p> : <div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black text-[#d94841]">{item.kind} · {item.severity} · rev {item.revision}</p><h3 className="mt-1 font-black text-slate-950">{item.title}</h3><p className="mt-1 text-sm text-slate-600">{item.summary}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{item.state}</span></div><div className="mt-3 flex flex-wrap gap-2">{item.state === 'draft' && <button type="button" onClick={() => transition(item.id, 'submit')} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"><Send size={14} />승인 요청</button>}{canApproveOrEnd && item.state === 'pending_approval' && <button type="button" onClick={() => transition(item.id, 'approve')} className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white"><CheckCircle2 size={14} />승인</button>}{canApproveOrEnd && ['scheduled', 'published'].includes(item.state) && <button type="button" onClick={() => transition(item.id, 'end')} className="flex items-center gap-1 rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white"><StopCircle size={14} />종료</button>}</div></article>)}</div>}</div>
  </section>;
}
