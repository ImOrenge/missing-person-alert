const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');

const DEFAULT_BUCKETS = [
  process.env.FIREBASE_STORAGE_BUCKET,
  'missing-person-alram.appspot.com',
  'missing-person-alram.firebasestorage.app'
].filter(Boolean);

class StorageService {
  constructor() {
    this.initialized = false;
    this.bucket = null;
    this.initError = null;
    this.init();
  }

  init() {
    if (this.initialized) {
      return;
    }

    try {
      const apps = getApps();
      if (!apps.length) {
        const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
        if (!fs.existsSync(serviceAccountPath)) {
          throw new Error('serviceAccountKey.json 파일이 없습니다');
        }

        const serviceAccount = require(serviceAccountPath);

        initializeApp({
          credential: cert(serviceAccount),
          storageBucket: DEFAULT_BUCKETS[0]
        });
      }

      // 사용할 수 있는 버킷 탐색
      const storage = getStorage();
      for (const bucketName of DEFAULT_BUCKETS) {
        try {
          const bucket = storage.bucket(bucketName);
          this.bucket = bucket;
          break;
        } catch (error) {
          console.warn(`⚠️  Firebase Storage 버킷 초기화 실패 (${bucketName}):`, error.message);
        }
      }

      if (!this.bucket) {
        throw new Error('사용 가능한 Firebase Storage 버킷을 찾을 수 없습니다');
      }

      this.initialized = true;
      console.log(`✅ Firebase Storage 초기화 완료 (bucket=${this.bucket.name})`);
    } catch (error) {
      this.initError = error;
      console.error('❌ Firebase Storage 초기화 실패:', error.message);
    }
  }

  isReady() {
    return this.initialized && this.bucket;
  }

  async listPhotoUrls(personId) {
    if (!this.isReady()) {
      return [];
    }

    try {
      const [files] = await this.bucket.getFiles({
        prefix: `missing-persons/${personId}/`
      });

      if (!files || files.length === 0) {
        return [];
      }

      return files.map((file) => this.toPublicUrl(file));
    } catch (error) {
      console.warn(`⚠️  사진 목록 조회 실패 (${personId}):`, error.message);
      return [];
    }
  }

  toPublicUrl(file) {
    return `https://storage.googleapis.com/${file.bucket.name}/${file.name}`;
  }

  async cachePhoto(personId, sourceUrl, variant = 'primary') {
    if (!sourceUrl) {
      return null;
    }

    if (!this.isReady()) {
      return sourceUrl;
    }

    try {
      const normalizedVariant = variant.replace(/[^a-zA-Z0-9_-]/g, '');
      const filePath = `missing-persons/${personId}/${normalizedVariant}.jpg`;
      const file = this.bucket.file(filePath);

      const [exists] = await file.exists();
      if (!exists) {
        const response = await axios.get(sourceUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: {
            'User-Agent': 'MissingPersonAlertBot/1.0'
          }
        });

        const contentType = response.headers['content-type'] || 'image/jpeg';
        await file.save(response.data, {
          metadata: {
            contentType
          }
        });

        try {
          await file.makePublic();
        } catch (publicError) {
          console.warn(`⚠️  사진 공개 설정 실패 (${filePath}):`, publicError.message);
        }
      }

      return this.toPublicUrl(file);
    } catch (error) {
      console.warn(`⚠️  사진 캐싱 실패 (${personId}):`, error.message);
      return sourceUrl;
    }
  }

  async ensurePhotos(personId, sourceUrls = []) {
    const existing = await this.listPhotoUrls(personId);
    const collected = new Set(existing);

    for (let index = 0; index < sourceUrls.length; index++) {
      const url = sourceUrls[index];
      if (!url) continue;

      const cachedUrl = await this.cachePhoto(personId, url, index === 0 ? 'primary' : `extra-${index}`);
      if (cachedUrl) {
        collected.add(cachedUrl);
      } else {
        collected.add(url);
      }
    }

    if (collected.size === 0) {
      return [];
    }

    return Array.from(collected);
  }
}

module.exports = new StorageService();
