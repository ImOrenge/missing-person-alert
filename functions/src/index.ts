import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import express, {NextFunction, Request, Response} from "express";
import cors from "cors";
import axios from "axios";
import {
  CommentReport,
  CommentReportReason,
  CommentReportStatus,
  MissingPersonComment
} from "./types/missingPersonComments";

// Firebase Admin 초기화
admin.initializeApp();

// Express 앱 생성
const app = express();
type AuthedRequest = Request & {user?: admin.auth.DecodedIdToken};
const db = admin.firestore();

// CORS 설정
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // 개발 환경 origin 목록
    const devOrigins = [
      "http://localhost:5173",
      "http://localhost:3001",
      "http://localhost:4173",
      "https://localhost:5173",
    ];

    // 배포 환경 origin 목록
    const prodOrigins = [
      "https://missing-person-alram.web.app",
      "https://missing-person-alram.firebaseapp.com",
    ];

    const allowedOrigins = [...devOrigins, ...prodOrigins];

    // origin이 없는 경우 (서버 간 통신)
    if (!origin) {
      return callback(null, true);
    }

    // 허용된 origin인 경우
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // development 환경에서는 모든 origin 허용
    logger.warn(`CORS 요청: ${origin}`);
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-recaptcha-token"],
};

app.use(cors(corsOptions));
app.use(express.json());

const ANONYMOUS_PREFIX = "익명";
const COMMENT_COLLECTION = "missingPersonComments";
const REPORT_COLLECTION = "commentReports";
const NOTIFICATION_COLLECTION = "commentNotifications";

const rateLimitCache = new Map<string, {count: number; resetAt: number}>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5분

const isAdminUser = (user?: admin.auth.DecodedIdToken | null): boolean => {
  if (!user) return false;

  // Custom claim으로 admin 체크
  if ((user as any).admin === true) return true;

  // 하드코딩된 관리자 이메일 (임시)
  const hardcodedAdminEmails = ["jmgi1024@gmail.com"];
  if (user.email && hardcodedAdminEmails.includes(user.email)) {
    logger.info(`Admin access granted for: ${user.email}`);
    return true;
  }

  // 환경변수에서 admin 이메일 목록 가져오기
  const adminEmailsEnv = process.env.ADMIN_EMAILS;
  if (adminEmailsEnv) {
    const adminEmails = adminEmailsEnv.split(",").map((email) => email.trim());
    if (user.email && adminEmails.includes(user.email)) {
      logger.info(`Admin access granted via env for: ${user.email}`);
      return true;
    }
  }

  logger.warn(`Admin access denied for: ${user.email || "no email"}`);
  return false;
};

const authenticate = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({success: false, error: "인증이 필요합니다"});
    }

    const token = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error: any) {
    logger.error("인증 실패", error);
    res.status(401).json({success: false, error: "인증 토큰이 유효하지 않습니다"});
  }
};

const requireAdmin = [
  authenticate,
  (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({success: false, error: "관리자 권한이 필요합니다"});
    }
    next();
  }
];

const rateLimit = (keyExtractor: (req: AuthedRequest) => string) => {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const key = keyExtractor(req);
    if (!key) {
      return res.status(400).json({success: false, error: "잘못된 요청입니다"});
    }

    const now = Date.now();
    const entry = rateLimitCache.get(key);
    if (!entry || entry.resetAt < now) {
      rateLimitCache.set(key, {count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS});
      return next();
    }

    if (entry.count >= RATE_LIMIT_MAX) {
      return res.status(429).json({success: false, error: "요청 한도를 초과했습니다"});
    }

    entry.count += 1;
    rateLimitCache.set(key, entry);
    next();
  };
};

const verifyRecaptchaToken = async (token: string, expectedAction: string): Promise<boolean> => {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!secretKey || !token) {
    logger.warn("reCAPTCHA 검증 건너뜀 (환경변수 또는 토큰 누락)");
    return true;
  }

  try {
    const response = await axios.post("https://www.google.com/recaptcha/api/siteverify", null, {
      params: {
        secret: secretKey,
        response: token,
      },
    });

    if (!response.data?.success) {
      logger.error("reCAPTCHA 검증 실패", response.data);
      return false;
    }

    if (response.data.action && response.data.action !== expectedAction) {
      logger.warn(`reCAPTCHA 액션 불일치: ${response.data.action} (예상: ${expectedAction})`);
    }

    const minScore = parseFloat(process.env.RECAPTCHA_MIN_SCORE || "0.5");
    if (typeof response.data.score === "number" && response.data.score < minScore) {
      logger.warn(`reCAPTCHA 점수가 낮음: ${response.data.score}`);
      return false;
    }

    return true;
  } catch (error: any) {
    logger.error("reCAPTCHA 검증 오류", error);
    return process.env.NODE_ENV !== "production";
  }
};

