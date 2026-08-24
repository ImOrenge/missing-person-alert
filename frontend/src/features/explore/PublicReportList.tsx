import React from 'react';
import { ArrowRight, MapPin, ShieldCheck } from 'lucide-react';
import type { PublicMapReportDto } from '../../types/publicReport';

interface Props { items: PublicMapReportDto[]; selectedId: string | null; onSelect: (id: string) => void; }

export default function PublicReportList({ items, selectedId, onSelect }: Props) {
  if (items.length === 0) return null;
  return <section className="border-b border-slate-200 bg-amber-50/60 p-3" aria-labelledby="public-report-map-list-title"><div className="flex items-center justify-between"><h2 id="public-report-map-list-title" className="text-xs font-black text-amber-900">승인 공개 제보 {items.length}건</h2><span className="flex items-center gap-1 text-[10px] font-bold text-amber-800"><ShieldCheck size={12} />운영 검토 완료</span></div><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{items.slice(0, 20).map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} aria-pressed={selectedId === item.id} className={`w-80 flex-none rounded-lg border bg-white p-3 text-left ${selectedId === item.id ? 'border-amber-700 ring-2 ring-amber-100' : 'border-amber-100'}`}><strong className="block text-sm text-slate-900">{item.publicLocationText}</strong><span className="mt-1 block whitespace-pre-wrap text-xs leading-5 text-slate-600">{item.publicDescription}</span><span className="mt-2 flex items-center gap-1 text-[10px] font-bold text-amber-800"><MapPin size={11} />약 {item.publicRadiusM}m 범위 <ArrowRight className="ml-auto" size={11} /></span></button>)}</div></section>;
}
