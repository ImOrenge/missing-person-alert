import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Eye, EyeOff, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  toggleAnnouncementActive
} from '../../services/announcementService';
import type { Announcement, AnnouncementDisplayType } from '../../types/announcement';

export default function AnnouncementsTab() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    setLoading(true);
    const data = await getAllAnnouncements();
    setAnnouncements(data);
    setLoading(false);
  };

  const handleCreate = () => {
    setEditingAnnouncement(null);
    setShowCreateModal(true);
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setShowCreateModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 공지사항을 삭제하시겠습니까?')) {
      return;
    }

    const result = await deleteAnnouncement(id);
    if (result.success) {
      toast.success('공지사항이 삭제되었습니다');
      loadAnnouncements();
    } else {
      toast.error(result.error || '삭제에 실패했습니다');
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const result = await toggleAnnouncementActive(id, !currentActive);
    if (result.success) {
      toast.success(currentActive ? '공지사항이 비활성화되었습니다' : '공지사항이 활성화되었습니다');
      loadAnnouncements();
    } else {
      toast.error(result.error || '상태 변경에 실패했습니다');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p style={{ color: '#7f8c8d' }}>공지사항을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: '#2c3e50' }}>공지사항 관리</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#7f8c8d' }}>
            총 {announcements.length}개의 공지사항
          </p>
        </div>
        <button
          onClick={handleCreate}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          <Plus size={18} />
          새 공지사항
        </button>
      </div>

      {/* 공지사항 목록 */}
      {announcements.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '2px dashed #e0e0e0'
        }}>
          <Info size={48} color="#bdc3c7" style={{ marginBottom: '16px' }} />
          <p style={{ color: '#7f8c8d', fontSize: '16px', margin: 0 }}>
            등록된 공지사항이 없습니다
          </p>
          <p style={{ color: '#bdc3c7', fontSize: '14px', marginTop: '8px' }}>
            새 공지사항 버튼을 클릭하여 공지를 추가하세요
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}

      {/* 생성/수정 모달 */}
      {showCreateModal && (
        <AnnouncementModal
          announcement={editingAnnouncement}
          onClose={() => {
            setShowCreateModal(false);
            setEditingAnnouncement(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setEditingAnnouncement(null);
            loadAnnouncements();
          }}
        />
      )}
    </div>
  );
}

interface AnnouncementCardProps {
  announcement: Announcement;
  onEdit: (announcement: Announcement) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, currentActive: boolean) => void;
}

