import React from 'react';
import { ChevronLeft, ChevronRight, Info, AlertTriangle } from 'lucide-react';
import type { Announcement } from '../types/announcement';

interface Props {
  announcement: Announcement;
  onPrev: () => void;
  onNext: () => void;
}

export default function AnnouncementBanner({ announcement, onPrev, onNext }: Props) {
  const isWarning = announcement.type === 'warning';

  return (
    <div className={`${isWarning ? 'bg-yellow-500' : 'bg-red-800'} px-4 py-2`}>
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <button
          onClick={onPrev}
          className="p-1 hover:bg-white/20 rounded transition-colors"
          aria-label="이전 공지"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex-1 flex items-center justify-center gap-2 text-sm">
          {isWarning ? (
            <AlertTriangle size={16} className="flex-shrink-0" />
          ) : (
            <Info size={16} className="flex-shrink-0" />
          )}
          <p className={`text-center ${isWarning ? 'text-gray-900 font-semibold' : 'text-white'}`}>
            {announcement.text}
          </p>
        </div>

        <button
          onClick={onNext}
          className="p-1 hover:bg-white/20 rounded transition-colors"
          aria-label="다음 공지"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
