import React, { useState, useEffect } from 'react';
import { X, Clock, MapPin, User, Phone, Shield } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { toast } from 'react-toastify';
import { MissingPerson } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function AllReportsModal({ isOpen, onClose }: Props) {
  const [reports, setReports] = useState<MissingPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'user_report'>('all');

  useEffect(() => {
    if (isOpen) {
      loadAllReports();
    }
  }, [isOpen]);

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
      console.log('📡 전체 제보 조회:', apiUrl);

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

  const filteredReports = reports.filter(report => {
    if (filter === 'all') return true;
    if (filter === 'active') return report.status === 'active';
    if (filter === 'user_report') return report.source === 'user_report';
    return true;
  });

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '30px',
          maxWidth: '1000px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={28} color="#e74c3c" />
            <h2 style={{ margin: 0, fontSize: '24px', color: '#2c3e50' }}>
              전체 제보 관리 (관리자)
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: '#95a5a6'
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* 필터 버튼 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '8px 16px',
              backgroundColor: filter === 'all' ? '#3498db' : '#ecf0f1',
              color: filter === 'all' ? 'white' : '#7f8c8d',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: filter === 'all' ? 'bold' : 'normal'
            }}
          >
            전체 ({reports.length})
          </button>
          <button
            onClick={() => setFilter('user_report')}
            style={{
              padding: '8px 16px',
              backgroundColor: filter === 'user_report' ? '#3498db' : '#ecf0f1',
              color: filter === 'user_report' ? 'white' : '#7f8c8d',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: filter === 'user_report' ? 'bold' : 'normal'
            }}
          >
            사용자 제보
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#95a5a6' }}>
            로딩 중...
          </div>
        ) : filteredReports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#95a5a6' }}>
            <p>제보된 실종자가 없습니다</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '15px' }}>
            {filteredReports.map((person) => (
              <div
                key={person.id}
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  padding: '15px',
                  backgroundColor: '#f9f9f9'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', color: '#2c3e50' }}>{person.name}</h3>
                      <span style={{ fontSize: '14px', color: '#7f8c8d' }}>
                        {person.age}세 · {person.gender === 'M' ? '남성' : '여성'}
                      </span>
                      {person.source === 'user_report' && (
                        <span style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          backgroundColor: '#3498db',
                          color: 'white',
                          borderRadius: '12px',
                          fontWeight: 'bold'
                        }}>
                          사용자 제보
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px', color: '#555' }}>
                      <MapPin size={16} />
                      <span style={{ fontSize: '14px' }}>{person.location.address}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px', color: '#555' }}>
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
                      <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#666', lineHeight: '1.5' }}>
                        {person.description}
                      </p>
                    )}

                    {person.reportedBy && (
                      <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '5px', border: '1px solid #ffc107' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                          <User size={14} />
                          <span style={{ fontSize: '12px', color: '#856404', fontWeight: 'bold' }}>
                            제보자: {person.reportedBy.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                          <Phone size={14} />
                          <span style={{ fontSize: '12px', color: '#856404' }}>
                            연락처: {person.reportedBy.phone}
                          </span>
                        </div>
                        {person.reportedBy.relation && (
                          <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: '#856404' }}>
                            관계: {person.reportedBy.relation}
                          </p>
                        )}
                        <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: '#856404' }}>
                          제보일: {new Date(person.reportedBy.reportedAt).toLocaleString('ko-KR')}
                        </p>
                        <p style={{ margin: '3px 0 0 0', fontSize: '10px', color: '#6c757d', fontFamily: 'monospace' }}>
                          UID: {person.reportedBy.uid}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