function AnnouncementCard({ announcement, onEdit, onDelete, onToggleActive }: AnnouncementCardProps) {
  const isWarning = announcement.type === 'warning';

  return (
    <div style={{
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '12px',
      border: '1px solid #e0e0e0',
      display: 'flex',
      alignItems: 'center',
      gap: '16px'
    }}>
      {/* 타입 아이콘 */}
      <div style={{
        padding: '12px',
        borderRadius: '8px',
        backgroundColor: isWarning ? '#fff3cd' : '#d1ecf1'
      }}>
        {isWarning ? (
          <AlertTriangle size={24} color="#856404" />
        ) : (
          <Info size={24} color="#0c5460" />
        )}
      </div>

      {/* 내용 */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: isWarning ? '#ffc107' : '#17a2b8',
            color: 'white',
            fontWeight: 'bold'
          }}>
            {isWarning ? '경고' : '정보'}
          </span>
          <span style={{
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: announcement.active ? '#28a745' : '#6c757d',
            color: 'white',
            fontWeight: 'bold'
          }}>
            {announcement.active ? '활성' : '비활성'}
          </span>
          <span style={{
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: announcement.displayType === 'popup' ? '#9b59b6' : announcement.displayType === 'both' ? '#e67e22' : '#3498db',
            color: 'white',
            fontWeight: 'bold'
          }}>
            {announcement.displayType === 'banner' ? '배너' : announcement.displayType === 'popup' ? '팝업' : '배너+팝업'}
          </span>
          <span style={{ fontSize: '12px', color: '#7f8c8d' }}>
            우선순위: {announcement.priority}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '15px', color: '#2c3e50' }}>
          {announcement.text}
        </p>
        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#95a5a6' }}>
          작성일: {announcement.createdAt.toDate().toLocaleString('ko-KR')}
        </p>
      </div>

      {/* 액션 버튼 */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onToggleActive(announcement.id, announcement.active)}
          style={{
            padding: '8px 12px',
            backgroundColor: announcement.active ? '#ffc107' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title={announcement.active ? '비활성화' : '활성화'}
        >
          {announcement.active ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button
          onClick={() => onEdit(announcement)}
          style={{
            padding: '8px 12px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="수정"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={() => onDelete(announcement.id)}
          style={{
            padding: '8px 12px',
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="삭제"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

interface AnnouncementModalProps {
  announcement: Announcement | null;
  onClose: () => void;
  onSuccess: () => void;
}

function AnnouncementModal({ announcement, onClose, onSuccess }: AnnouncementModalProps) {
  const [text, setText] = useState(announcement?.text || '');
  const [type, setType] = useState<'info' | 'warning'>(announcement?.type || 'info');
  const [displayType, setDisplayType] = useState<AnnouncementDisplayType>(announcement?.displayType || 'banner');
  const [active, setActive] = useState(announcement?.active ?? true);
  const [priority, setPriority] = useState(announcement?.priority || 999);
  const [popupTitle, setPopupTitle] = useState(announcement?.popupTitle || '');
  const [popupButtonText, setPopupButtonText] = useState(announcement?.popupButtonText || '확인');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!text.trim()) {
      toast.error('공지사항 내용을 입력하세요');
      return;
    }

    setSubmitting(true);

    try {
      if (announcement) {
        // 수정
        const result = await updateAnnouncement(announcement.id, {
          text,
          type,
          displayType,
          active,
          priority,
          popupTitle: popupTitle || undefined,
          popupButtonText: popupButtonText || undefined
        });

        if (result.success) {
          toast.success('공지사항이 수정되었습니다');
          onSuccess();
        } else {
          toast.error(result.error || '수정에 실패했습니다');
        }
      } else {
        // 생성
        const result = await createAnnouncement({
          text,
          type,
          displayType,
          active,
          priority,
          popupTitle: popupTitle || undefined,
          popupButtonText: popupButtonText || undefined
        });

        if (result.success) {
          toast.success('공지사항이 생성되었습니다');
          onSuccess();
        } else {
          toast.error(result.error || '생성에 실패했습니다');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', color: '#2c3e50' }}>
          {announcement ? '공지사항 수정' : '새 공지사항 작성'}
        </h3>

        <form onSubmit={handleSubmit}>
          {/* 공지 내용 */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold', color: '#2c3e50' }}>
              공지 내용 *
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="공지사항 내용을 입력하세요"
              rows={4}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
              required
            />
          </div>

          {/* 타입 선택 */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold', color: '#2c3e50' }}>
              타입 *
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="type"
                  value="info"
                  checked={type === 'info'}
                  onChange={(e) => setType('info')}
                />
                <Info size={16} color="#17a2b8" />
                <span>정보</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="type"
                  value="warning"
                  checked={type === 'warning'}
                  onChange={(e) => setType('warning')}
                />
                <AlertTriangle size={16} color="#ffc107" />
                <span>경고</span>
              </label>
            </div>
          </div>

          {/* 표시 방식 선택 */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold', color: '#2c3e50' }}>
              표시 방식 *
            </label>
            <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="displayType"
                  value="banner"
                  checked={displayType === 'banner'}
                  onChange={(e) => setDisplayType('banner')}
                />
                <span>배너만 (하단 슬라이드 배너)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="displayType"
                  value="popup"
                  checked={displayType === 'popup'}
                  onChange={(e) => setDisplayType('popup')}
                />
                <span>팝업만 (중앙 팝업 창)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="displayType"
                  value="both"
                  checked={displayType === 'both'}
                  onChange={(e) => setDisplayType('both')}
                />
                <span>배너 + 팝업 (둘 다 표시)</span>
              </label>
            </div>
          </div>

          {/* 팝업 전용 옵션 */}
          {(displayType === 'popup' || displayType === 'both') && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold', color: '#2c3e50' }}>
                  팝업 제목 (선택사항)
                </label>
                <input
                  type="text"
                  value={popupTitle}
                  onChange={(e) => setPopupTitle(e.target.value)}
                  placeholder="미입력 시 기본 제목 사용"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold', color: '#2c3e50' }}>
                  팝업 버튼 텍스트
                </label>
                <input
                  type="text"
                  value={popupButtonText}
                  onChange={(e) => setPopupButtonText(e.target.value)}
                  placeholder="확인"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>
            </>
          )}

          {/* 우선순위 */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold', color: '#2c3e50' }}>
              우선순위 (낮을수록 먼저 표시)
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              min={1}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            />
          </div>

          {/* 활성화 여부 */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <span style={{ fontSize: '14px', color: '#2c3e50' }}>활성화 (체크 시 바로 사용자에게 표시)</span>
            </label>
          </div>

          {/* 버튼 */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '10px 20px',
                backgroundColor: '#95a5a6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                opacity: submitting ? 0.6 : 1
              }}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                opacity: submitting ? 0.6 : 1
              }}
            >
              {submitting ? '처리 중...' : (announcement ? '수정' : '생성')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