const ensureRecaptcha = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  const token = req.headers["x-recaptcha-token"] as string | undefined;
  const expectedAction = (req.headers["x-recaptcha-action"] as string) || "comment";
  const valid = await verifyRecaptchaToken(token || "", expectedAction);
  if (!valid) {
    return res.status(403).json({success: false, error: "reCAPTCHA 인증에 실패했습니다"});
  }
  next();
};

const buildAnonymousName = () => {
  const random = Math.floor(Math.random() * 900) + 100;
  return `${ANONYMOUS_PREFIX}${random}`;
};

const mapCommentDoc = (doc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>): MissingPersonComment => {
  const data = doc.data() as MissingPersonComment;
  return {
    ...data,
    commentId: doc.id,
  };
};

// 헬스 체크
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "missing-person-firebase-functions",
    timestamp: new Date().toISOString(),
  });
});

// 서버 상태
app.get("/api/status", (req: Request, res: Response) => {
  res.json({
    server: "running",
    service: "missing-person-reports",
    environment: "production",
    platform: "firebase-functions",
  });
});

app.get("/api/comments/:missingPersonId", async (req: Request, res: Response) => {
  try {
    const {missingPersonId} = req.params;
    const {type, order = "latest", limit = "50"} = req.query;

    if (!missingPersonId) {
      return res.status(400).json({success: false, error: "missingPersonId가 필요합니다"});
    }

    let queryRef = db.collection(COMMENT_COLLECTION)
      .where("missingPersonId", "==", missingPersonId) as FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;

    if (type && typeof type === "string") {
      queryRef = queryRef.where("type", "==", type);
    }

    if (order === "popular") {
      queryRef = queryRef.orderBy("likes", "desc").orderBy("createdAt", "desc");
    } else {
      queryRef = queryRef.orderBy("createdAt", "desc");
    }

    const size = Math.min(parseInt(limit as string, 10) || 50, 100);
    queryRef = queryRef.limit(size);

    const snapshot = await queryRef.get();
    const comments = snapshot.docs
      .map(mapCommentDoc)
      .filter((comment) => !comment.isDeleted && !comment.isHidden);

    res.json({success: true, count: comments.length, comments});
  } catch (error: any) {
    logger.error("댓글 조회 실패", error);
    res.status(500).json({success: false, error: "댓글을 불러오지 못했습니다"});
  }
});

app.post(
  "/api/comments",
  authenticate,
  ensureRecaptcha,
  rateLimit((req) => req.user?.uid ?? "anonymous"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {missingPersonId, content, type, isAnonymous = false} = req.body || {};

      if (!missingPersonId || typeof missingPersonId !== "string") {
        return res.status(400).json({success: false, error: "missingPersonId가 필요합니다"});
      }
      if (!content || typeof content !== "string" || content.trim().length < 10) {
        return res.status(400).json({success: false, error: "내용은 10자 이상이어야 합니다"});
      }
      const commentType = (type || "support") as string;
      if (!["sighting", "question", "support"].includes(commentType)) {
        return res.status(400).json({success: false, error: "지원하지 않는 댓글 유형입니다"});
      }

      const userId = req.user?.uid as string;
      const userRecord = await admin.auth().getUser(userId);

      const nickname = isAnonymous
        ? buildAnonymousName()
        : (userRecord.displayName || userRecord.email || userRecord.phoneNumber || buildAnonymousName());

      const now = admin.firestore.Timestamp.now();
      const docRef = db.collection(COMMENT_COLLECTION).doc();

      const comment: MissingPersonComment = {
        commentId: docRef.id,
        missingPersonId,
        userId,
        nickname,
        isAnonymous,
        content: content.trim(),
        type: commentType as any,
        createdAt: now,
        updatedAt: now,
        likes: 0,
        likedBy: [],
        isEdited: false,
        isDeleted: false,
        reported: false,
        reportCount: 0,
        reportedBy: [],
        isHidden: false,
      };

      await docRef.set(comment);

      res.status(201).json({success: true, comment});
    } catch (error: any) {
      logger.error("댓글 작성 실패", error);
      res.status(500).json({success: false, error: "댓글 작성 중 오류가 발생했습니다"});
    }
  }
);

app.patch(
  "/api/comments/:commentId",
  authenticate,
  rateLimit((req) => req.user?.uid ?? "anonymous"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {commentId} = req.params;
      const {content} = req.body || {};

      if (!content || typeof content !== "string" || content.trim().length < 10) {
        return res.status(400).json({success: false, error: "내용은 10자 이상이어야 합니다"});
      }

      const docRef = db.collection(COMMENT_COLLECTION).doc(commentId);
      const snapshot = await docRef.get();

      if (!snapshot.exists) {
        return res.status(404).json({success: false, error: "댓글을 찾을 수 없습니다"});
      }

      const comment = snapshot.data() as MissingPersonComment;
      const isOwner = comment.userId === req.user?.uid;

      if (!isOwner && !isAdminUser(req.user)) {
        return res.status(403).json({success: false, error: "수정 권한이 없습니다"});
      }

      await docRef.update({
        content: content.trim(),
        updatedAt: admin.firestore.Timestamp.now(),
        isEdited: true,
      });

      const updatedSnap = await docRef.get();
      res.json({success: true, comment: mapCommentDoc(updatedSnap as any)});
    } catch (error: any) {
      logger.error("댓글 수정 실패", error);
      res.status(500).json({success: false, error: "댓글 수정 중 오류가 발생했습니다"});
    }
  }
);

