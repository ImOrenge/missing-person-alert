import React, { useEffect, useMemo, useState } from 'react';
import { User, MessageSquare, Heart, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import { onAuthChange } from '../../services/firebase';
import type { CommentType } from '../../types/comment';
import {
  CommentModel,
  createComment,
  deleteComment,
  ensureCommentAuth,
  fetchComments,
  reportComment,
  toggleLikeComment,
  updateComment
} from '../../services/commentService';
import type { User as FirebaseUser } from 'firebase/auth';

type FilterType = 'all' | CommentType;
type OrderType = 'latest' | 'popular';

interface CommentsPanelProps {
  missingPersonId: string;
}

const commentTypeLabels: Record<CommentType, string> = {
  sighting: '목격',
  question: '문의',
  support: '응원'
};

const commentTypeColors: Record<CommentType, string> = {
  sighting: '#e74c3c',
  question: '#9b59b6',
  support: '#3498db'
};

const formatRelativeTime = (date: Date) => {
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 60_000) {
    return '방금 전';
  }
  if (diff < 3_600_000) {
    const minutes = Math.floor(diff / 60_000);
    return `${minutes}분 전`;
  }
  if (diff < 86_400_000) {
    const hours = Math.floor(diff / 3_600_000);
    return `${hours}시간 전`;
  }
  if (diff < 7 * 86_400_000) {
    const days = Math.floor(diff / 86_400_000);
    return `${days}일 전`;
  }

  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const CommentsPanel: React.FC<CommentsPanelProps> = ({ missingPersonId }) => {
  const [comments, setComments] = useState<CommentModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [content, setContent] = useState('');
  const [newCommentType, setNewCommentType] = useState<CommentType>('support');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [order, setOrder] = useState<OrderType>('latest');
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthChange(setCurrentUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchComments(missingPersonId, {
          type: filterType === 'all' ? undefined : filterType,
          order
        });
        setComments(data);
      } catch (error: any) {
        console.error(error);
        toast.error(error.message || '댓글을 불러오지 못했습니다');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [missingPersonId, filterType, order]);

  const handleCreateComment = async () => {
    if (!content.trim()) {
      toast.error('댓글 내용을 입력해주세요');
      return;
    }

    if (content.trim().length < 10) {
      toast.error('댓글은 최소 10자 이상 입력해야 합니다');
      return;
    }

    try {
      ensureCommentAuth();
      setPosting(true);
      const created = await createComment(missingPersonId, {
        content: content.trim(),
        type: newCommentType,
        isAnonymous
      });

      setComments(prev => [created, ...prev]);
      setContent('');
      setNewCommentType('support');
      setIsAnonymous(false);
      toast.success('댓글이 등록되었습니다');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || '댓글 등록에 실패했습니다');
    } finally {
      setPosting(false);
    }
  };

  const handleToggleLike = async (comment: CommentModel) => {
    try {
      ensureCommentAuth();
      const result = await toggleLikeComment(comment.commentId);
      setComments(prev =>
        prev.map(item =>
          item.commentId === comment.commentId
            ? { ...item, likes: result.likes, likedBy: updateLikedBy(item.likedBy, currentUser?.uid, result.liked) }
            : item
        )
      );
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || '공감 처리에 실패했습니다');
    }
  };

  const updateLikedBy = (list: string[], uid: string | undefined | null, liked: boolean): string[] => {
    if (!uid) return list;
    const set = new Set(list);
    if (liked) {
      set.add(uid);
    } else {
      set.delete(uid);
    }
    return Array.from(set);
  };

  const handleDelete = async (comment: CommentModel) => {
    if (!window.confirm('이 댓글을 삭제하시겠습니까?')) {
      return;
    }

    try {
      ensureCommentAuth();
      await deleteComment(comment.commentId);
      setComments(prev => prev.filter(item => item.commentId !== comment.commentId));
      toast.success('댓글이 삭제되었습니다');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || '댓글 삭제에 실패했습니다');
    }
  };

  const handleEdit = async (comment: CommentModel) => {
    const next = window.prompt('댓글을 수정해주세요 (최소 10자)', comment.content);
    if (!next) {
      return;
    }
    if (next.trim().length < 10) {
      toast.error('댓글은 최소 10자 이상 입력해야 합니다');
      return;
    }

    try {
      ensureCommentAuth();
      const updated = await updateComment(comment.commentId, next.trim());
      setComments(prev => prev.map(item => (item.commentId === comment.commentId ? updated : item)));
      toast.success('댓글이 수정되었습니다');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || '댓글 수정에 실패했습니다');
    }
  };

  const handleReport = async (comment: CommentModel) => {
    const reason = window.prompt('신고 사유를 입력해주세요 (스팸, 부적절, 허위 중 선택)', 'spam');
    if (!reason) {
      return;
    }

    const normalized = reason.toLowerCase();
    const allowed = ['spam', 'inappropriate', 'false', 'other'];
    if (!allowed.includes(normalized)) {
      toast.error('지원하지 않는 신고 사유입니다');
      return;
    }

    try {
      ensureCommentAuth();
      await reportComment(comment.commentId, normalized as any);
      toast.success('신고가 접수되었습니다');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || '신고에 실패했습니다');
    }
  };

  const filteredComments = useMemo(() => {
    return comments.filter(comment => {
      if (filterType !== 'all' && comment.type !== filterType) {
        return false;
      }
      return true;
    });
  }, [comments, filterType]);

  const isLikedByCurrentUser = (comment: CommentModel) => {
    if (!currentUser) return false;
    return comment.likedBy.includes(currentUser.uid);
  };

  return (
    <div style={{ borderTop: '1px solid #ecf0f1', marginTop: '16px', paddingTop: '16px' }}>
      <h3 style={{ fontSize: '16px', marginBottom: '12px', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <MessageSquare size={18} />
        실종자 근황 공유
        <span style={{ fontSize: '12px', color: '#95a5a6' }}>({filteredComments.length})</span>
      </h3>

      {/* 작성 영역 */}
      <div style={{ backgroundColor: '#f8f9fa', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid #e0e0e0' }}>
        <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#7f8c8d' }}>
          목격 정보, 문의, 응원 메시지를 작성해주세요. (최소 10자)
        </p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          {(['support', 'sighting', 'question'] as CommentType[]).map(type => (
            <button
              key={type}
              onClick={() => setNewCommentType(type)}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                border: newCommentType === type ? 'none' : '1px solid #dcdde1',
                backgroundColor: newCommentType === type ? commentTypeColors[type] : 'white',
                color: newCommentType === type ? 'white' : '#7f8c8d',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {commentTypeLabels[type]}
            </button>
          ))}
        </div>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="목격 정보, 문의 또는 응원 메시지를 작성해주세요..."
          rows={4}
          style={{
            width: '100%',
            resize: 'vertical',
            borderRadius: '8px',
            border: '1px solid #dcdde1',
            padding: '12px',
            fontSize: '14px',
            color: '#2c3e50',
            outline: 'none'
          }}
        />
        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#7f8c8d' }}>
            <input type="checkbox" checked={isAnonymous} onChange={(event) => setIsAnonymous(event.target.checked)} />
            익명으로 남기기
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: '#95a5a6' }}>{content.trim().length} / 500</span>
            <button
              onClick={handleCreateComment}
              disabled={posting}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: posting ? '#95a5a6' : '#e74c3c',
                color: 'white',
                cursor: posting ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {posting ? '등록 중...' : '댓글 등록'}
            </button>
          </div>
        </div>
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(['all', 'sighting', 'question', 'support'] as FilterType[]).map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: filterType === type ? 'none' : '1px solid #dcdde1',
                backgroundColor: filterType === type ? '#3498db' : 'white',
                color: filterType === type ? 'white' : '#7f8c8d',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {type === 'all' ? '전체' : commentTypeLabels[type]}
            </button>
          ))}
        </div>
        <div>
          <select
            value={order}
            onChange={(event) => setOrder(event.target.value as OrderType)}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdde1', fontSize: '13px', color: '#2c3e50' }}
          >
            <option value="latest">최신순</option>
            <option value="popular">공감순</option>
          </select>
        </div>
      </div>

      {/* 목록 */}
      {loading ? (
        <div style={{ padding: '30px', textAlign: 'center', color: '#95a5a6' }}>댓글을 불러오는 중...</div>
      ) : filteredComments.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', color: '#95a5a6' }}>
          첫 댓글을 남겨 실종자 수색에 힘을 보태주세요!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
          {filteredComments.map(comment => {
            const isOwner = currentUser?.uid === comment.userId;
            const liked = isLikedByCurrentUser(comment);

            return (
              <div key={comment.commentId} style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #ecf0f1', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        backgroundColor: commentTypeColors[comment.type],
                        color: 'white',
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}
                    >
                      {commentTypeLabels[comment.type]}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#2c3e50' }}>
                      <User size={14} color="#7f8c8d" />
                      <span>{comment.nickname}</span>
                      <span style={{ color: '#b2bec3' }}>•</span>
                      <span style={{ color: '#95a5a6' }}>{formatRelativeTime(comment.createdAt)}</span>
                      {comment.isEdited && <span style={{ color: '#95a5a6', fontSize: '12px' }}>(수정됨)</span>}
                    </div>
                  </div>
                  {comment.reportCount >= 3 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#e67e22' }}>
                      <AlertTriangle size={14} />
                      신고 {comment.reportCount}회
                    </span>
                  )}
                </div>

                <p style={{ margin: '0 0 12px 0', lineHeight: 1.6, color: '#2c3e50', whiteSpace: 'pre-wrap' }}>{comment.content}</p>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '13px', color: '#7f8c8d' }}>
                  <button
                    onClick={() => handleToggleLike(comment)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      border: 'none',
                      background: 'none',
                      color: liked ? '#e74c3c' : '#7f8c8d',
                      fontWeight: liked ? 'bold' : 'normal',
                      cursor: 'pointer'
                    }}
                  >
                    <Heart size={14} fill={liked ? '#e74c3c' : 'none'} color={liked ? '#e74c3c' : '#7f8c8d'} />
                    {comment.likes}
                  </button>

                  {isOwner ? (
                    <>
                      <button
                        onClick={() => handleEdit(comment)}
                        style={{ border: 'none', background: 'none', color: '#2980b9', cursor: 'pointer' }}
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(comment)}
                        style={{ border: 'none', background: 'none', color: '#c0392b', cursor: 'pointer' }}
                      >
                        삭제
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleReport(comment)}
                      style={{ border: 'none', background: 'none', color: '#c0392b', cursor: 'pointer' }}
                    >
                      신고
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CommentsPanel;
