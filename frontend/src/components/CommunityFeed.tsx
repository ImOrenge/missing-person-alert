import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Camera,
  CheckCircle2,
  ChevronDown,
  Heart,
  ImagePlus,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Search,
  Shield,
  UserCircle,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import type { MissingPerson } from '../types';
import type { CommentType } from '../types/comment';
import {
  CommentModel,
  createComment,
  createReply,
  deleteComment,
  ensureCommentAuth,
  fetchCommunityFeed,
  reportComment,
  toggleLikeComment,
  updateComment,
} from '../services/commentService';
import { uploadCommunityImages } from '../services/communityMediaService';

interface CommunityFeedProps {
  persons: MissingPerson[];
  currentUser: User | null;
  isAdmin: boolean;
  initialMissingPersonId?: string | null;
  onBack: () => void;
  onOpenMap: (personId?: string) => void;
  onOpenLogin: () => void;
  onOpenProfile: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void | Promise<void>;
}

type FeedType = 'all' | CommentType;
type FeedOrder = 'latest' | 'popular';

const TYPE_LABELS: Record<CommentType, string> = {
  sighting: '목격',
  question: '문의',
  support: '응원',
};

const TYPE_COLORS: Record<CommentType, string> = {
  sighting: 'bg-red-50 text-red-700',
  question: 'bg-violet-50 text-violet-700',
  support: 'bg-blue-50 text-blue-700',
};

const formatRelativeTime = (date: Date) => {
  const diff = Math.max(0, Date.now() - date.getTime());
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

const getPersonPhoto = (person?: MissingPerson) => person?.photos?.[0] || person?.photo;

const getGenderLabel = (gender: string) => gender === 'M' ? '남성' : gender === 'F' ? '여성' : '성별 미상';

const getPersonTypeLabel = (person?: MissingPerson) => {
  if (!person) return '실종자';
  const labels: Record<string, string> = {
    missing_child: '실종 아동',
    runaway: '가출인',
    disabled: '지적장애인',
    dementia: '치매환자',
    facility: '시설보호자',
    unknown: '신원불상',
  };
  return labels[person.type] || '실종자';
};

const dedupeFiles = (files: File[]) => files.filter((file, index, list) => list.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size) === index).slice(0, 3);