app.delete(
  "/api/comments/:commentId",
  authenticate,
  rateLimit((req) => req.user?.uid ?? "anonymous"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {commentId} = req.params;
      const docRef = db.collection(COMMENT_COLLECTION).doc(commentId);
      const snapshot = await docRef.get();

      if (!snapshot.exists) {
        return res.status(404).json({success: false, error: "댓글을 찾을 수 없습니다"});
      }

      const comment = snapshot.data() as MissingPersonComment;
      const isOwner = comment.userId === req.user?.uid;

      if (!isOwner && !isAdminUser(req.user)) {
        return res.status(403).json({success: false, error: "삭제 권한이 없습니다"});
      }

      await docRef.update({
        isDeleted: true,
        isHidden: true,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      res.json({success: true});
    } catch (error: any) {
      logger.error("댓글 삭제 실패", error);
      res.status(500).json({success: false, error: "댓글 삭제 중 오류가 발생했습니다"});
    }
  }
);

app.post(
  "/api/comments/:commentId/like",
  authenticate,
  rateLimit((req) => `like:${req.user?.uid ?? "anonymous"}`),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {commentId} = req.params;
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({success: false, error: "인증이 필요합니다"});
      }
      const docRef = db.collection(COMMENT_COLLECTION).doc(commentId);

      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists) {
          throw new Error("NOT_FOUND");
        }

        const comment = snap.data() as MissingPersonComment;
        const likedSet = new Set(comment.likedBy || []);
        let liked = false;

        if (likedSet.has(userId!)) {
          likedSet.delete(userId!);
          liked = false;
        } else {
          likedSet.add(userId!);
          liked = true;
        }

        const likes = likedSet.size;
        tx.update(docRef, {
          likedBy: Array.from(likedSet),
          likes,
        });

        return {liked, likes};
      });

      res.json({success: true, ...result});
    } catch (error: any) {
      if (error.message === "NOT_FOUND") {
        return res.status(404).json({success: false, error: "댓글을 찾을 수 없습니다"});
      }
      logger.error("댓글 공감 실패", error);
      res.status(500).json({success: false, error: "공감 처리 중 오류가 발생했습니다"});
    }
  }
);

app.post(
  "/api/comments/:commentId/report",
  authenticate,
  ensureRecaptcha,
  rateLimit((req) => `report:${req.user?.uid ?? "anonymous"}`),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {commentId} = req.params;
      const {reason, description} = req.body || {};
      const userId = req.user?.uid;

      if (!userId) {
        return res.status(401).json({success: false, error: "인증이 필요합니다"});
      }

      if (!reason || !["spam", "inappropriate", "false", "other"].includes(reason)) {
        return res.status(400).json({success: false, error: "유효한 신고 사유가 필요합니다"});
      }

      const commentRef = db.collection(COMMENT_COLLECTION).doc(commentId);
      const reportRef = db.collection(REPORT_COLLECTION).doc();

      await db.runTransaction(async (tx) => {
        const commentSnap = await tx.get(commentRef);
        if (!commentSnap.exists) {
          throw new Error("NOT_FOUND");
        }

        const comment = commentSnap.data() as MissingPersonComment;
        const reportedBy = new Set(comment.reportedBy || []);
        if (reportedBy.has(userId)) {
          throw new Error("ALREADY_REPORTED");
        }

        reportedBy.add(userId);
        const reportCount = reportedBy.size;
        const isHidden = comment.isHidden || reportCount >= 3;

        const reportDoc: CommentReport = {
          reportId: reportRef.id,
          commentId,
          reportedBy: userId,
          reason: reason as CommentReportReason,
          description: typeof description === "string" ? description : undefined,
          createdAt: admin.firestore.Timestamp.now(),
          status: "pending",
        };

        tx.set(reportRef, reportDoc);
        tx.update(commentRef, {
          reported: true,
          reportCount,
          reportedBy: Array.from(reportedBy),
          isHidden,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      });

      res.json({success: true});
    } catch (error: any) {
      if (error.message === "NOT_FOUND") {
        return res.status(404).json({success: false, error: "댓글을 찾을 수 없습니다"});
      }
      if (error.message === "ALREADY_REPORTED") {
        return res.status(409).json({success: false, error: "이미 신고한 댓글입니다"});
      }
      logger.error("댓글 신고 실패", error);
      res.status(500).json({success: false, error: "신고 처리 중 오류가 발생했습니다"});
    }
  }
);

