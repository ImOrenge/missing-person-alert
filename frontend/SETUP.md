# ✅ Create React App으로 변경 완료!

## 🔄 변경 사항

- ❌ Vite 제거
- ✅ Create React App (react-scripts) 사용
- ✅ 환경 변수: `REACT_APP_*` 사용

## 🚀 설치 및 실행 (Windows PowerShell)

### 1단계: 기존 파일 삭제

```powershell
cd "c:\missing person\frontend"
rm package-lock.json
rm -r -force node_modules
```

Vite 관련 파일 삭제:
```powershell
rm vite.config.ts
rm index.html
rm src\vite-env.d.ts
```

### 2단계: 패키지 재설치

```powershell
npm cache clean --force
npm install
```

### 3단계: 환경 변수 설정

`.env` 파일이 이미 생성되어 있습니다:

```powershell
notepad .env
```

다음 내용을 입력하세요:
```
REACT_APP_GOOGLE_MAPS_API_KEY=여기에_구글맵_API키_입력
REACT_APP_MAP_ID=여기에_맵ID_입력
REACT_APP_WS_URL=ws://localhost:8080
```

### 4단계: 실행

```powershell
npm start
```

✅ 브라우저가 자동으로 열립니다: `http://localhost:3000`

---

## 📦 설치될 패키지

- ✅ react-scripts@5.0.1
- ✅ react@18.2.0
- ✅ @vis.gl/react-google-maps
- ✅ zustand
- ✅ react-use-websocket
- ✅ react-toastify
- ✅ typescript

---

## 🔧 문제 해결

### 오류: `react-scripts: command not found`

```powershell
rm package-lock.json
rm -r -force node_modules
npm cache clean --force
npm install
```

### 오류: 포트 3000이 사용 중

다른 프로그램이 3000번 포트를 사용 중입니다:
```powershell
netstat -ano | findstr :3000
taskkill /PID <PID번호> /F
```

또는 `.env` 파일에 다른 포트 지정:
```
PORT=3001
```

---

## ✅ 완료!

이제 `npm start`로 실행하세요!
