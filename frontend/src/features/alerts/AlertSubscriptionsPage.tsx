import React, { useEffect, useState } from 'react';
import { AlertCircle, Bell, BellOff, CheckCircle2, Loader2, Moon, ShieldCheck } from 'lucide-react';
import { getAlertSubscriptions, saveAlertSubscriptions } from '../../services/alertSubscriptionService';
import type { PushPermissionStatus } from '../../hooks/usePushNotifications';
import type { AlertSubscriptionSettings } from '../../types/alerts';

const REGION_OPTIONS = [
  ['seoul','서울'],['busan','부산'],['daegu','대구'],['incheon','인천'],['gwangju','광주'],['daejeon','대전'],['ulsan','울산'],['sejong','세종'],['gyeonggi','경기'],['gangwon','강원'],['chungbuk','충북'],['chungnam','충남'],['jeonbuk','전북'],['jeonnam','전남'],['gyeongbuk','경북'],['gyeongnam','경남'],['jeju','제주'],
] as const;

const EMPTY: AlertSubscriptionSettings = { caseIds: [], regionCodes: [], radius: null, pushEnabled: false, quietHours: { enabled: false, start: '22:00', end: '07:00', allowEmergency: true }, deliveryReady: false };

type PushActionResult = { status: PushPermissionStatus; token?: string };

interface AlertSubscriptionsPageProps {
  pushStatus: PushPermissionStatus;
  pushProcessing: boolean;
  enablePush: () => Promise<PushActionResult>;
  disablePush: () => Promise<PushActionResult>;
}

const getErrorMessage = (requestError: any, fallback: string) =>
  requestError?.response?.data?.error || requestError?.message || fallback;