app.get("/api/comment-reports", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const {status = "pending", limit = "100"} = req.query;
    const validStatuses = ["pending", "resolved", "dismissed"];
    if (typeof status !== "string" || !validStatuses.includes(status)) {
      return res.status(400).json({success: false, error: "잘못된 상태 값입니다"});
    }

    let queryRef = db.collection(REPORT_COLLECTION)
      .where("status", "==", status)
      .orderBy("createdAt", "desc") as FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;

    queryRef = queryRef.limit(Math.min(parseInt(limit as string, 10) || 100, 200));

    const snapshot = await queryRef.get();
    const reports = snapshot.docs.map((doc) => ({reportId: doc.id, ...doc.data()}));

    res.json({success: true, count: reports.length, reports});
  } catch (error: any) {
    logger.error("신고 목록 조회 실패", error);
    res.status(500).json({success: false, error: "신고 목록을 불러오지 못했습니다"});
  }
});

app.post("/api/comment-reports/:reportId/resolve", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const {reportId} = req.params;
    const {status, hideComment = false} = req.body || {};
    const validStatuses: CommentReportStatus[] = ["resolved", "dismissed"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({success: false, error: "유효한 상태가 필요합니다"});
    }

    const reportRef = db.collection(REPORT_COLLECTION).doc(reportId);
    const reportSnap = await reportRef.get();
    if (!reportSnap.exists) {
      return res.status(404).json({success: false, error: "신고를 찾을 수 없습니다"});
    }

    const report = reportSnap.data() as CommentReport;
    const commentRef = db.collection(COMMENT_COLLECTION).doc(report.commentId);

    const updates: any = {status};
    updates.resolvedAt = admin.firestore.Timestamp.now();
    updates.resolvedBy = req.user?.uid || "admin";

    await db.runTransaction(async (tx) => {
      tx.update(reportRef, updates);

      if (hideComment) {
        tx.update(commentRef, {
          isHidden: true,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      } else if (status === "dismissed") {
        tx.update(commentRef, {
          isHidden: false,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }
    });

    res.json({success: true});
  } catch (error: any) {
    logger.error("신고 처리 실패", error);
    res.status(500).json({success: false, error: "신고 처리 중 오류가 발생했습니다"});
  }
});

app.post("/api/comments/:commentId/moderation", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const {commentId} = req.params;
    const {isHidden = true} = req.body || {};

    const docRef = db.collection(COMMENT_COLLECTION).doc(commentId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return res.status(404).json({success: false, error: "댓글을 찾을 수 없습니다"});
    }

    await docRef.update({
      isHidden: !!isHidden,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    res.json({success: true});
  } catch (error: any) {
    logger.error("댓글 숨김 처리 실패", error);
    res.status(500).json({success: false, error: "댓글 상태 변경 중 오류가 발생했습니다"});
  }
});

// Firestore에서 실종자 데이터 조회
app.get("/api/safe182/missing-persons", async (req: Request, res: Response) => {
  try {
    logger.info("Firestore에서 실종자 데이터 조회");

    const db = admin.firestore();
    const limit = parseInt(req.query.limit as string) || 100;

    // Firestore에서 최신순으로 데이터 조회
    const snapshot = await db
      .collection("missingPersons")
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .get();

    if (snapshot.empty) {
      logger.info("Firestore에 저장된 데이터 없음");
      return res.json({
        result: "00",
        msg: "조회 성공",
        list: [],
        totalCount: 0,
      });
    }

    const persons: any[] = [];
    snapshot.forEach((doc) => {
      persons.push(doc.data());
    });

    logger.info(`Firestore 조회 성공: ${persons.length}건`);

    // 안전드림 API 응답 형식과 동일하게 반환
    res.json({
      result: "00",
      msg: "조회 성공",
      list: persons,
      totalCount: persons.length,
    });
  } catch (error: any) {
    logger.error("Firestore 조회 오류", error);
    res.status(500).json({
      error: "데이터 조회 실패",
      message: error.message,
      list: [],
    });
  }
});

// 안전드림 이미지 프록시
app.get("/api/safe182/photo/:id", async (req: Request, res: Response) => {
  try {
    const {id} = req.params;

    if (!id) {
      return res.status(400).json({error: "식별코드가 필요합니다"});
    }

    const axios = require("axios");
    const response = await axios.get(
      `https://www.safe182.go.kr/api/lcm/imgView.do?msspsnIdntfccd=${id}`,
      {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 10000,
      }
    );

    const contentType = response.headers["content-type"] || "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(response.data);
  } catch (error: any) {
    logger.error("이미지 로드 실패", error);
    res.status(404).json({
      error: "이미지를 찾을 수 없습니다",
      message: error.message,
    });
  }
});

// Admin endpoints
app.get("/api/admin/users", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    // Firebase Auth에서 모든 사용자 가져오기
    const listUsersResult = await admin.auth().listUsers();

    // Firestore에서 각 사용자의 제보 수 가져오기
    const usersWithStats = await Promise.all(
      listUsersResult.users.map(async (userRecord) => {
        const reportsSnapshot = await db
          .collection("missing_persons")
          .where("reportedBy.uid", "==", userRecord.uid)
          .get();

        return {
          uid: userRecord.uid,
          email: userRecord.email || null,
          phoneNumber: userRecord.phoneNumber || null,
          displayName: userRecord.displayName || null,
          createdAt: userRecord.metadata.creationTime,
          lastSignInTime: userRecord.metadata.lastSignInTime || null,
          disabled: userRecord.disabled || false,
          reportCount: reportsSnapshot.size,
          isAdmin: isAdminUser(req.user),
        };
      })
    );

    res.json({
      success: true,
      users: usersWithStats,
      total: usersWithStats.length,
    });
  } catch (error: any) {
    logger.error("유저 목록 조회 실패", error);
    res.status(500).json({
      success: false,
      error: "유저 목록 조회 중 오류가 발생했습니다",
    });
  }
});

