import React from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from 'lucide-react';
import type { User } from 'firebase/auth';
import { DEFAULT_MODULE_ORDER, OPTIONAL_DASHBOARD_MODULES } from './dashboard-module-registry';
import { useDashboardPreferences } from './use-dashboard-preferences';

interface Props { user: User | null; }

export default function DashboardPersonalizationPanel({ user }: Props) {
  const { preferences, update, saving } = useDashboardPreferences(user, true);
  const move = (id: string, direction: -1 | 1) => {
    const optionalOrder = preferences.moduleOrder.filter((item) => OPTIONAL_DASHBOARD_MODULES.some((module) => module.id === item));
    const index = optionalOrder.indexOf(id as any);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= optionalOrder.length) return;
    [optionalOrder[index], optionalOrder[target]] = [optionalOrder[target], optionalOrder[index]];
    update({ ...preferences, moduleOrder: [...DEFAULT_MODULE_ORDER.filter((item) => !OPTIONAL_DASHBOARD_MODULES.some((module) => module.id === item)), ...optionalOrder] });
  };
  const toggleHidden = (id: any) => update({ ...preferences, hidden: preferences.hidden.includes(id) ? preferences.hidden.filter((item) => item !== id) : [...preferences.hidden, id] });
  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-black text-slate-950">대시보드 조작</h2><p className="mt-1 text-sm text-slate-500">긴급·검색·사건·112 영역은 안전을 위해 고정됩니다.</p></div>{saving && <span className="text-xs text-slate-400">동기화 중</span>}</div><div className="mt-5 space-y-2">{preferences.moduleOrder.filter((id) => OPTIONAL_DASHBOARD_MODULES.some((module) => module.id === id)).map((id, index, items) => { const module = OPTIONAL_DASHBOARD_MODULES.find((item) => item.id === id)!; const hidden = preferences.hidden.includes(module.id); return <div key={id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3"><span className="flex-1 text-sm font-bold text-slate-700">{module.label}</span><button type="button" onClick={() => move(id, -1)} disabled={index === 0} className="rounded-lg p-2 text-slate-500 disabled:opacity-25" aria-label={`${module.label} 위로 이동`}><ArrowUp size={16} /></button><button type="button" onClick={() => move(id, 1)} disabled={index === items.length - 1} className="rounded-lg p-2 text-slate-500 disabled:opacity-25" aria-label={`${module.label} 아래로 이동`}><ArrowDown size={16} /></button><button type="button" onClick={() => toggleHidden(module.id)} className="rounded-lg p-2 text-slate-500" aria-label={`${module.label} ${hidden ? '표시' : '숨기기'}`}>{hidden ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>; })}</div><div className="mt-5 flex flex-wrap gap-3"><label className="text-sm font-bold text-slate-700">보기 밀도<select value={preferences.density} onChange={(event) => update({ ...preferences, density: event.target.value as 'compact' | 'comfortable' })} className="ml-2 rounded-lg border border-slate-200 px-3 py-2 font-normal"><option value="comfortable">여유롭게</option><option value="compact">간결하게</option></select></label><button type="button" onClick={() => update({ ...preferences, moduleOrder: [...DEFAULT_MODULE_ORDER], hidden: [], collapsed: [], density: 'comfortable' })} className="ml-auto flex items-center gap-1 text-sm font-bold text-[#1e3a5f]"><RotateCcw size={15} />기본값 복원</button></div></section>;
}
