import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { firebaseApp } from './firebase';

const MAX_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const storage = getStorage(firebaseApp);

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);

export const uploadCommunityImages = async (files: File[], userId: string): Promise<string[]> => {
  if (files.length > MAX_FILES) {
    throw new Error(`사진은 최대 ${MAX_FILES}장까지 첨부할 수 있습니다`);
  }

  files.forEach((file) => {
    if (!file.type.startsWith('image/')) {
      throw new Error('이미지 파일만 첨부할 수 있습니다');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('사진 한 장의 크기는 5MB 이하여야 합니다');
    }
  });

  return Promise.all(files.map(async (file, index) => {
    const path = `community/${userId}/${Date.now()}-${index}-${sanitizeFileName(file.name)}`;
    const snapshot = await uploadBytes(ref(storage, path), file, { contentType: file.type, cacheControl: 'public,max-age=31536000' });
    return getDownloadURL(snapshot.ref);
  }));
};