export default function AlertSubscriptionsPage({ pushStatus, pushProcessing, enablePush, disablePush }: AlertSubscriptionsPageProps) {
  const [settings, setSettings] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getAlertSubscriptions(controller.signal).then(setSettings).catch((requestError: any) => !controller.signal.aborted && setError(requestError?.response?.data?.error || '알림 설정을 불러오지 못했습니다.')).finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, []);

  const toggleRegion = (code: string) => {
    setSettings((current) => {
      const selected = current.regionCodes.includes(code);
      if (!selected && current.regionCodes.length >= 5) { setError('관심 지역은 최대 5개까지 선택할 수 있습니다.'); return current; }
      setError(null);
      return { ...current, regionCodes: selected ? current.regionCodes.filter((item) => item !== code) : [...current.regionCodes, code] };
    });
  };

  const save = async () => {
    setSaving(true); setError(null); setMessage(null);
    try {
      if (settings.pushEnabled) {
        if (pushStatus === 'unsupported') {
          throw new Error('이 브라우저에서는 푸시 알림을 지원하지 않습니다. 지원되는 모바일 브라우저에서 다시 시도해주세요.');
        }
        if (pushStatus === 'blocked') {
          throw new Error('브라우저에서 알림이 차단되어 있습니다. 주소창의 사이트 설정에서 알림을 허용한 뒤 다시 저장해주세요.');
        }
        if (pushStatus !== 'enabled') {
          const activation = await enablePush();
          if (activation.status !== 'enabled') {
            throw new Error('알림 권한이 허용되지 않아 기기 등록을 완료하지 못했습니다.');
          }
        }
      }

      const deliveryReady = await saveAlertSubscriptions({ caseIds: settings.caseIds, regionCodes: settings.regionCodes, radius: settings.radius, pushEnabled: settings.pushEnabled, quietHours: settings.quietHours });
      if (!settings.pushEnabled && pushStatus === 'enabled') {
        await disablePush();
      }
      setSettings((current) => ({ ...current, deliveryReady }));
      setMessage(deliveryReady ? '기기 연결과 알림 설정을 저장했습니다.' : '설정을 저장했습니다. 발송 큐 승인 전까지 실제 푸시는 일시 중지됩니다.');
    } catch (requestError: any) { setError(getErrorMessage(requestError, '알림 설정을 저장하지 못했습니다.')); }
    finally { setSaving(false); }
  };

  const pushStatusNotice = settings.pushEnabled && pushStatus !== 'enabled' ? (
    <p className={`mt-3 rounded-lg p-3 text-xs leading-5 ${pushStatus === 'blocked' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`} role="status">
      <BellOff className="mr-1 inline" size={14} />
      {pushStatus === 'blocked'
        ? '브라우저 알림이 차단되어 있습니다. 사이트 설정에서 알림을 허용해야 기기 등록이 완료됩니다.'
        : pushStatus === 'unsupported'
          ? '이 브라우저에서는 푸시 알림을 지원하지 않습니다.'
          : '설정 저장을 누르면 브라우저 알림 권한을 요청하고 이 기기를 안전하게 등록합니다.'}
    </p>
  ) : settings.pushEnabled && pushStatus === 'enabled' ? (
    <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-800" role="status">
      <CheckCircle2 className="mr-1 inline" size={14} />이 기기가 푸시 알림에 연결되었습니다.
    </p>
  ) : null;

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500" role="status"><Loader2 className="mx-auto mb-3 animate-spin" />알림 설정을 불러오는 중입니다.</div>;
  return <div className="space-y-5"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><Bell className="mt-0.5 text-[#1e3a5f]" /><div><h2 className="font-black text-slate-950">푸시 알림</h2><p className="mt-1 text-sm leading-6 text-slate-500">승인된 공개 정보만 알림에 사용하며 정확 위치와 연락처는 포함하지 않습니다.</p></div></div><label className="mt-4 flex items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={settings.pushEnabled} onChange={(event) => setSettings((current) => ({ ...current, pushEnabled: event.target.checked }))} />FCM 푸시 사용</label>{pushStatusNotice}{!settings.deliveryReady && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800"><AlertCircle className="mr-1 inline" size={14} />Cloud Tasks 발송 큐와 운영 승인 전이라 실제 발송은 비활성 상태입니다.</p>}</section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-950">관심 지역(최대 5개)</h2><div className="mt-4 flex flex-wrap gap-2">{REGION_OPTIONS.map(([code,label]) => <button key={code} type="button" onClick={() => toggleRegion(code)} aria-pressed={settings.regionCodes.includes(code)} className={`rounded-lg px-3 py-2 text-xs font-bold ${settings.regionCodes.includes(code) ? 'bg-[#10213a] text-white' : 'border border-slate-200 text-slate-600'}`}>{label}</button>)}</div><label className="mt-5 block text-sm font-bold text-slate-700">10km 반경 기준 지역<select value={settings.radius?.regionCode || ''} onChange={(event) => setSettings((current) => ({ ...current, radius: event.target.value ? { regionCode: event.target.value, distanceKm: 10 } : null }))} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 font-normal"><option value="">사용하지 않음</option>{REGION_OPTIONS.map(([code,label]) => <option key={code} value={code}>{label}</option>)}</select></label><p className="mt-2 text-xs text-slate-500">반경 알림은 사용자의 정확 좌표가 아니라 선택한 지역 중심과 공개 위치를 사용합니다.</p></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Moon size={18} className="text-[#1e3a5f]" /><h2 className="font-black text-slate-950">야간 알림</h2></div><label className="mt-4 flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={settings.quietHours.enabled} onChange={(event) => setSettings((current) => ({ ...current, quietHours: { ...current.quietHours, enabled: event.target.checked } }))} />야간 방해 금지</label><div className="mt-3 grid grid-cols-2 gap-3"><input type="time" value={settings.quietHours.start} onChange={(event) => setSettings((current) => ({ ...current, quietHours: { ...current.quietHours, start: event.target.value } }))} className="h-10 rounded-lg border border-slate-200 px-3" /><input type="time" value={settings.quietHours.end} onChange={(event) => setSettings((current) => ({ ...current, quietHours: { ...current.quietHours, end: event.target.value } }))} className="h-10 rounded-lg border border-slate-200 px-3" /></div><label className="mt-3 flex items-start gap-3 text-sm"><input type="checkbox" checked={settings.quietHours.allowEmergency} onChange={(event) => setSettings((current) => ({ ...current, quietHours: { ...current.quietHours, allowEmergency: event.target.checked } }))} className="mt-1" />별도 동의한 긴급 알림은 야간에도 허용</label></section>{error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}{message && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700" role="status"><CheckCircle2 size={17} />{message}</p>}<button type="button" onClick={save} disabled={saving || pushProcessing} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#10213a] px-5 py-3 text-sm font-black text-white disabled:opacity-60">{saving || pushProcessing ? <Loader2 className="animate-spin" size={17} /> : <ShieldCheck size={17} />}{settings.pushEnabled && pushStatus !== 'enabled' ? '기기 알림 연결하고 저장' : '설정 저장'}</button></div>;
}