app.post("/api/admin/users/:uid/toggle-status", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const {uid} = req.params;
    const {disable} = req.body;

    // Firebase Auth에서 사용자 상태 업데이트
    await admin.auth().updateUser(uid, {
      disabled: disable,
    });

    res.json({
      success: true,
      message: `사용자가 ${disable ? "비활성화" : "활성화"}되었습니다`,
    });
  } catch (error: any) {
    logger.error("사용자 상태 변경 실패", error);
    res.status(500).json({
      success: false,
      error: "사용자 상태 변경 중 오류가 발생했습니다",
    });
  }
});

app.get("/api/admin/statistics", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const {range = "week"} = req.query;

    // 시간 범위 계산
    const now = new Date();
    let startDate: Date;

    switch (range) {
      case "day":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // 전체 제보 가져오기
    const reportsSnapshot = await db.collection("missing_persons").get();
    const allReports = reportsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // 제보 통계
    const userReports = allReports.filter((r: any) => r.source === "user_report");
    const apiReports = allReports.filter((r: any) => r.source !== "user_report");
    const activeReports = allReports.filter((r: any) => r.status === "active");
    const resolvedReports = allReports.filter((r: any) => r.status === "resolved");

    // 오늘, 이번 주, 이번 달 제보
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const todayReports = allReports.filter(
      (r: any) => r.reportedBy?.reportedAt && new Date(r.reportedBy.reportedAt) >= todayStart
    );
    const weekReports = allReports.filter(
      (r: any) => r.reportedBy?.reportedAt && new Date(r.reportedBy.reportedAt) >= weekStart
    );
    const monthReports = allReports.filter(
      (r: any) => r.reportedBy?.reportedAt && new Date(r.reportedBy.reportedAt) >= monthStart
    );

    // 사용자 통계
    const listUsersResult = await admin.auth().listUsers();
    const allUsers = listUsersResult.users;
    const activeUsers = allUsers.filter((u) => !u.disabled);

    const usersWithReports = new Set(
      allReports.filter((r: any) => r.reportedBy?.uid).map((r: any) => r.reportedBy.uid)
    );

    const todayUsers = allUsers.filter((u) => new Date(u.metadata.creationTime) >= todayStart);
    const weekUsers = allUsers.filter((u) => new Date(u.metadata.creationTime) >= weekStart);

    // 지역별 제보 통계
    const locationCounts: {[key: string]: number} = {};
    allReports.forEach((report: any) => {
      if (report.location?.address) {
        // 주소에서 시/도 추출
        const match = report.location.address.match(/^([가-힣]+(?:특별시|광역시|특별자치시|도|특별자치도))/);
        const region = match ? match[1] : "기타";
        locationCounts[region] = (locationCounts[region] || 0) + 1;
      }
    });

    const locations = Object.entries(locationCounts)
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => b.count - a.count);

    // 최근 활동
    const recentActivity: any[] = [];

    // 최근 제보 추가
    const recentReports = allReports
      .filter((r: any) => r.reportedBy?.reportedAt)
      .sort((a: any, b: any) => new Date(b.reportedBy.reportedAt).getTime() - new Date(a.reportedBy.reportedAt).getTime())
      .slice(0, 5);

    recentReports.forEach((report: any) => {
      recentActivity.push({
        type: "report",
        description: `${report.name} (${report.age}세) 실종자 제보`,
        timestamp: report.reportedBy.reportedAt,
      });
    });

    // 최근 가입 사용자 추가
    const recentUsers = allUsers
      .sort((a, b) => new Date(b.metadata.creationTime).getTime() - new Date(a.metadata.creationTime).getTime())
      .slice(0, 5);

    recentUsers.forEach((user) => {
      recentActivity.push({
        type: "user",
        description: `${user.displayName || user.email || "사용자"} 가입`,
        timestamp: user.metadata.creationTime,
      });
    });

    // 시간순 정렬
    recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      success: true,
      statistics: {
        reports: {
          total: allReports.length,
          userReports: userReports.length,
          apiReports: apiReports.length,
          activeReports: activeReports.length,
          resolvedReports: resolvedReports.length,
          todayReports: todayReports.length,
          weekReports: weekReports.length,
          monthReports: monthReports.length,
        },
        users: {
          total: allUsers.length,
          active: activeUsers.length,
          withReports: usersWithReports.size,
          todayRegistered: todayUsers.length,
          weekRegistered: weekUsers.length,
        },
        locations,
        recentActivity: recentActivity.slice(0, 10),
      },
    });
  } catch (error: any) {
    logger.error("통계 조회 실패", error);
    res.status(500).json({
      success: false,
      error: "통계 조회 중 오류가 발생했습니다",
    });
  }
});