function ImagePreviewStrip({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const nextUrls = files.map((file) => URL.createObjectURL(file));
    setUrls(nextUrls);
    return () => nextUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  if (files.length === 0) return null;
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto">
      {urls.map((url, index) => (
        <div key={`${url}-${index}`} className="relative h-16 w-16 flex-none overflow-hidden rounded-lg border border-slate-200">
          <img src={url} alt="첨부 미리보기" className="h-full w-full object-cover" />
          <button type="button" onClick={() => onRemove(index)} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white" aria-label="사진 삭제"><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}

function CommentImages({ urls }: { urls?: string[] }) {
  if (!urls || urls.length === 0) return null;
  return <div className={`mt-3 grid gap-2 ${urls.length === 1 ? 'grid-cols-1 max-w-md' : 'grid-cols-2'}`}>{urls.map((url) => <img key={url} src={url} alt="첨부 이미지" loading="lazy" className="max-h-72 w-full rounded-lg object-cover" />)}</div>;
}

function PersonBadge({ person, onOpenMap }: { person?: MissingPerson; onOpenMap: (personId?: string) => void }) {
  if (!person) return <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">연결된 실종자 정보를 찾을 수 없습니다.</div>;
  const photo = getPersonPhoto(person);
  return (
    <button type="button" onClick={() => onOpenMap(person.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-[#1e3a5f] hover:bg-white">
      <div className="h-12 w-12 flex-none overflow-hidden rounded-lg bg-slate-200">{photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <UserCircle className="m-3 text-slate-400" size={24} />}</div>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><strong className="truncate text-sm text-slate-950">{person.name}</strong>{person.status !== 'found' && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-black text-red-700">수색 중</span>}</div><p className="mt-1 truncate text-xs text-slate-500">{person.age}세 · {getGenderLabel(person.gender)} · {getPersonTypeLabel(person)}</p><p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500"><MapPin size={12} className="flex-none" /> {person.location.address}</p></div><ArrowRight size={16} className="flex-none text-slate-400" /></button>
  );
}

export default function CommunityFeed({ persons, currentUser, isAdmin, initialMissingPersonId = null, onBack, onOpenMap, onOpenLogin, onOpenProfile, onOpenAdmin, onLogout }: CommunityFeedProps) {
  const [comments, setComments] = useState<CommentModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedType, setFeedType] = useState<FeedType>('all');
  const [feedOrder, setFeedOrder] = useState<FeedOrder>('latest');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(initialMissingPersonId);
  const [postPersonId, setPostPersonId] = useState(initialMissingPersonId || persons[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [content, setContent] = useState('');
  const [newCommentType, setNewCommentType] = useState<CommentType>('support');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyAnonymous, setReplyAnonymous] = useState(false);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const personById = useMemo(() => new Map(persons.map((person) => [person.id, person])), [persons]);

  useEffect(() => {
    setSelectedPersonId(initialMissingPersonId || null);
  }, [initialMissingPersonId]);

  useEffect(() => {
    if (initialMissingPersonId) {
      setPostPersonId(initialMissingPersonId);
    } else if (!postPersonId && persons[0]) {
      setPostPersonId(persons[0].id);
    }
  }, [initialMissingPersonId, persons, postPersonId]);

  const loadFeed = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const next = await fetchCommunityFeed({ order: feedOrder, type: feedType === 'all' ? undefined : feedType, missingPersonId: selectedPersonId || undefined, fallbackMissingPersonIds: persons.map((person) => person.id), limit: 100 });
      setComments(next);
    } catch (loadError: any) {
      setError(loadError?.message || '소통 피드를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [feedOrder, feedType, persons, selectedPersonId]);

  useEffect(() => { void loadFeed(); }, [loadFeed]);

  const repliesByParent = useMemo(() => {
    const grouped = new Map<string, CommentModel[]>();
    comments.filter((comment) => comment.parentCommentId).forEach((comment) => {
      const key = comment.parentCommentId as string;
      grouped.set(key, [...(grouped.get(key) || []), comment]);
    });
    return grouped;
  }, [comments]);

  const posts = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('ko-KR');
    return comments.filter((comment) => !comment.parentCommentId).filter((comment) => {
      if (!query) return true;
      const person = personById.get(comment.missingPersonId);
      return [comment.content, comment.nickname, person?.name, person?.location.address].filter(Boolean).some((value) => String(value).toLocaleLowerCase('ko-KR').includes(query));
    });
  }, [comments, personById, searchQuery]);

  const resetImages = (setter: React.Dispatch<React.SetStateAction<File[]>>) => setter([]);

  const handleFiles = (files: FileList | null, setter: React.Dispatch<React.SetStateAction<File[]>>) => {
    if (!files) return;
    try {
      const next = dedupeFiles(Array.from(files));
      if (next.length > 3) throw new Error('사진은 최대 3장까지 첨부할 수 있습니다');
      next.forEach((file) => {
        if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 첨부할 수 있습니다');
        if (file.size > 5 * 1024 * 1024) throw new Error('사진 한 장의 크기는 5MB 이하여야 합니다');
      });
      setter(next);
    } catch (fileError: any) {
      toast.error(fileError.message);
    }
  };

  const handleCreatePost = async () => {
    if (!currentUser) return onOpenLogin();
    if (content.trim().length < 10) return toast.error('게시글은 최소 10자 이상 입력해주세요');
    if (!postPersonId) return toast.error('게시글을 연결할 실종자를 선택해주세요');
    try {
      ensureCommentAuth();
      setPosting(true);
      const imageUrls = imageFiles.length > 0 ? await uploadCommunityImages(imageFiles, currentUser.uid) : [];
      const created = await createComment(postPersonId, { content: content.trim(), type: newCommentType, isAnonymous, imageUrls });
      setComments((previous) => [created, ...previous]);
      setContent('');
      setImageFiles([]);
      setIsAnonymous(false);
      toast.success('소통 글이 등록되었습니다');
    } catch (postError: any) {
      toast.error(postError?.message || '게시글 등록에 실패했습니다');
    } finally {
      setPosting(false);
    }
  };

  const handleCreateReply = async (parent: CommentModel) => {
    if (!currentUser) return onOpenLogin();
    if (replyContent.trim().length < 10) return toast.error('답글은 최소 10자 이상 입력해주세요');
    try {
      ensureCommentAuth();
      setPosting(true);
      const imageUrls = replyFiles.length > 0 ? await uploadCommunityImages(replyFiles, currentUser.uid) : [];
      const created = await createReply(parent.commentId, { content: replyContent.trim(), isAnonymous: replyAnonymous, imageUrls });
      setComments((previous) => [...previous, created].map((comment) => comment.commentId === parent.commentId ? { ...comment, replyCount: (comment.replyCount || 0) + 1 } : comment));
      setExpandedReplies((previous) => new Set(previous).add(parent.commentId));
      setReplyingTo(null);
      setReplyContent('');
      setReplyFiles([]);
      setReplyAnonymous(false);
      toast.success('답글이 등록되었습니다');
    } catch (replyError: any) {
      toast.error(replyError?.message || '답글 등록에 실패했습니다');
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (comment: CommentModel) => {
    try {
      ensureCommentAuth();
      const result = await toggleLikeComment(comment.commentId);
      setComments((previous) => previous.map((item) => item.commentId === comment.commentId ? { ...item, likes: result.likes, likedBy: currentUser ? (result.liked ? Array.from(new Set([...item.likedBy, currentUser.uid])) : item.likedBy.filter((uid) => uid !== currentUser.uid)) : item.likedBy } : item));
    } catch (likeError: any) {
      toast.error(likeError?.message || '공감 처리에 실패했습니다');
    }
  };

  const handleReport = async (comment: CommentModel) => {
    if (!currentUser) return onOpenLogin();
    const reason = window.prompt('신고 사유를 입력해주세요 (spam, inappropriate, false, other)', 'spam');
    if (!reason || !['spam', 'inappropriate', 'false', 'other'].includes(reason)) return;
    try {
      ensureCommentAuth();
      await reportComment(comment.commentId, reason as 'spam' | 'inappropriate' | 'false' | 'other');
      toast.success('신고가 접수되었습니다');
    } catch (reportError: any) {
      toast.error(reportError?.message || '신고에 실패했습니다');
    }
  };

  const handleEdit = async (comment: CommentModel) => {
    const next = window.prompt('게시글 내용을 수정해주세요 (최소 10자)', comment.content);
    if (!next || next.trim().length < 10) return;
    try {
      const updated = await updateComment(comment.commentId, next.trim());
      setComments((previous) => previous.map((item) => item.commentId === comment.commentId ? updated : item));
      toast.success('수정되었습니다');
    } catch (editError: any) {
      toast.error(editError?.message || '수정에 실패했습니다');
    }
  };

  const handleDelete = async (comment: CommentModel) => {
    if (!window.confirm('이 글을 삭제하시겠습니까?')) return;
    try {
      await deleteComment(comment.commentId);
      setComments((previous) => previous.filter((item) => item.commentId !== comment.commentId && item.parentCommentId !== comment.commentId));
      toast.success('삭제되었습니다');
    } catch (deleteError: any) {
      toast.error(deleteError?.message || '삭제에 실패했습니다');
    }
  };

  const renderReplyComposer = (post: CommentModel) => {
    if (replyingTo !== post.commentId) return null;
    return (
      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
        <textarea value={replyContent} onChange={(event) => setReplyContent(event.target.value.slice(0, 500))} rows={3} placeholder="답글을 작성해주세요 (최소 10자)" className="w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-blue-100" />
        <ImagePreviewStrip files={replyFiles} onRemove={(index) => setReplyFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index))} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={replyAnonymous} onChange={(event) => setReplyAnonymous(event.target.checked)} /> 익명으로 답글</label><div className="flex items-center gap-2"><button type="button" onClick={() => replyFileInputRef.current?.click()} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600"><ImagePlus size={14} /> 사진</button><input ref={replyFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => handleFiles(event.target.files, setReplyFiles)} /><button type="button" onClick={() => { setReplyingTo(null); setReplyContent(''); resetImages(setReplyFiles); }} className="rounded-lg px-2.5 py-2 text-xs font-bold text-slate-500">취소</button><button type="button" disabled={posting} onClick={() => void handleCreateReply(post)} className="rounded-lg bg-[#1e3a5f] px-3 py-2 text-xs font-black text-white disabled:opacity-50">{posting ? '등록 중...' : '답글 등록'}</button></div></div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-[#f8fafc] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3"><button type="button" onClick={onBack} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="현황으로 돌아가기"><ArrowLeft size={20} /></button><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1e3a5f] text-white"><MessageCircle size={19} /></span><div><strong className="block text-sm font-extrabold text-slate-950">실종자 소통</strong><span className="hidden text-[11px] text-slate-500 sm:block">목격 정보와 응원 메시지를 함께 나누는 공간</span></div></div>
          <div className="flex items-center gap-2">{currentUser ? <><button type="button" onClick={onOpenProfile} className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 sm:flex"><UserCircle size={16} /> {currentUser.displayName || currentUser.email}</button>{isAdmin && <button type="button" onClick={onOpenAdmin} className="rounded-lg p-2 text-amber-600 hover:bg-amber-50" aria-label="관리자 대시보드"><Shield size={18} /></button>}<button type="button" onClick={() => void onLogout()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="로그아웃"><LogOut size={18} /></button></> : <button type="button" onClick={onOpenLogin} className="flex items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3 py-2 text-xs font-bold text-white"><LogIn size={15} /> 로그인</button>}</div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6 lg:pt-8">
        <section className="rounded-2xl bg-[#10213a] p-5 text-white shadow-sm sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200">COMMUNITY FEED</p><h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">함께 확인하고, 함께 알려주세요</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">실종자별 목격 정보·문의·응원 메시지를 한곳에서 확인하고 답글을 남길 수 있습니다.</p></div><div className="flex items-center gap-3 text-xs text-slate-300"><span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-emerald-300" /> 신고 정보는 공식 채널과 함께 확인</span></div></div></section>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {currentUser ? <><div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-slate-950">새 소통 글 작성</h2><p className="mt-1 text-xs text-slate-500">확인 가능한 사실과 안전한 응원 메시지를 남겨주세요.</p></div><span className="text-xs text-slate-400">{content.length}/500</span></div><label className="mt-4 block text-xs font-bold text-slate-600">연결할 실종자<select value={postPersonId} onChange={(event) => setPostPersonId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-[#1e3a5f]"><option value="">실종자를 선택해주세요</option>{persons.slice(0, 200).map((person) => <option key={person.id} value={person.id}>{person.name} · {person.location.address}</option>)}</select></label><div className="mt-4 flex flex-wrap gap-2">{(['support', 'sighting', 'question'] as CommentType[]).map((type) => <button key={type} type="button" onClick={() => setNewCommentType(type)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${newCommentType === type ? 'bg-[#1e3a5f] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{TYPE_LABELS[type]}</button>)}</div><textarea value={content} onChange={(event) => setContent(event.target.value.slice(0, 500))} rows={4} placeholder="목격 정보, 문의 또는 응원 메시지를 작성해주세요..." className="mt-3 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-blue-100" /><ImagePreviewStrip files={imageFiles} onRemove={(index) => setImageFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index))} /><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={isAnonymous} onChange={(event) => setIsAnonymous(event.target.checked)} /> 익명으로 남기기</label><button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-600"><Camera size={14} /> 사진 첨부</button><input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => handleFiles(event.target.files, setImageFiles)} /></div><button type="button" disabled={posting} onClick={() => void handleCreatePost()} className="rounded-lg bg-[#d94841] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{posting ? '등록 중...' : '소통 글 등록'}</button></div></> : <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-slate-950">로그인 후 소통에 참여할 수 있습니다</h2><p className="mt-1 text-sm text-slate-500">게시글·답글·사진 첨부와 알림을 사용하려면 로그인해주세요.</p></div><button type="button" onClick={onOpenLogin} className="flex items-center justify-center gap-2 rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-black text-white"><LogIn size={16} /> 로그인</button></div>}
        </section>

        <section className="mt-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:p-4"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="글 내용·작성자·실종자 검색" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-[#1e3a5f]" /></div><select value={selectedPersonId || ''} onChange={(event) => setSelectedPersonId(event.target.value || null)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"><option value="">전체 실종자</option>{persons.slice(0, 200).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><div className="flex gap-2"><button type="button" onClick={() => setFeedOrder('latest')} className={`rounded-lg px-3 py-2 text-xs font-bold ${feedOrder === 'latest' ? 'bg-[#1e3a5f] text-white' : 'border border-slate-200 text-slate-600'}`}>최신순</button><button type="button" onClick={() => setFeedOrder('popular')} className={`rounded-lg px-3 py-2 text-xs font-bold ${feedOrder === 'popular' ? 'bg-[#1e3a5f] text-white' : 'border border-slate-200 text-slate-600'}`}>인기순</button></div></section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 space-y-4" aria-label="소통 게시글 목록">
            <div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-950">최근 소통</h2><p className="mt-1 text-sm text-slate-500">{selectedPersonId ? '선택한 실종자와 관련된 글' : '전체 실종자 피드'}</p></div><div className="flex gap-1.5">{(['all', 'sighting', 'question', 'support'] as FeedType[]).map((type) => <button key={type} type="button" onClick={() => setFeedType(type)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${feedType === type ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>{type === 'all' ? '전체' : TYPE_LABELS[type]}</button>)}</div></div>
            {loading ? <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">소통 글을 불러오는 중입니다...</div> : error ? <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center"><p className="text-sm font-bold text-red-700">{error}</p><button type="button" onClick={() => void loadFeed()} className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-bold text-red-700">다시 시도</button></div> : posts.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center"><MessageCircle className="mx-auto text-slate-300" size={30} /><p className="mt-3 text-sm font-bold text-slate-600">아직 소통 글이 없습니다.</p><p className="mt-1 text-xs text-slate-400">첫 번째 목격 정보나 응원 메시지를 남겨주세요.</p></div> : posts.map((post) => {
              const person = personById.get(post.missingPersonId);
              const replies = repliesByParent.get(post.commentId) || [];
              const isOwner = currentUser?.uid === post.userId;
              const isLiked = !!currentUser && post.likedBy.includes(currentUser.uid);
              return <article key={post.commentId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><PersonBadge person={person} onOpenMap={onOpenMap} /><div className="mt-4 flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-600"><UserCircle size={18} /></span><div><p className="text-sm font-bold text-slate-800">{post.nickname}</p><p className="text-xs text-slate-400">{formatRelativeTime(post.createdAt)} {post.isEdited && '· 수정됨'}</p></div><span className={`rounded px-2 py-1 text-[10px] font-black ${TYPE_COLORS[post.type]}`}>{TYPE_LABELS[post.type]}</span></div><div className="flex items-center gap-1"><button type="button" onClick={() => void handleReport(post)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="게시글 신고"><MoreHorizontal size={17} /></button>{(isOwner || isAdmin) && <div className="flex gap-1"><button type="button" onClick={() => void handleEdit(post)} className="rounded px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100">수정</button><button type="button" onClick={() => void handleDelete(post)} className="rounded px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50">삭제</button></div>}</div></div><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{post.content}</p><CommentImages urls={post.imageUrls} /><div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => void handleLike(post)} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold ${isLiked ? 'bg-red-50 text-red-600' : 'text-slate-500 hover:bg-slate-50'}`}><Heart size={15} fill={isLiked ? 'currentColor' : 'none'} /> 공감 {post.likes}</button><button type="button" onClick={() => { setReplyingTo((current) => current === post.commentId ? null : post.commentId); setExpandedReplies((previous) => new Set(previous).add(post.commentId)); }} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50"><MessageCircle size={15} /> 답글 {post.replyCount || replies.length}</button>{replies.length > 0 && <button type="button" onClick={() => setExpandedReplies((previous) => { const next = new Set(previous); if (next.has(post.commentId)) next.delete(post.commentId); else next.add(post.commentId); return next; })} className="ml-auto flex items-center gap-1 text-xs font-bold text-[#1e3a5f]">{expandedReplies.has(post.commentId) ? '답글 닫기' : '답글 보기'} <ChevronDown size={14} className={expandedReplies.has(post.commentId) ? 'rotate-180' : ''} /></button>}</div>{expandedReplies.has(post.commentId) && replies.length > 0 && <div className="mt-3 space-y-3 border-l-2 border-slate-100 pl-3">{replies.map((reply) => <div key={reply.commentId} className="rounded-lg bg-slate-50 p-3"><div className="flex items-center justify-between"><div><span className="text-xs font-bold text-slate-700">{reply.nickname}</span><span className="ml-2 text-[11px] text-slate-400">{formatRelativeTime(reply.createdAt)}</span></div>{(currentUser?.uid === reply.userId || isAdmin) && <button type="button" onClick={() => void handleDelete(reply)} className="text-[11px] font-bold text-red-600">삭제</button>}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{reply.content}</p><CommentImages urls={reply.imageUrls} /></div>)}</div>}{renderReplyComposer(post)}</article>;
            })}
          </section>

          <aside className="hidden space-y-4 lg:block"><div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><Bell size={17} className="text-[#1e3a5f]" /><h2 className="font-black text-slate-950">소통 이용 안내</h2></div><ul className="mt-3 space-y-2 text-xs leading-5 text-slate-500"><li>• 확인 가능한 목격 정보만 남겨주세요.</li><li>• 긴급한 상황은 댓글보다 112 신고를 이용해주세요.</li><li>• 개인정보·연락처는 게시글에 공개하지 마세요.</li><li>• 부적절한 글은 신고 버튼으로 알려주세요.</li></ul></div><div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><Shield size={17} className="text-emerald-700" /><h2 className="font-black text-slate-950">안전한 제보</h2></div><p className="mt-3 text-xs leading-5 text-slate-500">제보가 필요하면 공식 제보 절차를 이용하세요. 소통 피드는 공개 정보 공유를 위한 공간입니다.</p><button type="button" onClick={onBack} className="mt-3 flex items-center gap-1 text-xs font-black text-[#1e3a5f]">현황으로 이동 <ArrowRight size={14} /></button></div></aside>
        </div>
      </main>
    </div>
  );
}
