import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MissingPerson } from '../types';

interface MissingPersonToastProps {
  persons: MissingPerson[];
  onClose: () => void;
}

export default function MissingPersonToast({ persons, onClose }: MissingPersonToastProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('right');

  const currentPerson = persons[currentIndex];

  // 자동 슬라이드 (5초마다)
  useEffect(() => {
    if (persons.length <= 1) return;

    const interval = setInterval(() => {
      handleNext();
    }, 5000);

    return () => clearInterval(interval);
  }, [currentIndex, persons.length]);

  const handleNext = () => {
    setDirection('right');
    setCurrentIndex((prev) => (prev + 1) % persons.length);
  };

  const handlePrev = () => {
    setDirection('left');
    setCurrentIndex((prev) => (prev - 1 + persons.length) % persons.length);
  };

  if (!currentPerson) return null;

  return (
    <div className="relative bg-gradient-to-br from-slate-700 to-slate-800 text-white rounded-lg shadow-2xl p-4 min-w-[350px] max-w-[400px] border border-red-500/30">
      {/* 카운터 배지 */}
      <div className="absolute -top-2 -right-2 bg-red-500 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center shadow-lg">
        {persons.length}
      </div>

      {/* 닫기 버튼 */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-white/80 hover:text-white transition-colors"
      >
        <X size={20} />
      </button>

      {/* 헤더 */}
      <div className="mb-3">
        <h3 className="text-lg font-bold flex items-center gap-2">
          🚨 실종자 알림
        </h3>
        {persons.length > 1 && (
          <p className="text-xs text-white/80 mt-1">
            {currentIndex + 1} / {persons.length}명
          </p>
        )}
      </div>

      {/* 실종자 정보 (슬라이드 애니메이션) */}
      <div className="overflow-hidden">
        <div
          key={currentPerson.id}
          className={`animate-slide-in-${direction}`}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold">{currentPerson.name}</p>
                <p className="text-sm text-white/90">
                  {currentPerson.age}세 · {currentPerson.gender === 'M' ? '남성' : '여성'}
                </p>
              </div>
            </div>

            {currentPerson.location?.address && (
              <div className="bg-slate-600/50 rounded-lg p-2 border border-slate-500/30">
                <p className="text-xs text-slate-300">실종 장소</p>
                <p className="text-sm font-semibold">{currentPerson.location.address}</p>
              </div>
            )}

            {currentPerson.missingDate && (
              <p className="text-xs text-slate-300">
                실종일: {(() => {
                  const date = new Date(currentPerson.missingDate);
                  if (isNaN(date.getTime())) {
                    // 날짜 파싱 실패 시 원본 문자열 표시
                    return currentPerson.missingDate;
                  }
                  return date.toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  });
                })()}
              </p>
            )}

            {currentPerson.description && (
              <p className="text-xs text-slate-200 line-clamp-2">
                {currentPerson.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 네비게이션 버튼 */}
      {persons.length > 1 && (
        <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-slate-600/50">
          <button
            onClick={handlePrev}
            className="p-1.5 hover:bg-slate-600/50 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="flex gap-1.5">
            {persons.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  idx === currentIndex
                    ? 'w-6 bg-red-400'
                    : 'w-1.5 bg-slate-500'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            className="p-1.5 hover:bg-slate-600/50 rounded-lg transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      {/* 하단 안내 */}
      <div className="mt-3 pt-3 border-t border-slate-600/50">
        <p className="text-xs text-slate-300 text-center">
          발견 시 즉시 <span className="font-bold text-red-400">112</span> 또는 <span className="font-bold text-red-400">182</span>로 신고해주세요
        </p>
      </div>
    </div>
  );
}
