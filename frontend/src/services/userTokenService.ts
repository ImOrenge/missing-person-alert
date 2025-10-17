import { Timestamp, runTransaction } from 'firebase/firestore';
import { firestore, doc } from './firebase';

const LOCAL_STORAGE_KEY = 'mp_push_token_state';
const TOKEN_PRUNE_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const MAX_TOKENS_PER_USER = 5;

type TokenMetadata = {
  token: string;
  createdAt: Timestamp;
  lastSeenAt: Timestamp;
  userAgent?: string | null;
  platform?: string | null;
};

type UserTokenDocument = {
  userId: string;
  tokens: Record<string, TokenMetadata>;
  updatedAt: Timestamp;
  lastPrunedAt?: Timestamp;
};

type LocalTokenState = {
  token: string;
  uid: string | null;
  updatedAt: number;
};

const readLocalTokenState = (): LocalTokenState | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalTokenState;
  } catch (error) {
    console.warn('[PushToken] 로컬 토큰 상태를 읽는 중 오류:', error);
    return null;
  }
};

const writeLocalTokenState = (state: LocalTokenState | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (state) {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } else {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('[PushToken] 로컬 토큰 상태를 저장하는 중 오류:', error);
  }
};

const detectPlatform = (): string | null => {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) return 'ios';
  if (/android/.test(userAgent)) return 'android';
  if (/windows/.test(userAgent)) return 'windows';
  if (/mac/.test(userAgent)) return 'mac';
  if (/linux/.test(userAgent)) return 'linux';
  return 'web';
};

const nowTimestamp = () => Timestamp.now();

const isTokenExpired = (metadata?: TokenMetadata | null) => {
  if (!metadata?.lastSeenAt) return false;
  const lastSeenMs = metadata.lastSeenAt.toMillis();
  const diff = Date.now() - lastSeenMs;
  return diff > TOKEN_PRUNE_THRESHOLD_MS;
};

const buildTokenMetadata = (existing: TokenMetadata | undefined, token: string): TokenMetadata => {
  const now = nowTimestamp();
  return {
    token,
    createdAt: existing?.createdAt ?? now,
    lastSeenAt: now,
    userAgent: typeof navigator === 'undefined' ? existing?.userAgent ?? null : navigator.userAgent.slice(0, 500),
    platform: detectPlatform()
  };
};

const pruneTokens = (tokens: Record<string, TokenMetadata>, tokenToKeep: string) => {
  const entries = Object.entries(tokens ?? {}) as Array<[string, TokenMetadata]>;

  // 1) 만료 토큰 제거
  const activeEntries = entries.filter(([key, metadata]) => !isTokenExpired(metadata) || key === tokenToKeep);

  // 2) 중복 및 개수 제한 처리 (최대 MAX_TOKENS_PER_USER 저장)
  const sortedEntries = activeEntries
    .filter(([key]) => key !== tokenToKeep)
    .sort(([, aMeta], [, bMeta]) => (bMeta?.lastSeenAt?.toMillis() ?? 0) - (aMeta?.lastSeenAt?.toMillis() ?? 0));

  const limitedEntries = sortedEntries.slice(0, Math.max(0, MAX_TOKENS_PER_USER - 1));
  const prunedMap: Record<string, TokenMetadata> = Object.fromEntries(limitedEntries);

  if (tokens[tokenToKeep]) {
    prunedMap[tokenToKeep] = tokens[tokenToKeep];
  }

  return prunedMap;
};

const replaceTokenMap = (
  docData: UserTokenDocument | undefined,
  uid: string,
  token: string
): UserTokenDocument => {
  const existingTokens = docData?.tokens ?? {};
  const existingMetadata = existingTokens[token];
  const prunedTokens = pruneTokens(existingTokens, token);

  prunedTokens[token] = buildTokenMetadata(existingMetadata, token);

  return {
    userId: uid,
    tokens: prunedTokens,
    updatedAt: nowTimestamp(),
    lastPrunedAt: nowTimestamp()
  };
};

export const syncUserFcmToken = async (uid: string, token: string) => {
  if (!uid || !token) {
    return;
  }

  const previousState = readLocalTokenState();
  if (previousState?.uid && previousState.uid !== uid && previousState.token) {
    await detachFcmToken(previousState.uid, previousState.token, { skipLocalUpdate: true });
  }

  const tokenRef = doc(firestore, 'userTokens', uid);

  await runTransaction(firestore, async transaction => {
    const snapshot = await transaction.get(tokenRef);
    const currentData = snapshot.exists() ? (snapshot.data() as UserTokenDocument) : undefined;
    const nextData = replaceTokenMap(currentData, uid, token);
    transaction.set(tokenRef, nextData);
  });

  writeLocalTokenState({
    token,
    uid,
    updatedAt: Date.now()
  });
};

type DetachOptions = {
  skipLocalUpdate?: boolean;
};

export const detachFcmToken = async (uid: string, token: string, options?: DetachOptions) => {
  if (!uid || !token) {
    return;
  }

  const tokenRef = doc(firestore, 'userTokens', uid);

  await runTransaction(firestore, async transaction => {
    const snapshot = await transaction.get(tokenRef);
    if (!snapshot.exists()) {
      return;
    }

    const currentData = snapshot.data() as UserTokenDocument;
    const nextTokens = { ...(currentData.tokens ?? {}) };
    delete nextTokens[token];

    if (Object.keys(nextTokens).length === 0) {
      transaction.delete(tokenRef);
      return;
    }

    transaction.set(tokenRef, {
      userId: uid,
      tokens: nextTokens,
      updatedAt: nowTimestamp()
    });
  });

  if (!options?.skipLocalUpdate) {
    const state = readLocalTokenState();
    if (state?.token === token && state.uid === uid) {
      writeLocalTokenState({
        token,
        uid: null,
        updatedAt: Date.now()
      });
    }
  }
};

export const clearLocalTokenState = () => {
  writeLocalTokenState(null);
};

export const getLocalTokenState = () => readLocalTokenState();