// Reports endpoints
app.post(
  "/api/reports",
  authenticate,
  ensureRecaptcha,
  rateLimit((req) => req.user?.uid ?? "anonymous"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {person, uid} = req.body || {};
      const userId = req.user?.uid;

      if (!userId) {
        return res.status(401).json({success: false, error: "인증이 필요합니다"});
      }

      // 요청한 uid와 인증된 uid가 일치하는지 확인
      if (uid !== userId) {
        return res.status(403).json({success: false, error: "권한이 없습니다"});
      }

      // 필수 필드 검증
      if (!person?.name || !person?.age || !person?.location?.address) {
        return res.status(400).json({
          success: false,
          error: "이름, 나이, 실종 장소는 필수 입력 항목입니다",
        });
      }

      // 사용자 정보 가져오기
      const userRecord = await admin.auth().getUser(userId);

      // Firestore에 저장할 데이터 구성
      const docRef = db.collection("missing_persons").doc();
      const now = admin.firestore.Timestamp.now();

      const report = {
        id: docRef.id,
        name: person.name,
        age: person.age,
        gender: person.gender || "M",
        location: {
          lat: person.location.lat || 37.5665,
          lng: person.location.lng || 126.9780,
          address: person.location.address,
        },
        photo: person.photo || null,
        description: person.description || "특이사항 없음",
        missingDate: new Date().toISOString(),
        type: person.type || "missing_child",
        status: "active",
        source: "user_report",
        reportedBy: {
          uid: userId,
          email: userRecord.email || null,
          phoneNumber: userRecord.phoneNumber || null,
          displayName: userRecord.displayName || null,
          reportedAt: now.toDate().toISOString(),
        },
        createdAt: now,
        updatedAt: now,
      };

      // Firestore에 저장
      await docRef.set(report);

      logger.info(`제보 등록 성공: ${report.id} by ${userId}`);

      res.status(201).json({
        success: true,
        report,
        message: "실종자 제보가 성공적으로 등록되었습니다",
      });
    } catch (error: any) {
      logger.error("제보 등록 실패", error);
      res.status(500).json({
        success: false,
        error: "제보 등록 중 오류가 발생했습니다",
      });
    }
  }
);

app.get("/api/reports/my", authenticate, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json({success: false, error: "인증이 필요합니다"});
    }

    // 사용자의 제보 조회
    const reportsSnapshot = await db
      .collection("missing_persons")
      .where("reportedBy.uid", "==", userId)
      .orderBy("createdAt", "desc")
      .get();

    const reports = reportsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      reports,
      total: reports.length,
    });
  } catch (error: any) {
    logger.error("내 제보 조회 실패", error);
    res.status(500).json({
      success: false,
      error: "제보 조회 중 오류가 발생했습니다",
    });
  }
});

app.get("/api/reports/all", authenticate, async (req: AuthedRequest, res: Response) => {
  try {
    // Check if user is admin
    if (!isAdminUser(req.user)) {
      return res.status(403).json({success: false, error: "관리자 권한이 필요합니다"});
    }

    const reportsSnapshot = await db.collection("missing_persons").get();
    const reports = reportsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      reports,
      total: reports.length,
    });
  } catch (error: any) {
    logger.error("전체 제보 조회 실패", error);
    res.status(500).json({
      success: false,
      error: "전체 제보 조회 중 오류가 발생했습니다",
    });
  }
});

