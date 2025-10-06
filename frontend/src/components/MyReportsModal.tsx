import React, { useState, useEffect } from 'react';
import { X, Clock, MapPin, Trash2 } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { toast } from 'react-toastify';
import { MissingPerson } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function MyReportsModal({ isOpen, onClose }: Props) {
  const [reports, setReports] = useState<MissingPerson[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadMyReports();
    }
  }, [isOpen]);

  const loadMyReports = async () => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      toast.error('로그인이 필요합니다');
      return;
    }

    try {
      setLoading(true);
      const token = await user.getIdToken();
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/reports/my?uid=${user.uid}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '제보 기록 조회에 실패했습니다');
      }

      setReports(data.reports || []);
    } catch (error: any) {
      console.error('제보 기록 조회 실패:', error);
      toast.error(error.message || '제보 기록 조회 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('정말 이 제보를 삭제하시겠습니까?')) {
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
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/reports/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ uid: user.uid })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '제보 삭제에 실패했습니다');
      }

      toast.success('제보가 삭제되었습니다');
      setReports(reports.filter(r => r.id !== id));
    } catch (error: any) {
      console.error('제보 삭제 실패:', error);
      toast.error(error.message || '제보 삭제 중 오류가 발생했습니다');
    }
  };

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
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', color: '#2c3e50' }}>내 제보 기록</h2>
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

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#95a5a6' }}>
            로딩 중...
          </div>
        ) : reports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#95a5a6' }}>
            <p>제보한 실종자가 없습니다</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '15px' }}>
            {reports.map((person) => (
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
                      <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#e8f4f8', borderRadius: '5px' }}>
                        <p style={{ margin: 0, fontSize: '12px', color: '#2980b9' }}>
                          제보자: {person.reportedBy.name} ({person.reportedBy.phone})
                          {person.reportedBy.relation && ` · ${person.reportedBy.relation}`}
                        </p>
                        <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: '#7f8c8d' }}>
                          제보일: {new Date(person.reportedBy.reportedAt).toLocaleString('ko-KR')}
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleDelete(person.id)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#e74c3c',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '13px'
                    }}
                    title="제보 삭제"
                  >
                    <Trash2 size={14} />
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
