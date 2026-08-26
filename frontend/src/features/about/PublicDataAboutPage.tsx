import React from 'react';
import {ArrowRight, Database, ExternalLink, FileCheck2, LockKeyhole, RefreshCw} from 'lucide-react';

export default function PublicDataAboutPage({
  onOpenMap,
  onOpenStatistics,
  onOpenImpact,
}: {
  onOpenMap: () => void;
  onOpenStatistics: () => void;
  onOpenImpact: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3" aria-label="공공데이터 처리 원칙">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Database className="text-[#1e3a5f]" size={22} /><h2 className="mt-3 font-black text-slate-950">공식 공개정보</h2><p className="mt-2 text-sm leading-6 text-slate-600">경찰청 안전Dream에서 공개 중인 수색정보와 경찰청 공공데이터 통계를 사용합니다.</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><RefreshCw className="text-[#1e3a5f]" size={22} /><h2 className="mt-3 font-black text-slate-950">변경 추적</h2><p className="mt-2 text-sm leading-6 text-slate-600">출처, 마지막 확인 시각, 원본 hash와 동기화 결과를 내부 원장에 남겨 공개값을 역추적합니다.</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><LockKeyhole className="text-[#1e3a5f]" size={22} /><h2 className="mt-3 font-black text-slate-950">종결·개인정보 보호</h2><p className="mt-2 text-sm leading-6 text-slate-600">종결되거나 공식 출처에서 내려간 사건은 공개 탐색·공유에서 제외하고 Analytics에 개인식별정보를 보내지 않습니다.</p></article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="data-flow-title">
        <p className="text-xs font-black tracking-[0.14em] text-[#d94841]">DATA FLOW</p>
        <h2 id="data-flow-title" className="mt-2 text-xl font-black text-slate-950">공식 원문에서 공개 화면까지</h2>
        <ol className="mt-5 grid gap-3 md:grid-cols-5">
          {['공식 데이터 확인', '원본 metadata 보존', '검증·정규화', '공개 필드 투영', '행동 지표 집계·승인'].map((step, index) => <li key={step} className="rounded-xl bg-slate-50 p-4"><span className="text-xs font-black text-[#d94841]">0{index + 1}</span><strong className="mt-2 block text-sm text-slate-900">{step}</strong></li>)}
        </ol>
        <p className="mt-4 text-sm leading-6 text-slate-600">MissingAlert는 공식 서비스를 대체하거나 수사기관의 확인을 보증하지 않습니다. 시민이 공개정보를 지도·검색·통계·공유 흐름에서 더 쉽게 발견하도록 돕는 접근성 레이어입니다.</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-2"><FileCheck2 className="text-emerald-700" size={20} /><h2 className="font-black text-slate-950">공개 지표 해석</h2></div><ul className="mt-4 space-y-2 text-sm leading-6 text-slate-600"><li>• 카드 노출·상세조회·공유·공식 경로 이동은 정의된 이벤트 발생 횟수입니다.</li><li>• CTA 클릭은 실제 제보 제출이나 발견 기여를 뜻하지 않습니다.</li><li>• 월별 Impact는 BigQuery 원시 집계 대조와 관리자 승인을 마친 값만 공개합니다.</li><li>• 분모가 0인 비율은 0%로 꾸미지 않고 산정 불가로 표시합니다.</li></ul></article>
        <article className="rounded-2xl border border-blue-100 bg-blue-50 p-5 sm:p-6"><h2 className="font-black text-blue-950">공식 자료</h2><p className="mt-2 text-sm leading-6 text-blue-900">사건별 공식 원문 링크와 통계 자료의 기관·기준일·확인일을 함께 표시합니다.</p><a href="https://www.safe182.go.kr/" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm font-black text-blue-950 underline underline-offset-4">경찰청 안전Dream 확인 <ExternalLink size={15} /></a></article>
      </section>

      <nav className="grid gap-3 sm:grid-cols-3" aria-label="공공데이터 관련 화면">
        <button type="button" onClick={onOpenMap} className="flex items-center justify-between rounded-xl bg-[#10213a] p-4 text-left text-sm font-black text-white">공개 사건 지도 <ArrowRight size={17} /></button>
        <button type="button" onClick={onOpenStatistics} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left text-sm font-black text-slate-900">공식 연도별 통계 <ArrowRight size={17} /></button>
        <button type="button" onClick={onOpenImpact} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left text-sm font-black text-slate-900">공익성과·방법론 <ArrowRight size={17} /></button>
      </nav>
    </div>
  );
}
