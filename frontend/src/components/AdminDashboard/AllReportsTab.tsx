import React, { useState, useEffect } from 'react';
import { Clock, MapPin, User, Phone, RefreshCw, Trash2 } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { toast } from 'react-toastify';
import { MissingPerson } from '../../types';

export default function AllReportsTab() {
  const [reports, setReports] = useState<MissingPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'user_report'>('all');

  useEffect(() => {
    loadAllReports();
  }, []);

  const loadAllReports = async () => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      toast.error('로그인이 필요합니다');
      return;
    }

    try {
      setLoading(true);
      const token = await user.getIdToken();
      const apiUrl = `${process.env.REACT_APP_API_URL || ''}/api/reports/all?uid=${user.uid}`;

      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '전체 제보 조회에 실패했습니다');
      }

      setReports(data.reports || []);
    } catch (error: any) {
      console.error('전체 제보 조회 실패:', error);
      toast.error(error.message || '전체 제보 조회 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm('이 제보를 삭제하시겠습니까?')) {
      return;
    }

    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      toast.error('로그인이 필요합니다');
      return;
    }

    try {
      const token = await user.getIdToken();
      const apiUrl = `${process.env.REACT_APP_API_URL || ''}/api/reports/${reportId}`;

      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '제보 삭제에 실패했습니다');
      }

      toast.success('제보가 삭제되었습니다');
      loadAllReports(); // 목록 새로고침
    } catch (error: any) {
      console.error('제보 삭제 실패:', error);
      toast.error(error.message || '제보 삭제 중 오류가 발생했습니다');
    }
  };

  const filteredReports = reports.filter(report => {
    if (filter === 'all') return true;
    if (filter === 'active') return report.status === 'active';
    if (filter === 'user_report') return report.source === 'user_report';
    return true;
  });

  const stats = {
    total: reports.length,
    userReports: reports.filter(r => r.source === 'user_report').length,
    active: reports.filter(r => r.status === 'active').length
  };

  return (
    <div>
      {/* 통계 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
        <StatCard label="전체 제보" value={stats.total} color="#3498db" />
        <StatCard label="사용자 제보" value={stats.userReports} color="#9b59b6" />
        <StatCard label="활성 제보" value={stats.active} color="#27ae60" />
      </div>

      {/* 필터 및 새로고침 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <FilterButton
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            label={`전체 (${reports.length})`}
          />
          <FilterButton
            active={filter === 'user_report'}
            onClick={() => setFilter('user_report')}
            label="사용자 제보"
          />
          <FilterButton
            active={filter === 'active'}
            onClick={() => setFilter('active')}
            label="활성"
          />
        </div>

        <button
          onClick={loadAllReports}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            opacity: loading ? 0.6 : 1
          }}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>새로고침</span>
        </button>
      </div>

      {/* 제보 목록 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#95a5a6' }}>
          <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 10px' }} />
          <p>로딩 중...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#95a5a6' }}>
          <p style={{ fontSize: '16px' }}>제보된 실종자가 없습니다</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '15px' }}>
          {filteredReports.map((person) => (
            <ReportCard
              key={person.id}
              person={person}
              onDelete={handleDeleteReport}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  color: string;
}

function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div style={{
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '8px',
      border: `2px solid ${color}`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#7f8c8d', fontWeight: '500' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: '32px', color, fontWeight: 'bold' }}>
        {value}
      </p>
    </div>
  );
}

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function FilterButton({ active, onClick, label }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        backgroundColor: active ? '#3498db' : 'white',
        color: active ? 'white' : '#7f8c8d',
        border: active ? 'none' : '1px solid #ddd',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: active ? 'bold' : 'normal',
        transition: 'all 0.2s'
      }}
    >
      {label}
    </button>
  );
}

interface ReportCardProps {
  person: MissingPerson;
  onDelete: (id: string) => void;
}

function ReportCard({ person, onDelete }: ReportCardProps) {
  return (
    <div style={{
      backgroundColor: 'white',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
      transition: 'all 0.2s'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#2c3e50', fontWeight: 'bold' }}>
              {person.name}
            </h3>
            <span style={{ fontSize: '14px', color: '#7f8c8d' }}>
              {person.age}세 · {person.gender === 'M' ? '남성' : '여성'}
            </span>
            {person.source === 'user_report' && (
              <span style={{
                fontSize: '11px',
                padding: '4px 10px',
                backgroundColor: '#3498db',
                color: 'white',
                borderRadius: '12px',
                fontWeight: 'bold'
              }}>
                사용자 제보
              </span>
            )}
            {person.status === 'active' && (
              <span style={{
                fontSize: '11px',
                padding: '4px 10px',
                backgroundColor: '#27ae60',
                color: 'white',
                borderRadius: '12px',
                fontWeight: 'bold'
              }}>
                활성
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#555' }}>
            <MapPin size={16} />
            <span style={{ fontSize: '14px' }}>{person.location.address}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#555' }}>
            <Clock size={16} />
            <span style={{ fontSize: '14px' }}>
              {new Date(person.missingDate).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </span>
          </div>

          {person.description && (
            <p style={{ margin: '10px 0 0 0', fontSize: '13px', color: '#666', lineHeight: '1.6' }}>
              {person.description}
            </p>
          )}

          {person.reportedBy && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              backgroundColor: '#fff9e6',
              borderRadius: '6px',
              border: '1px solid #ffd700'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <User size={14} />
                <span style={{ fontSize: '12px', color: '#856404', fontWeight: 'bold' }}>
                  제보자: {person.reportedBy.name}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Phone size={14} />
                <span style={{ fontSize: '12px', color: '#856404' }}>
                  연락처: {person.reportedBy.phone}
                </span>
              </div>
              {person.reportedBy.relation && (
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#856404' }}>
                  관계: {person.reportedBy.relation}
                </p>
              )}
              <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#856404' }}>
                제보일: {new Date(person.reportedBy.reportedAt).toLocaleString('ko-KR')}
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#6c757d', fontFamily: 'monospace' }}>
                UID: {person.reportedBy.uid}
              </p>
            </div>
          )}
        </div>

        {/* 삭제 버튼 */}
        {person.source === 'user_report' && (
          <button
            onClick={() => onDelete(person.id)}
            style={{
              padding: '8px',
              backgroundColor: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              marginLeft: '10px'
            }}
            title="제보 삭제"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
