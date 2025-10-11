import React, { useState, useEffect } from 'react';
import { Users, Mail, Phone, Calendar, Shield, Search, RefreshCw, Ban, CheckCircle } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { toast } from 'react-toastify';

interface UserInfo {
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignInTime: string | null;
  isAdmin: boolean;
  reportCount: number;
  disabled: boolean;
}

export default function UserManagementTab() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      toast.error('로그인이 필요합니다');
      return;
    }

    try {
      setLoading(true);
      const token = await user.getIdToken();
      const apiUrl = `${process.env.REACT_APP_API_URL || ''}/api/admin/users`;

      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '유저 목록 조회에 실패했습니다');
      }

      setUsers(data.users || []);
    } catch (error: any) {
      console.error('유저 목록 조회 실패:', error);
      toast.error(error.message || '유저 목록 조회 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserStatus = async (uid: string, currentStatus: boolean) => {
    const action = currentStatus ? '활성화' : '비활성화';
    if (!window.confirm(`이 사용자를 ${action}하시겠습니까?`)) {
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
      const apiUrl = `${process.env.REACT_APP_API_URL || ''}/api/admin/users/${uid}/toggle-status`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ disable: !currentStatus })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `사용자 ${action}에 실패했습니다`);
      }

      toast.success(`사용자가 ${action}되었습니다`);
      loadUsers(); // 목록 새로고침
    } catch (error: any) {
      console.error('사용자 상태 변경 실패:', error);
      toast.error(error.message || '사용자 상태 변경 중 오류가 발생했습니다');
    }
  };

  const filteredUsers = users.filter(user => {
    const query = searchQuery.toLowerCase();
    return (
      user.email?.toLowerCase().includes(query) ||
      user.phoneNumber?.includes(query) ||
      user.displayName?.toLowerCase().includes(query) ||
      user.uid.toLowerCase().includes(query)
    );
  });

  const stats = {
    total: users.length,
    active: users.filter(u => !u.disabled).length,
    disabled: users.filter(u => u.disabled).length,
    withReports: users.filter(u => u.reportCount > 0).length
  };

  return (
    <div>
      {/* 통계 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '20px' }}>
        <StatCard label="전체 사용자" value={stats.total} color="#3498db" />
        <StatCard label="활성 사용자" value={stats.active} color="#27ae60" />
        <StatCard label="비활성" value={stats.disabled} color="#e74c3c" />
        <StatCard label="제보자" value={stats.withReports} color="#9b59b6" />
      </div>

      {/* 검색 및 새로고침 */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#7f8c8d'
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="이메일, 전화번호, 이름, UID로 검색..."
            style={{
              width: '100%',
              padding: '10px 12px 10px 40px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
        </div>
        <button
          onClick={loadUsers}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
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

      {/* 유저 목록 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#95a5a6' }}>
          <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 10px' }} />
          <p>로딩 중...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#95a5a6' }}>
          <Users size={48} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
          <p style={{ fontSize: '16px' }}>
            {searchQuery ? '검색 결과가 없습니다' : '등록된 사용자가 없습니다'}
          </p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e0e0e0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', color: '#7f8c8d', fontWeight: 'bold' }}>사용자</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', color: '#7f8c8d', fontWeight: 'bold' }}>연락처</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', color: '#7f8c8d', fontWeight: 'bold' }}>가입일</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#7f8c8d', fontWeight: 'bold' }}>제보수</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#7f8c8d', fontWeight: 'bold' }}>상태</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#7f8c8d', fontWeight: 'bold' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, index) => (
                <tr
                  key={user.uid}
                  style={{
                    borderBottom: index < filteredUsers.length - 1 ? '1px solid #f0f0f0' : 'none',
                    backgroundColor: user.disabled ? '#fff5f5' : 'white'
                  }}
                >
                  <td style={{ padding: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        {user.isAdmin && <Shield size={14} color="#fbbf24" />}
                        <span style={{ fontSize: '14px', fontWeight: '500', color: '#2c3e50' }}>
                          {user.displayName || '이름 없음'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Mail size={12} color="#7f8c8d" />
                        <span style={{ fontSize: '12px', color: '#7f8c8d' }}>
                          {user.email || 'N/A'}
                        </span>
                      </div>
                      <div style={{ fontSize: '10px', color: '#95a5a6', fontFamily: 'monospace', marginTop: '4px' }}>
                        {user.uid}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    {user.phoneNumber ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={14} color="#7f8c8d" />
                        <span style={{ fontSize: '13px', color: '#555' }}>{user.phoneNumber}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '13px', color: '#bbb' }}>N/A</span>
                    )}
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={14} color="#7f8c8d" />
                      <span style={{ fontSize: '13px', color: '#555' }}>
                        {new Date(user.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                    {user.lastSignInTime && (
                      <div style={{ fontSize: '11px', color: '#95a5a6', marginTop: '4px' }}>
                        최근: {new Date(user.lastSignInTime).toLocaleDateString('ko-KR')}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      backgroundColor: user.reportCount > 0 ? '#e8f5e9' : '#f5f5f5',
                      color: user.reportCount > 0 ? '#27ae60' : '#95a5a6',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 'bold'
                    }}>
                      {user.reportCount}
                    </span>
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    {user.disabled ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        backgroundColor: '#ffebee',
                        color: '#e74c3c',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        <Ban size={12} />
                        비활성
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        backgroundColor: '#e8f5e9',
                        color: '#27ae60',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        <CheckCircle size={12} />
                        활성
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <button
                      onClick={() => handleToggleUserStatus(user.uid, user.disabled)}
                      style={{
                        padding: '6px 14px',
                        backgroundColor: user.disabled ? '#27ae60' : '#e74c3c',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}
                    >
                      {user.disabled ? '활성화' : '비활성화'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
      padding: '18px',
      borderRadius: '8px',
      border: `2px solid ${color}`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      <p style={{ margin: '0 0 6px 0', fontSize: '12px', color: '#7f8c8d', fontWeight: '500' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: '28px', color, fontWeight: 'bold' }}>
        {value}
      </p>
    </div>
  );
}
