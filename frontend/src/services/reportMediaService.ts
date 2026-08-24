import { getStorage, ref, uploadBytes } from 'firebase/storage';
import { firebaseApp } from './firebase';
import { getAuth } from 'firebase/auth';
import apiClient from './apiClient';

const storage = getStorage(firebaseApp);
const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const randomMediaId = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
};

export const validateReportMedia = (files: File[]) => {
  if (files.length > MAX_FILES) throw new Error(`사진은 최대 ${MAX_FILES}장까지 첨부할 수 있습니다.`);
  files.forEach((file) => {
    if (!ALLOWED_TYPES.has(file.type)) throw new Error('JPEG, PNG, WebP 이미지만 첨부할 수 있습니다.');
    if (file.size > MAX_FILE_SIZE) throw new Error('사진 한 장은 10MB 이하여야 합니다.');
  });
};

export const uploadReportMediaDrafts = async (files: File[], userId: string, draftId: string): Promise<string[]> => {
  validateReportMedia(files);
  return Promise.all(files.map(async (file) => {
    const mediaId = randomMediaId();
    const path = `report-private/${userId}/drafts/${draftId}/${mediaId}`;
    await uploadBytes(ref(storage, path), file, {
      contentType: file.type,
      cacheControl: 'private,max-age=0,no-store',
      customMetadata: { mediaId, draftId, originalSize: String(file.size) },
    });
    return mediaId;
  }));
};

export const waitForReportMediaDrafts = async (
  draftId: string,
  mediaIds: string[],
  timeoutMs = 30_000,
): Promise<void> => {
  if (mediaIds.length === 0) return;
  const user = getAuth().currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await apiClient.get<{
      success: true;
      ready: boolean;
      failed: boolean;
    }>(`/api/v2/report-media/drafts/${encodeURIComponent(draftId)}`, {
      params: { mediaIds: mediaIds.join(',') },
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    });
    if (response.data.failed) throw new Error('첨부 사진의 안전 검사를 통과하지 못했습니다. 다른 사진을 선택해 주세요.');
    if (response.data.ready) return;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  throw new Error('첨부 사진 처리 시간이 길어지고 있습니다. 잠시 후 다시 제출해 주세요.');
};