app.delete("/api/reports/:reportId", authenticate, async (req: AuthedRequest, res: Response) => {
  try {
    const {reportId} = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json({success: false, error: "인증이 필요합니다"});
    }

    const docRef = db.collection("missing_persons").doc(reportId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({success: false, error: "제보를 찾을 수 없습니다"});
    }

    const reportData = docSnap.data();
    const isOwner = reportData?.reportedBy?.uid === userId;
    const isAdmin = isAdminUser(req.user);

    // 본인 또는 관리자만 삭제 가능
    if (!isOwner && !isAdmin) {
      return res.status(403).json({success: false, error: "삭제 권한이 없습니다"});
    }

    await docRef.delete();

    res.json({
      success: true,
      message: "제보가 삭제되었습니다",
    });
  } catch (error: any) {
    logger.error("제보 삭제 실패", error);
    res.status(500).json({
      success: false,
      error: "제보 삭제 중 오류가 발생했습니다",
    });
  }
});

// Firebase Functions로 export
export const api = onRequest({
  region: "asia-northeast3", // 서울 리전
  cors: true,
  memory: "512MiB",
  timeoutSeconds: 60,
}, app);

/**
 * 안전드림 API에서 실종자 데이터를 가져와서 Firestore에 저장
 * 30분마다 자동 실행
 */
export const pollMissingPersonsAPI = onSchedule({
  schedule: "*/30 * * * *", // 30분마다 실행
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
  memory: "512MiB",
  timeoutSeconds: 540, // 9분
}, async () => {
  try {
    logger.info("🔍 안전드림 182 API 정기 폴링 시작...");

    // 환경변수에서 인증정보 가져오기
    const esntlId = process.env.SAFE182_ESNTL_ID || "10000847";
    const authKey = process.env.SAFE182_AUTH_KEY || "f16ae98f22b44441";

    let allItems: any[] = [];
    let currentPage = 1;
    const rowSize = 100;
    let hasMoreData = true;

    // 페이지네이션으로 모든 데이터 수집
    while (hasMoreData) {
      const params = new URLSearchParams({
        esntlId: esntlId,
        authKey: authKey,
        rowSize: rowSize.toString(),
        page: currentPage.toString(),
      });

      // 대상 구분 추가
      params.append("writngTrgetDscds", "010"); // 아동
      params.append("writngTrgetDscds", "020"); // 일반가출
      params.append("writngTrgetDscds", "040"); // 시설보호자
      params.append("writngTrgetDscds", "060"); // 지적장애
      params.append("writngTrgetDscds", "061"); // 18세미만 지적장애
      params.append("writngTrgetDscds", "062"); // 18세이상 지적장애
      params.append("writngTrgetDscds", "070"); // 치매
      params.append("writngTrgetDscds", "080"); // 신원불상

      const response = await axios.post(
        "https://www.safe182.go.kr/api/lcm/findChildList.do",
        params.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          timeout: 15000,
        }
      );

      if (!response.data || (response.data.result !== "00" && response.data.result !== "true")) {
        logger.warn("⚠️ API 호출 실패:", response.data?.msg || "알 수 없는 오류");
        break;
      }

      const apiList = response.data.list || [];
      const totalCount = response.data.totalCount || 0;

      if (apiList.length === 0) {
        logger.info(currentPage === 1 ? "📭 실종자 정보 없음" : `마지막 페이지 도달`);
        hasMoreData = false;
        break;
      }

      logger.info(`✓ ${apiList.length}건 수신 (전체 ${totalCount}건 중, 페이지 ${currentPage})`);
      allItems = allItems.concat(apiList);

      if (allItems.length >= totalCount || apiList.length < rowSize) {
        hasMoreData = false;
      } else {
        currentPage++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (allItems.length === 0) {
      logger.info("수집된 데이터 없음");
      return;
    }

    logger.info(`📊 총 ${allItems.length}건 수집 완료`);

    // Firestore에서 기존 데이터 확인하여 중복 필터링
    const db = admin.firestore();
    const missingPersonsRef = db.collection("missingPersons");

    let saved = 0;
    let duplicates = 0;

    for (const item of allItems) {
      try {
        // ID 생성
        const id = String(item.msspsnIdntfccd || `safe182_${item.nm}_${item.age}`);

        // 중복 체크
        const docRef = missingPersonsRef.doc(id);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
          duplicates++;
          continue;
        }

        // 데이터 변환
        const transformedItem = transformAPIData(item);

        // Firestore에 저장
        await docRef.set(transformedItem);
        saved++;
      } catch (error: any) {
        logger.error(`데이터 변환/저장 실패 (${item.nm}):`, error.message);
      }
    }

    logger.info(`✅ 폴링 완료: ${saved}건 저장, ${duplicates}건 중복 제외`);
  } catch (error: any) {
    logger.error("❌ 안전드림 API 폴링 오류:", error);
    throw error;
  }
});

/**
 * 안전드림 API 데이터를 Firestore 형식으로 변환
 */
