import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Eye, EyeOff, RefreshCw, Shield, Filter, Info } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  CommentReportRecord,
  fetchCommentReports,
  resolveCommentReport,
  moderateCommentVisibility
} from '../../services/commentAdminService';

type ReportStatus = 'pending' | 'resolved' | 'dismissed';

const reasonLabels: Record<CommentReportRecord['reason'], string> = {
  spam: '스팸',
  inappropriate: '부적절',
  false: '허위 정보',
  other: '기타'
};

const statusLabels: Record<ReportStatus, string> = {
  pending: '처리 대기',
  resolved: '처리 완료',
  dismissed: '기각'
};

interface ReportActionState {
  resolvingId: string | null;
  visibilityId: string | null;
}

const CommentReportsTab: React.FC = () => {
  const [reports, setReports] = useState<CommentReportRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReportStatus>('pending');
  const [loading, setLoading] = useState(false);
  const [actionState, setActionState] = useState<ReportActionState>({ resolvingId: null, visibilityId: null });
  const [searchTerm, setSearchTerm] = useState('');

  const loadReports = useCallback(async (status?: ReportStatus) => {
    const targetStatus = status ?? statusFilter;
    try {
      setLoading(true);
      const data = await fetchCommentReports(targetStatus);
      setReports(data);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || '신고 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadReports(statusFilter);
  }, [statusFilter, loadReports]);

  const handleResolve = async (report: CommentReportRecord, nextStatus: 'resolved' | 'dismissed', hideComment: boolean) => {
    try {
      setActionState(state => ({ ...state, resolvingId: report.reportId }));
      await resolveCommentReport(report.reportId, nextStatus, hideComment);
      toast.success('신고가 처리되었습니다');
      await loadReports(statusFilter);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || '신고 처리에 실패했습니다');
    } finally {
      setActionState(state => ({ ...state, resolvingId: null }));
    }
  };

  const handleToggleVisibility = async (report: CommentReportRecord, hide: boolean) => {
    if (!report.commentId) {
      toast.error('댓글 정보를 찾을 수 없습니다');
      return;
    }

    try {
      setActionState(state => ({ ...state, visibilityId: report.commentId }));
      await moderateCommentVisibility(report.commentId, hide);
      toast.success(hide ? '댓글이 숨김 처리되었습니다' : '댓글이 다시 노출되었습니다');
      await loadReports(statusFilter);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || '댓글 상태 변경에 실패했습니다');
    } finally {
      setActionState(state => ({ ...state, visibilityId: null }));
    }
  };

  const filteredReports = useMemo(() => {
    if (!searchTerm.trim()) return reports;
    const term = searchTerm.trim().toLowerCase();
    return reports.filter(report =>
      report.commentId.toLowerCase().includes(term) ||
      report.reportedBy.toLowerCase().includes(term) ||
      (report.comment?.content?.toLowerCase() ?? '').includes(term)
    );
  }, [reports, searchTerm]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: '12px',
        padding: '14px 18px',
        border: '1px solid #e0e0e0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={20} color="#e67e22" />
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#2c3e50', fontWeight: 600 }}>댓글 신고 관리</h3>
            <p style={{ margin: 0, fontSize: '12px', color: '#7f8c8d' }}>
              신고된 댓글을 검토하고, 숨김 및 처리 상태를 관리합니다
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Filter size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#95a5a6' }} />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ReportStatus)}
              style={{
                padding: '8px 10px 8px 34px',
                borderRadius: '8px',
                border: '1px solid #dcdde1',
                fontSize: '13px',
                color: '#2c3e50',
                backgroundColor: 'white'
              }}
            >
              <option value="pending">처리 대기</option>
              <option value="resolved">처리 완료</option>
              <option value="dismissed">기각</option>
            </select>
          </div>
          <button
            onClick={() => loadReports(statusFilter)}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#3498db',
              color: 'white',
              fontSize: '13px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            새로고침
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '180px', backgroundColor: '#fff', borderRadius: '10px', padding: '12px', border: '1px solid #ecf0f1' }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#7f8c8d' }}>전체 신고</p>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#2c3e50' }}>{reports.length}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 2, minWidth: '240px' }}>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="댓글 ID, 신고자, 내용 검색..."
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #dcdde1',
              fontSize: '13px',
              color: '#2c3e50'
            }}
          />
        </div>
      </div>

      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #ecf0f1',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 0.6fr 0.8fr', gap: '12px', padding: '14px', borderBottom: '1px solid #ecf0f1', backgroundColor: '#f8f9fa', fontSize: '12px', color: '#7f8c8d', fontWeight: 600 }}>
          <span>댓글 내용</span>
          <span>신고 정보</span>
          <span>상태</span>
          <span>신고일</span>
          <span style={{ textAlign: 'right' }}>액션</span>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#95a5a6' }}>
            신고 목록을 불러오는 중...
          </div>
        ) : filteredReports.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#95a5a6', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <Info size={28} />
            <span>표시할 신고가 없습니다</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredReports.map(report => {
              const comment = report.comment;
              const resolving = actionState.resolvingId === report.reportId;
              const togglingVisibility = actionState.visibilityId === report.commentId;
              const commentHidden = comment?.isHidden;

              return (
                <div key={report.reportId} style={{ borderTop: '1px solid #f0f2f4', display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 0.6fr 0.8fr', gap: '12px', padding: '16px', alignItems: 'flex-start', fontSize: '13px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#7f8c8d' }}>
                      <AlertTriangle size={14} color="#e67e22" />
                      <span>{report.commentId}</span>
                    </div>
                    <p style={{ margin: 0, color: '#2c3e50', lineHeight: 1.5 }}>{comment?.content || '댓글 내용을 불러올 수 없습니다'}</p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '11px', color: '#95a5a6' }}>
                      <span>작성자: {comment?.nickname || '알 수 없음'}</span>
                      <span>공감 신고: {comment?.reportCount ?? 0}회</span>
                      <span>유형: {comment?.type ?? '미정'}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontWeight: 600 }}>{reasonLabels[report.reason]}</span>
                    <span style={{ fontSize: '12px', color: '#7f8c8d' }}>신고자: {report.reportedBy}</span>
                    {report.description && (
                      <p style={{ margin: 0, color: '#2c3e50', fontSize: '12px', lineHeight: 1.5 }}>{report.description}</p>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{
                      padding: '6px 10px',
                      borderRadius: '999px',
                      backgroundColor: {
                        pending: '#fff3cd',
                        resolved: '#d4efdf',
                        dismissed: '#d6eaf8'
                      }[report.status],
                      color: {
                        pending: '#a67c00',
                        resolved: '#1e8449',
                        dismissed: '#21618c'
                      }[report.status],
                      fontWeight: 600,
                      fontSize: '12px',
                      textAlign: 'center'
                    }}>
                      {statusLabels[report.status]}
                    </span>
                    {report.resolvedBy && (
                      <span style={{ fontSize: '12px', color: '#7f8c8d' }}>
                        처리자: {report.resolvedBy}
                      </span>
                    )}
                    {report.resolvedAt && (
                      <span style={{ fontSize: '12px', color: '#7f8c8d' }}>
                        처리일: {report.resolvedAt.toLocaleString('ko-KR')}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '12px', color: '#2c3e50' }}>
                    <div>{report.createdAt.toLocaleDateString('ko-KR')}</div>
                    <div style={{ color: '#95a5a6' }}>{report.createdAt.toLocaleTimeString('ko-KR')}</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                    {report.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleResolve(report, 'resolved', true)}
                          disabled={resolving}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: '#c0392b',
                            color: 'white',
                            cursor: resolving ? 'default' : 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          <AlertTriangle size={12} />
                          숨김 처리
                        </button>
                        <button
                          onClick={() => handleResolve(report, 'resolved', false)}
                          disabled={resolving}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #27ae60',
                            backgroundColor: 'white',
                            color: '#27ae60',
                            cursor: resolving ? 'default' : 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          <CheckCircle size={12} />
                          유지
                        </button>
                      </div>
                    )}

                    {report.status !== 'pending' && (
                      <button
                        onClick={() => handleResolve(report, 'dismissed', false)}
                        disabled={resolving}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#5dade2',
                          color: 'white',
                          cursor: resolving ? 'default' : 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        다시 검토
                      </button>
                    )}

                    <button
                      onClick={() => handleToggleVisibility(report, !commentHidden)}
                      disabled={togglingVisibility}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #dcdde1',
                        backgroundColor: 'white',
                        color: '#2c3e50',
                        cursor: togglingVisibility ? 'default' : 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      {commentHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                      {commentHidden ? '노출' : '숨김'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentReportsTab;
