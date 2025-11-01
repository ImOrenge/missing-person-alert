import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, TrendingUp, Users, FileText, MapPin, Calendar, RefreshCw, Clock, History, Activity, Copy, Check } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { toast } from 'react-toastify';

interface Statistics {
  reports: {
    total: number;
    userReports: number;
    apiReports: number;
    activeReports: number;
    resolvedReports: number;
    todayReports: number;
    weekReports: number;
    monthReports: number;
    yearReports: number;
  };
  users: {
    total: number;
    active: number;
    withReports: number;
    todayRegistered: number;
    weekRegistered: number;
  };
  locations: {
    name: string;
    count: number;
  }[];
  recentActivity: {
    type: 'report' | 'user';
    description: string;
    timestamp: string;
  }[];
  sessions: SessionStatistics;
}

interface LiveSession {
  sessionId: string;
  userId: string | null;
  userEmail: string | null;
  displayName: string | null;
  userAgent: string | null;
  platform: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  lastActive: number | null;
  isActive: boolean;
  lastActiveAgoMs: number | null;
}

interface SessionStatistics {
  totalSessions: number;
  todaySessions: number;
  activeSessions: number;
  activeAuthenticated: number;
  activeGuests: number;
  liveSessions: LiveSession[];
  lastUpdated: number | null;
  activeThresholdMinutes?: number;
}

type ShareRange = 'day' | 'week' | 'month' | 'year';

const SHARE_RANGE_LABELS: Record<ShareRange, string> = {
  day: '일간',
  week: '주간',
  month: '월간',
  year: '연간'
};

const SHARE_RANGE_DESCRIPTIONS: Record<ShareRange, string> = {
  day: '오늘',
  week: '최근 7일',
  month: '최근 30일',
  year: '최근 1년'
};

const SHARE_RANGE_REPORT_KEY: Record<ShareRange, keyof Statistics['reports']> = {
  day: 'todayReports',
  week: 'weekReports',
  month: 'monthReports',
  year: 'yearReports'
};

interface SummaryTotals {
  total: number;
  active: number;
  found: number;
  investigating: number;
  other: number;
}

interface SummaryBreakdown {
  status?: string;
  type?: string;
  gender?: string;
  region?: string;
  count: number;
}

interface SummaryRecentItem {
  id: string;
  maskedName: string;
  status: string;
  type: string;
  gender: string;
  region: string;
  missingDate: string | null;
  updatedAt: string | null;
  source: string;
}

interface Summary {
  totals: SummaryTotals;
  statuses: SummaryBreakdown[];
  types: SummaryBreakdown[];
  genders: SummaryBreakdown[];
  regions: SummaryBreakdown[];
  recent: SummaryRecentItem[];
  generatedAt: string | null;
  updatedAt: string | null;
}