function transformAPIData(apiData: any) {
  const id = String(apiData.msspsnIdntfccd || `safe182_${apiData.nm}_${apiData.age}`);

  // 성별 변환
  const gender = apiData.sexdstnDscd === "남자" ? "M" :
    apiData.sexdstnDscd === "여자" ? "F" : "U";

  // 나이
  const age = parseInt(apiData.ageNow) || parseInt(apiData.age) || 0;

  // 타입 결정
  let type = "runaway";
  switch (apiData.writngTrgetDscd) {
    case "010":
      type = "missing_child";
      break;
    case "020":
      type = "runaway";
      break;
    case "040":
      type = "facility";
      break;
    case "060":
    case "061":
    case "062":
      type = "disabled";
      break;
    case "070":
      type = "dementia";
      break;
    case "080":
      type = "unknown";
      break;
    default:
      type = age < 18 ? "missing_child" : "runaway";
  }

  // 실종일시 파싱
  let missingDate: string;
  try {
    if (apiData.occrde) {
      const dateStr = apiData.occrde.toString();
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      missingDate = new Date(`${year}-${month}-${day}`).toISOString();
    } else {
      missingDate = new Date().toISOString();
    }
  } catch (error) {
    missingDate = new Date().toISOString();
  }

  // 주소에서 좌표 가져오기
  const location = getKoreanCityCoordinates(apiData.occrAdres || "주소 미상");

  // 사진 URL
  const photo = apiData.tknphotolength !== "0" && apiData.msspsnIdntfccd ?
    `https://www.safe182.go.kr/api/lcm/imgView.do?msspsnIdntfccd=${apiData.msspsnIdntfccd}` :
    null;

  return {
    id,
    name: apiData.nm || "미상",
    age: age,
    gender,
    location,
    photo,
    description: apiData.alldressingDscd || "특이사항 없음",
    missingDate,
    type,
    status: "active",
    source: "api",
    height: apiData.height || null,
    weight: apiData.bdwgh || null,
    clothes: apiData.alldressingDscd || null,
    bodyType: apiData.frmDscd || null,
    faceShape: apiData.faceshpeDscd || null,
    hairShape: apiData.hairshpeDscd || null,
    hairColor: apiData.haircolrDscd || null,
    apiTargetCode: apiData.writngTrgetDscd || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * 한국 주요 도시 좌표 반환
 */
function getKoreanCityCoordinates(address: string) {
  const cityCoordinates: {[key: string]: {lat: number; lng: number}} = {
    "서울특별시": {lat: 37.5665, lng: 126.9780},
    "서울": {lat: 37.5665, lng: 126.9780},
    "부산광역시": {lat: 35.1796, lng: 129.0756},
    "부산": {lat: 35.1796, lng: 129.0756},
    "대구광역시": {lat: 35.8714, lng: 128.6014},
    "대구": {lat: 35.8714, lng: 128.6014},
    "인천광역시": {lat: 37.4563, lng: 126.7052},
    "인천": {lat: 37.4563, lng: 126.7052},
    "광주광역시": {lat: 35.1595, lng: 126.8526},
    "광주": {lat: 35.1595, lng: 126.8526},
    "대전광역시": {lat: 36.3504, lng: 127.3845},
    "대전": {lat: 36.3504, lng: 127.3845},
    "울산광역시": {lat: 35.5384, lng: 129.3114},
    "울산": {lat: 35.5384, lng: 129.3114},
    "세종특별자치시": {lat: 36.4800, lng: 127.2890},
    "세종": {lat: 36.4800, lng: 127.2890},
    "경기도": {lat: 37.4138, lng: 127.5183},
    "경기": {lat: 37.4138, lng: 127.5183},
    "강원특별자치도": {lat: 37.8228, lng: 128.1555},
    "강원도": {lat: 37.8228, lng: 128.1555},
    "강원": {lat: 37.8228, lng: 128.1555},
    "충청북도": {lat: 36.8000, lng: 127.7000},
    "충북": {lat: 36.8000, lng: 127.7000},
    "충청남도": {lat: 36.5184, lng: 126.8000},
    "충남": {lat: 36.5184, lng: 126.8000},
    "전북특별자치도": {lat: 35.7175, lng: 127.1530},
    "전라북도": {lat: 35.7175, lng: 127.1530},
    "전북": {lat: 35.7175, lng: 127.1530},
    "전라남도": {lat: 34.8679, lng: 126.9910},
    "전남": {lat: 34.8679, lng: 126.9910},
    "경상북도": {lat: 36.4919, lng: 128.8889},
    "경북": {lat: 36.4919, lng: 128.8889},
    "경상남도": {lat: 35.4606, lng: 128.2132},
    "경남": {lat: 35.4606, lng: 128.2132},
    "제주특별자치도": {lat: 33.4890, lng: 126.4983},
    "제주": {lat: 33.4890, lng: 126.4983},
  };

  // 주소에서 시/도 찾기
  for (const [city, coords] of Object.entries(cityCoordinates)) {
    if (address.includes(city)) {
      return {...coords, address};
    }
  }

  // 매칭 없으면 서울 기본값
  return {lat: 37.5665, lng: 126.9780, address};
}
