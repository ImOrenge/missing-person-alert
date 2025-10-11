import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, FileText, MapPin, Calendar, RefreshCw, Clock } from 'lucide-react';
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
  timeline: {
    date: string;
    reports: number;
    users: number;
  }[];
  recentActivity: {
    type: 'report' | 'user';
    description: string;
    timestamp: string;
  }[];
}

export default function StatisticsTab() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('week');

  useEffect(() => {
    loadStatistics();
  }, [timeRange]);

  const loadStatistics = async () => {
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

      setStats(data.statistics);
    } catch (error: any) {
      console.error('통계 조회 실패:', error);
      toast.error(error.message || '통계 조회 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div>
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
}

function MetricCard({ icon, label, value, color, trend }: MetricCardProps) {
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
            backgroundColor: '#e8f5e9',
            color: '#27ae60',
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