export default function StatisticsTab() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('week');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryRefreshing, setSummaryRefreshing] = useState(false);
  const [shareRange, setShareRange] = useState<ShareRange>('day');
  const [copySuccess, setCopySuccess] = useState(false);

  const loadStatistics = useCallback(async () => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      toast.error('로그인이 필요합니다');
      return;
    }

    try {
      setLoading(true);
      const token = await user.getIdToken();
      const apiUrl = `${process.env.REACT_APP_API_URL || ''}/api/admin/statistics?range=${timeRange}`;

      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '통계 조회에 실패했습니다');
      }

      const rawStats = data.statistics || {};
      const rawReports = rawStats.reports || {};
      const rawUsers = rawStats.users || {};
      const rawSessions = rawStats.sessions || {};
      const normalizedStats: Statistics = {
        reports: {
          total: typeof rawReports.total === 'number' ? rawReports.total : 0,
          userReports: typeof rawReports.userReports === 'number' ? rawReports.userReports : 0,
          apiReports: typeof rawReports.apiReports === 'number' ? rawReports.apiReports : 0,
          activeReports: typeof rawReports.activeReports === 'number' ? rawReports.activeReports : 0,
          resolvedReports: typeof rawReports.resolvedReports === 'number' ? rawReports.resolvedReports : 0,
          todayReports: typeof rawReports.todayReports === 'number' ? rawReports.todayReports : 0,
          weekReports: typeof rawReports.weekReports === 'number' ? rawReports.weekReports : 0,
          monthReports: typeof rawReports.monthReports === 'number' ? rawReports.monthReports : 0,
          yearReports: typeof rawReports.yearReports === 'number' ? rawReports.yearReports : 0
        },
        users: {
          total: typeof rawUsers.total === 'number' ? rawUsers.total : 0,
          active: typeof rawUsers.active === 'number' ? rawUsers.active : 0,
          withReports: typeof rawUsers.withReports === 'number' ? rawUsers.withReports : 0,
          todayRegistered: typeof rawUsers.todayRegistered === 'number' ? rawUsers.todayRegistered : 0,
          weekRegistered: typeof rawUsers.weekRegistered === 'number' ? rawUsers.weekRegistered : 0
        },
        locations: Array.isArray(rawStats.locations) ? rawStats.locations : [],
        recentActivity: Array.isArray(rawStats.recentActivity) ? rawStats.recentActivity : [],
        sessions: {
          totalSessions: typeof rawSessions.totalSessions === 'number' ? rawSessions.totalSessions : 0,
          todaySessions: typeof rawSessions.todaySessions === 'number' ? rawSessions.todaySessions : 0,
          activeSessions: typeof rawSessions.activeSessions === 'number' ? rawSessions.activeSessions : 0,
          activeAuthenticated: typeof rawSessions.activeAuthenticated === 'number' ? rawSessions.activeAuthenticated : 0,
          activeGuests: typeof rawSessions.activeGuests === 'number' ? rawSessions.activeGuests : 0,
          liveSessions: Array.isArray(rawSessions.liveSessions) ? rawSessions.liveSessions.map((session: any) => ({
            sessionId: session.sessionId || 'unknown',
            userId: session.userId ?? null,
            userEmail: session.userEmail ?? null,
            displayName: session.displayName ?? null,
            userAgent: session.userAgent ?? null,
            platform: session.platform ?? null,
            createdAt: typeof session.createdAt === 'number' ? session.createdAt : null,
            updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : null,
            lastActive: typeof session.lastActive === 'number' ? session.lastActive : null,
            isActive: typeof session.isActive === 'boolean' ? session.isActive : true,
            lastActiveAgoMs: typeof session.lastActiveAgoMs === 'number' ? session.lastActiveAgoMs : null
          })) : [],
          lastUpdated: typeof rawSessions.lastUpdated === 'number' ? rawSessions.lastUpdated : null,
          activeThresholdMinutes: typeof rawSessions.activeThresholdMinutes === 'number'
            ? rawSessions.activeThresholdMinutes
            : 5
        }
      };

      setStats(normalizedStats);
    } catch (error: any) {
      console.error('통계 조회 실패:', error);
      toast.error(error.message || '통계 조회 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  const loadSummary = useCallback(async () => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      toast.error('로그인이 필요합니다');
      return;
    }

    try {
      setSummaryLoading(true);
      const token = await user.getIdToken();
      const apiUrl = `${process.env.REACT_APP_API_URL || ''}/api/admin/reports/summary`;

      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '리포트 조회에 실패했습니다');
      }

      const summaryData = data.summary || {};
      const normalizeBreakdown = (items: any[], key: 'status' | 'type' | 'gender' | 'region'): SummaryBreakdown[] => {
        if (!Array.isArray(items)) return [];
        return items.map((item) => ({
          [key]: typeof item[key] === 'string' ? item[key] : '미상',
          count: typeof item.count === 'number' ? item.count : 0
        })) as SummaryBreakdown[];
      };

      const normalizedSummary: Summary = {
        totals: {
          total: summaryData?.totals?.total ?? 0,
          active: summaryData?.totals?.active ?? 0,
          found: summaryData?.totals?.found ?? 0,
          investigating: summaryData?.totals?.investigating ?? 0,
          other: summaryData?.totals?.other ?? 0
        },
        statuses: normalizeBreakdown(summaryData.statuses || [], 'status'),
        types: normalizeBreakdown(summaryData.types || [], 'type'),
        genders: normalizeBreakdown(summaryData.genders || [], 'gender'),
        regions: normalizeBreakdown(summaryData.regions || [], 'region'),
        recent: Array.isArray(summaryData.recent)
          ? summaryData.recent.map((item: any) => ({
              id: typeof item.id === 'string' ? item.id : 'unknown',
              maskedName: typeof item.maskedName === 'string' ? item.maskedName : '미상',
              status: typeof item.status === 'string' ? item.status : 'unknown',
              type: typeof item.type === 'string' ? item.type : 'unknown',
              gender: typeof item.gender === 'string' ? item.gender : 'unknown',
              region: typeof item.region === 'string' ? item.region : '미상',
              missingDate: typeof item.missingDate === 'string' ? item.missingDate : null,
              updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : null,
              source: typeof item.source === 'string' ? item.source : 'unknown'
            }))
          : [],
        generatedAt: typeof summaryData.generatedAt === 'string' ? summaryData.generatedAt : null,
        updatedAt: typeof summaryData.updatedAt === 'string' ? summaryData.updatedAt : null
      };

      setSummary(normalizedSummary);
    } catch (error: any) {
      console.error('리포트 조회 실패:', error);
      toast.error(error.message || '리포트 조회 중 오류가 발생했습니다');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const handleRecalculateSummary = useCallback(async () => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      toast.error('로그인이 필요합니다');
      return;
    }

    try {
      setSummaryRefreshing(true);
      const token = await user.getIdToken();
      const apiUrl = `${process.env.REACT_APP_API_URL || ''}/api/admin/reports/summary/recalculate`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '리포트 재계산에 실패했습니다');
      }

      toast.success('리포트가 재계산되었습니다');
      await loadSummary();
    } catch (error: any) {
      console.error('리포트 재계산 실패:', error);
      toast.error(error.message || '리포트 재계산 중 오류가 발생했습니다');
    } finally {
      setSummaryRefreshing(false);
    }
  }, [loadSummary]);

  const shareSummaryText = useMemo(() => {
    if (!stats || !summary) {
      return '';
    }

    const rangeLabel = SHARE_RANGE_LABELS[shareRange];
    const periodLabel = SHARE_RANGE_DESCRIPTIONS[shareRange];
    const reportKey = SHARE_RANGE_REPORT_KEY[shareRange];
    const newReports = stats.reports[reportKey] ?? 0;

    const activeCount = summary.totals.active ?? 0;
    const foundCount = summary.totals.found ?? 0;
    const investigatingCount = summary.totals.investigating ?? 0;
    const otherCount = summary.totals.other ?? 0;

    const regionParts = summary.regions
      .filter((item) => typeof item.count === 'number' && item.count > 0)
      .slice(0, 3)
      .map((item) => `${(item.region || '미상')} ${item.count.toLocaleString()}건`);

    const regionLine = regionParts.length > 0
      ? `주요 제보 지역 TOP${regionParts.length}: ${regionParts.join(', ')}`
      : '주요 제보 지역 데이터가 부족합니다.';

    const totalLine = `누적 제보: 총 ${stats.reports.total.toLocaleString()}건 (사용자 ${stats.reports.userReports.toLocaleString()}건 · 기관/기타 ${stats.reports.apiReports.toLocaleString()}건)`;

    const statusParts = [
      `수색 중 ${activeCount.toLocaleString()}명`,
      `발견 완료 ${foundCount.toLocaleString()}명`,
      `조사 중 ${investigatingCount.toLocaleString()}명`
    ];

    if (otherCount > 0) {
      statusParts.push(`기타 ${otherCount.toLocaleString()}명`);
    }

    const statusLine = `현재 상태: ${statusParts.join(' · ')}`;

    const nowLabel = new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'long',
      timeStyle: 'short',
      hour12: false
    }).format(new Date());

    return [
      `[${rangeLabel} 실종 리포트] ${nowLabel} 기준`,
      `${periodLabel} 새로 접수된 실종 제보는 총 ${newReports.toLocaleString()}건입니다.`,
      statusLine,
      regionLine,
      totalLine,
      '모두의 관심과 공유가 실종자 수색에 큰 힘이 됩니다. #실종 #실종알림 #missingperson'
    ].join('\n');
  }, [stats, summary, shareRange]);
  useEffect(() => {
    loadStatistics();
    loadSummary();
  }, [loadStatistics, loadSummary]);

  useEffect(() => {
    if (!copySuccess) {
      return;
    }
    const timer = setTimeout(() => setCopySuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [copySuccess]);

  useEffect(() => {
    setCopySuccess(false);
  }, [shareRange, shareSummaryText]);

  const handleCopyShare = useCallback(async () => {
    if (!shareSummaryText) {
      toast.warn('복사할 요약이 없습니다.');
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      toast.error('복사를 지원하지 않는 환경입니다. 텍스트를 드래그하여 복사해주세요.');
      return;
    }

    try {
      await navigator.clipboard.writeText(shareSummaryText);
      setCopySuccess(true);
      toast.success('요약을 복사했습니다.');
    } catch (error) {
      console.error('요약 복사 실패:', error);
      toast.error('요약 복사에 실패했습니다.');
    }
  }, [shareSummaryText]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#95a5a6' }}>
        <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 10px' }} />
        <p>통계 데이터를 불러오는 중...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#95a5a6' }}>
        <BarChart3 size={48} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
        <p>통계 데이터를 불러올 수 없습니다</p>
      </div>
    );
  }

  const renderBreakdownList = (items: SummaryBreakdown[], key: 'status' | 'type' | 'gender' | 'region') => {
    if (!items || items.length === 0) {
      return (
        <div style={{ fontSize: '13px', color: '#95a5a6' }}>
          데이터가 없습니다
        </div>
      );
    }

    return (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '4px' }}>
        {items.slice(0, 5).map((item, index) => (
          <li
            key={`${key}-${index}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '13px',
              color: '#2d3436',
              backgroundColor: '#f8fafc',
              borderRadius: '6px',
              padding: '6px 10px'
            }}
          >
            <span style={{ fontWeight: 600 }}>{item[key] || '미상'}</span>
            <span>{item.count.toLocaleString()}명</span>
          </li>
        ))}
      </ul>
    );
  };

  const formatSummaryTimestamp = (value: string | null) => {
    if (!value) return '알 수 없음';
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '알 수 없음';
      return date.toLocaleString('ko-KR', { hour12: false });
    } catch {
      return value;
    }
  };

  const shareRanges: ShareRange[] = ['day', 'week', 'month', 'year'];
  const isShareReady = Boolean(shareSummaryText);

  return (
    <div>
      <div style={{ marginBottom: '32px', backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', color: '#1f2937', fontWeight: 'bold' }}>
              실종자 요약 리포트
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#6b7280' }}>
              실종자 현황을 이벤트 기반으로 집계한 관리자용 리포트
            </p>
            {summary && (
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                생성: {formatSummaryTimestamp(summary.generatedAt)} / 업데이트: {formatSummaryTimestamp(summary.updatedAt)}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={loadSummary}
              disabled={summaryLoading || summaryRefreshing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: 'white',
                color: '#1f2937',
                cursor: summaryLoading || summaryRefreshing ? 'not-allowed' : 'pointer',
                fontSize: '13px'
              }}
            >
              <RefreshCw size={14} className={summaryLoading ? 'animate-spin' : ''} />
              새로고침
            </button>
            <button
              onClick={handleRecalculateSummary}
              disabled={summaryRefreshing || summaryLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#2563eb',
                color: 'white',
                cursor: summaryRefreshing || summaryLoading ? 'not-allowed' : 'pointer',
                fontSize: '13px'
              }}
            >
              <Activity size={14} className={summaryRefreshing ? 'animate-spin' : ''} />
              재계산
            </button>
          </div>
        </div>

        {summaryLoading && !summary ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
            <RefreshCw size={24} className="animate-spin" style={{ marginBottom: '8px' }} />
            <p style={{ margin: 0, fontSize: '13px' }}>리포트를 불러오는 중입니다...</p>
          </div>
        ) : summary ? (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px' }}>
              <SummaryCard label="전체 등록" value={summary.totals.total} accent="#0ea5e9" />
              <SummaryCard label="수색 중" value={summary.totals.active} accent="#ef4444" />
              <SummaryCard label="발견 완료" value={summary.totals.found} accent="#22c55e" />
              <SummaryCard label="조사 중" value={summary.totals.investigating} accent="#f97316" />
              <SummaryCard label="기타 상태" value={summary.totals.other} accent="#6366f1" />
            </div>

            <SummarySection title="SNS 공유용 실종 리포트">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                {shareRanges.map((range) => {
                  const active = shareRange === range;
                  return (
                    <button
                      key={range}
                      onClick={() => setShareRange(range)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: active ? '1px solid #2563eb' : '1px solid #cbd5f5',
                        backgroundColor: active ? '#2563eb' : '#ffffff',
                        color: active ? '#ffffff' : '#1d4ed8',
                        fontSize: '12px',
                        fontWeight: active ? 700 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {SHARE_RANGE_LABELS[range]}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <textarea
                  value={shareSummaryText}
                  readOnly
                  placeholder="데이터를 불러오는 중입니다. 잠시만 기다려주세요."
                  style={{
                    width: '100%',
                    minHeight: '160px',
                    resize: 'vertical',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    padding: '12px',
                    fontSize: '13px',
                    lineHeight: 1.6,
                    color: '#1f2937',
                    backgroundColor: '#ffffff',
                    fontFamily: 'Pretendard, "Noto Sans KR", sans-serif'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    복사 후 해시태그나 문구를 상황에 맞게 다듬어 SNS에 공유하세요.
                  </span>
                  <button
                    onClick={handleCopyShare}
                    disabled={!isShareReady}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: isShareReady ? '#2563eb' : '#d1d5db',
                      color: isShareReady ? '#ffffff' : '#94a3b8',
                      cursor: isShareReady ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      fontWeight: 600,
                      transition: 'background-color 0.2s ease'
                    }}
                  >
                    {copySuccess ? <Check size={16} /> : <Copy size={16} />}
                    {copySuccess ? '복사 완료' : '요약 복사'}
                  </button>
                </div>
              </div>
            </SummarySection>

            <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <SummarySection title="상태별 현황">
                {renderBreakdownList(summary.statuses, 'status')}
              </SummarySection>
              <SummarySection title="유형별 분포">
                {renderBreakdownList(summary.types, 'type')}
              </SummarySection>
              <SummarySection title="성별 분포">
                {renderBreakdownList(summary.genders, 'gender')}
              </SummarySection>
              <SummarySection title="지역별 상위">
                {renderBreakdownList(summary.regions, 'region')}
              </SummarySection>
            </div>

            <SummarySection title="최근 등록된 실종자 (최대 20명)">
              {summary.recent && summary.recent.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>이름</th>
                      <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>상태</th>
                      <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>유형</th>
                      <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>성별</th>
                      <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>지역</th>
                      <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>실종일</th>
                      <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>출처</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recent.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1f2937' }}>{item.maskedName}</td>
                        <td style={{ padding: '8px 10px', color: '#475569' }}>{item.status}</td>
                        <td style={{ padding: '8px 10px', color: '#475569' }}>{item.type}</td>
                        <td style={{ padding: '8px 10px', color: '#475569' }}>{item.gender}</td>
                        <td style={{ padding: '8px 10px', color: '#475569' }}>{item.region}</td>
                        <td style={{ padding: '8px 10px', color: '#475569' }}>
                          {item.missingDate ? item.missingDate : '-'}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#475569' }}>{item.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                  최근 등록된 실종자 정보가 없습니다.
                </div>
              )}
            </SummarySection>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>
            리포트 데이터를 불러오지 못했습니다.
          </div>
        )}
      </div>

      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: '#2c3e50', fontWeight: 'bold' }}>
            시스템 통계
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#7f8c8d' }}>
            실종자 시스템의 전반적인 통계와 트렌드
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px', backgroundColor: 'white', padding: '4px', borderRadius: '8px', border: '1px solid #ddd' }}>
            <TimeRangeButton
              active={timeRange === 'day'}
              onClick={() => setTimeRange('day')}
              label="일간"
            />
            <TimeRangeButton
              active={timeRange === 'week'}
              onClick={() => setTimeRange('week')}
              label="주간"
            />
            <TimeRangeButton
              active={timeRange === 'month'}
              onClick={() => setTimeRange('month')}
              label="월간"
            />
          </div>
          <button
            onClick={loadStatistics}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            <RefreshCw size={14} />
            새로고침
          </button>
        </div>
      </div>

      {/* 주요 지표 */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#7f8c8d', fontWeight: '600', textTransform: 'uppercase' }}>
          주요 지표
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <MetricCard
            icon={<FileText size={24} />}
            label="전체 제보"
            value={stats.reports.total}
            color="#3498db"
            trend={stats.reports.todayReports > 0 ? `+${stats.reports.todayReports} 오늘` : undefined}
          />
          <MetricCard
            icon={<Users size={24} />}
            label="전체 사용자"
            value={stats.users.total}
            color="#9b59b6"
            trend={stats.users.todayRegistered > 0 ? `+${stats.users.todayRegistered} 오늘` : undefined}
          />
          <MetricCard
            icon={<TrendingUp size={24} />}
            label="활성 제보"
            value={stats.reports.activeReports}
            color="#27ae60"
          />
          <MetricCard
            icon={<Clock size={24} />}
            label="이번 주 제보"
            value={stats.reports.weekReports}
            color="#e67e22"
          />
          <MetricCard
            icon={<History size={24} />}
            label="누적 접속 세션"
            value={stats.sessions.totalSessions}
            color="#8e44ad"
            trend={stats.sessions.todaySessions > 0 ? `+${stats.sessions.todaySessions} 오늘` : undefined}
            trendColor="#8e44ad"
            trendBackground="#f4eaf7"
          />
          <MetricCard
            icon={<Activity size={24} />}
            label="현재 접속 세션"
            value={stats.sessions.activeSessions}
            color="#c0392b"
            helperText={`로그인 ${stats.sessions.activeAuthenticated.toLocaleString()} · 게스트 ${stats.sessions.activeGuests.toLocaleString()}`}
          />
        </div>
      </div>

      {/* 제보 통계 */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#7f8c8d', fontWeight: '600', textTransform: 'uppercase' }}>
          제보 상세 통계
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <SmallStatCard label="사용자 제보" value={stats.reports.userReports} total={stats.reports.total} color="#3498db" />
          <SmallStatCard label="API 제보" value={stats.reports.apiReports} total={stats.reports.total} color="#95a5a6" />
          <SmallStatCard label="해결됨" value={stats.reports.resolvedReports} total={stats.reports.total} color="#27ae60" />
          <SmallStatCard label="이번 달" value={stats.reports.monthReports} total={stats.reports.total} color="#9b59b6" />
        </div>
      </div>

      {/* 사용자 통계 */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#7f8c8d', fontWeight: '600', textTransform: 'uppercase' }}>
          사용자 통계
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <SmallStatCard label="활성 사용자" value={stats.users.active} total={stats.users.total} color="#27ae60" />
          <SmallStatCard label="제보 경험" value={stats.users.withReports} total={stats.users.total} color="#3498db" />
          <SmallStatCard label="이번 주 가입" value={stats.users.weekRegistered} total={stats.users.total} color="#9b59b6" />
        </div>
      </div>

      {/* 실시간 세션 현황 */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#7f8c8d', fontWeight: '600', textTransform: 'uppercase' }}>
          실시간 세션 현황
        </h4>
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '15px', color: '#2c3e50', fontWeight: 600 }}>
              현재 {stats.sessions.activeSessions.toLocaleString()}개 세션 활동 중
            </div>
            <div style={{ fontSize: '12px', color: '#95a5a6', fontWeight: 500 }}>
              로그인 {stats.sessions.activeAuthenticated.toLocaleString()} · 게스트 {stats.sessions.activeGuests.toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', color: '#95a5a6' }}>
              {stats.sessions.lastUpdated
                ? `업데이트: ${formatRelativeTime(stats.sessions.lastUpdated)} · ${formatAbsoluteTime(stats.sessions.lastUpdated)}`
                : '업데이트 정보 없음'}
            </div>
          </div>

          <div style={{ display: 'grid', gap: '12px', maxHeight: '320px', overflowY: 'auto' }}>
            {stats.sessions.liveSessions.length > 0 ? (
              stats.sessions.liveSessions.map((session) => (
                <LiveSessionItem key={`${session.sessionId}-${session.userId || 'guest'}`} session={session} />
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: '#95a5a6', fontSize: '13px', border: '1px dashed #e0e0e0', borderRadius: '8px', backgroundColor: '#fafafa' }}>
                현재 표시할 접속 세션이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 지역별 제보 */}
      {stats.locations && stats.locations.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#7f8c8d', fontWeight: '600', textTransform: 'uppercase' }}>
            <MapPin size={14} style={{ display: 'inline', marginRight: '6px' }} />
            지역별 제보 Top 10
          </h4>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #e0e0e0' }}>
            <div style={{ display: 'grid', gap: '10px' }}>
              {stats.locations.slice(0, 10).map((location, index) => (
                <LocationBar
                  key={location.name}
                  rank={index + 1}
                  name={location.name}
                  count={location.count}
                  maxCount={stats.locations[0].count}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 최근 활동 */}
      {stats.recentActivity && stats.recentActivity.length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#7f8c8d', fontWeight: '600', textTransform: 'uppercase' }}>
            <Calendar size={14} style={{ display: 'inline', marginRight: '6px' }} />
            최근 활동
          </h4>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #e0e0e0' }}>
            <div style={{ display: 'grid', gap: '12px', maxHeight: '300px', overflowY: 'auto' }}>
              {stats.recentActivity.map((activity, index) => (
                <ActivityItem key={index} activity={activity} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface TimeRangeButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function TimeRangeButton({ active, onClick, label }: TimeRangeButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 16px',
        backgroundColor: active ? '#3498db' : 'transparent',
        color: active ? 'white' : '#7f8c8d',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: active ? '600' : 'normal',
        transition: 'all 0.2s'
      }}
    >
      {label}
    </button>
  );
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  trend?: string;
  helperText?: string;
  trendColor?: string;
  trendBackground?: string;
}

function MetricCard({ icon, label, value, color, trend, helperText, trendColor, trendBackground }: MetricCardProps) {
  const badgeColor = trendColor || '#27ae60';
  const badgeBackground = trendBackground || '#e8f5e9';

  return (
    <div style={{
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '8px',
      border: `2px solid ${color}`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
        <div style={{ color }}>
          {icon}
        </div>
        {trend && (
          <span style={{
            fontSize: '11px',
            padding: '3px 8px',
            backgroundColor: badgeBackground,
            color: badgeColor,
            borderRadius: '12px',
            fontWeight: 'bold'
          }}>
            {trend}
          </span>
        )}
      </div>
      <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#7f8c8d', fontWeight: '500' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: '32px', color, fontWeight: 'bold' }}>
        {value.toLocaleString()}
      </p>
      {helperText && (
        <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#7f8c8d', fontWeight: 500 }}>
          {helperText}
        </p>
      )}
    </div>
  );
}

interface SmallStatCardProps {
  label: string;
  value: number;
  total: number;
  color: string;
}

function SmallStatCard({ label, value, total, color }: SmallStatCardProps) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div style={{
      backgroundColor: 'white',
      padding: '16px',
      borderRadius: '8px',
      border: '1px solid #e0e0e0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    }}>
      <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#7f8c8d' }}>
        {label}
      </p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '24px', color, fontWeight: 'bold' }}>
          {value.toLocaleString()}
        </span>
        <span style={{ fontSize: '13px', color: '#95a5a6' }}>
          ({percentage}%)
        </span>
      </div>
      <div style={{ height: '4px', backgroundColor: '#f0f0f0', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${percentage}%`,
          backgroundColor: color,
          transition: 'width 0.3s'
        }} />
      </div>
    </div>
  );
}

interface LocationBarProps {
  rank: number;
  name: string;
  count: number;
  maxCount: number;
}

function LocationBar({ rank, name, count, maxCount }: LocationBarProps) {
  const percentage = (count / maxCount) * 100;
  const colors = ['#e74c3c', '#e67e22', '#f39c12', '#3498db', '#9b59b6'];
  const color = rank <= 3 ? colors[rank - 1] : colors[4];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'inline-block',
            width: '24px',
            height: '24px',
            backgroundColor: rank <= 3 ? color : '#95a5a6',
            color: 'white',
            borderRadius: '50%',
            textAlign: 'center',
            lineHeight: '24px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            {rank}
          </span>
          <span style={{ fontSize: '13px', color: '#2c3e50', fontWeight: '500' }}>
            {name}
          </span>
        </div>
        <span style={{ fontSize: '13px', color: '#7f8c8d', fontWeight: 'bold' }}>
          {count}건
        </span>
      </div>
      <div style={{ height: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${percentage}%`,
          backgroundColor: color,
          transition: 'width 0.3s'
        }} />
      </div>
    </div>
  );
}

interface ActivityItemProps {
  activity: {
    type: 'report' | 'user';
    description: string;
    timestamp: string;
  };
}

function ActivityItem({ activity }: ActivityItemProps) {
  const icon = activity.type === 'report' ? <FileText size={16} /> : <Users size={16} />;
  const color = activity.type === 'report' ? '#3498db' : '#9b59b6';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px',
      backgroundColor: '#fafafa',
      borderRadius: '6px',
      borderLeft: `3px solid ${color}`
    }}>
      <div style={{ color }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: '13px', color: '#2c3e50' }}>
          {activity.description}
        </p>
        <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#95a5a6' }}>
          {new Date(activity.timestamp).toLocaleString('ko-KR')}
        </p>
      </div>
    </div>
  );
}

const SummaryCard = ({ label, value, accent }: { label: string; value: number; accent: string }) => (
  <div
    style={{
      borderRadius: '10px',
      backgroundColor: 'white',
      border: `1px solid ${accent}33`,
      padding: '14px',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)'
    }}
  >
    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>{label}</div>
    <div style={{ fontSize: '22px', fontWeight: 'bold', color: accent }}>{value.toLocaleString()}명</div>
  </div>
);

const SummarySection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '16px' }}>
    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#1f2937', fontWeight: 700 }}>{title}</h4>
    {children}
  </div>
);

interface LiveSessionItemProps {
  session: LiveSession;
}

function LiveSessionItem({ session }: LiveSessionItemProps) {
  const identity = session.displayName || session.userEmail || (session.userId ? `사용자 ${session.userId}` : '게스트 세션');
  const roleLabel = session.userId ? '인증 사용자' : '게스트';
  const lastActiveRelative = formatRelativeTime(session.lastActive);
  const lastActiveAbsolute = formatAbsoluteTime(session.lastActive);
  const createdRelative = session.createdAt ? formatRelativeTime(session.createdAt) : null;

  const metaBadges: string[] = [];
  if (session.platform) {
    metaBadges.push(`플랫폼: ${session.platform}`);
  }
  if (session.userAgent) {
    metaBadges.push(`브라우저: ${truncateText(session.userAgent, 60)}`);
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '12px 14px',
      backgroundColor: '#fafafa',
      borderRadius: '10px',
      border: '1px solid #e5e7eb'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '14px', color: '#2c3e50', fontWeight: 600 }}>{identity}</span>
          <span style={{ fontSize: '12px', color: '#7f8c8d' }}>
            {roleLabel} · 세션 ID: {session.sessionId}
          </span>
          {session.userId && (
            <span style={{ fontSize: '12px', color: '#95a5a6' }}>UID: {session.userId}</span>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '12px', color: '#27ae60', fontWeight: 600 }}>{lastActiveRelative}</span>
          <div style={{ fontSize: '11px', color: '#95a5a6' }}>{lastActiveAbsolute}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '11px', color: '#95a5a6' }}>
        {createdRelative && <span>시작: {createdRelative}</span>}
        {metaBadges.map((badge) => (
          <span key={badge} style={{ backgroundColor: '#f1f5f9', padding: '3px 8px', borderRadius: '999px', color: '#5d6d7e' }}>
            {badge}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) {
    return '정보 없음';
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) {
    return '곧 업데이트';
  }

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 45) {
    return '방금 전';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}분 전`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}시간 전`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}일 전`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}주 전`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}개월 전`;
  }

  const years = Math.floor(days / 365);
  return `${years}년 전`;
}

function formatAbsoluteTime(timestamp: number | null): string {
  if (!timestamp) {
    return '알 수 없음';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '알 수 없음';
  }

  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function truncateText(value: string, maxLength = 80): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
