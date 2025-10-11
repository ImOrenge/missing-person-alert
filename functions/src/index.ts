import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import express, {Request, Response} from "express";
import cors from "cors";

// Firebase Admin 초기화
admin.initializeApp();

// Express 앱 생성
const app = express();

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

// 안전드림 API 프록시
app.get("/api/safe182/missing-persons", async (req: Request, res: Response) => {
  try {
    // 환경변수에서 인증정보 가져오기
    const esntlId = process.env.SAFE182_ESNTL_ID || "10000847";
    const authKey = process.env.SAFE182_AUTH_KEY || "f16ae98f22b44441";

    logger.info("안전드림 API 호출", {esntlId, authKey: authKey.substring(0, 4) + "****"});

    // axios 대신 fetch 사용 (Firebase Functions v2에서 권장)
    const axios = require("axios");

    const params = new URLSearchParams({
      esntlId: esntlId,
      authKey: authKey,
      rowSize: "100",
    });

    // 대상 구분 코드 추가
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

    // API 응답 검증
    if (response.data.result === "99") {
      logger.error("안전드림 API 인증 실패", response.data);
      return res.status(401).json({
        error: "API 인증 실패",
        message: response.data.msg,
        list: [],
      });
    }

    if (response.data.result !== "00") {
      logger.warn("안전드림 API 응답 오류", response.data);
      return res.json({
        result: response.data.result,
        msg: response.data.msg,
        list: [],
      });
    }

    logger.info("안전드림 API 성공", {count: response.data.list?.length || 0});
    res.json(response.data);
  } catch (error: any) {
    logger.error("안전드림 API 호출 오류", error);
    res.status(500).json({
      error: "API 호출 실패",
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

// TODO: 다른 라우트들도 필요시 추가
// - /api/reports (제보 등록)
// - /api/reports/my (내 제보 조회)
// - /api/admin/* (관리자 기능)

// Firebase Functions로 export
export const api = onRequest({
  region: "asia-northeast3", // 서울 리전
  cors: true,
  memory: "512MiB",
  timeoutSeconds: 60,
}, app);
