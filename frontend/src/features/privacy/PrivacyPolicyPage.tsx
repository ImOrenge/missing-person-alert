import React from 'react';
import { ExternalLink, FileCheck2, Mail, ShieldCheck } from 'lucide-react';
import { PRIVACY_POLICY } from '../../components/LoginModal';

export default function PrivacyPolicyPage() {
  return (
    <article className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="privacy-policy-title">
      <header className="border-b border-slate-200 bg-slate-50 p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#10213a] text-white"><ShieldCheck size={21} /></span>
          <div>
            <p className="text-xs font-black tracking-[0.14em] text-[#d94841]">PRIVACY POLICY</p>
            <h2 id="privacy-policy-title" className="mt-1 text-2xl font-black text-slate-950">개인정보 처리방침</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">회원가입 없이 언제든지 확인할 수 있으며, 제보·알림에서 처리되는 정보와 이용자의 권리를 설명합니다.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900"><FileCheck2 className="mt-0.5 flex-none" size={16} /><span><strong className="block">검토 전 비공개·승인 후 공개</strong>승인 전에는 비공개이며, 승인 후에는 제보 본문과 주소 문구가 전체 공개될 수 있습니다. 연락처와 정확 좌표는 공개하지 않습니다.</span></div>
          <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><ShieldCheck className="mt-0.5 flex-none" size={16} /><span><strong className="block">권리 요청 창구</strong>열람·정정·삭제·처리정지와 동의 철회를 요청할 수 있습니다.</span></div>
        </div>
      </header>
      <div className="whitespace-pre-wrap px-5 py-6 text-sm leading-7 text-slate-700 sm:px-7">{PRIVACY_POLICY.trim()}</div>
      <footer className="border-t border-slate-200 bg-slate-50 p-5 sm:px-7">
        <a href="mailto:jmgi1024@gmail.com" className="inline-flex items-center gap-2 text-sm font-black text-[#1e3a5f]"><Mail size={16} />개인정보 문의 이메일 <ExternalLink size={14} /></a>
        <p className="mt-2 text-xs leading-5 text-slate-500">기술·운영 문의에 대한 답변은 법률 의견을 대신하지 않습니다.</p>
      </footer>
    </article>
  );
}
