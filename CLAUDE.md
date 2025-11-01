# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a real-time missing persons alert system built with a Node.js backend and React TypeScript frontend. The application polls the Korean National Police Agency's Safe182 API for missing person data, stores it in Firebase Firestore, and pushes real-time updates to clients via Firestore real-time listeners. Users can view missing persons on Google Maps, filter by region/type/date, report missing persons (with phone authentication), and receive push notifications.

**Key Architecture:**
```
[Safe182 API] ← Polling (5min) ← [Node.js Backend] → [Firebase Firestore] ← Real-time Subscription ← [React Frontend]
                                   (Express + WebSocket)    (Data Store)              (@vis.gl/react-google-maps)
```

The system has evolved from WebSocket-based real-time updates to Firestore real-time subscriptions (`onSnapshot`), making Firebase the single source of truth for data synchronization.

## Common Commands

### Development Setup

```bash
# Backend setup
cd backend
npm install
cp .env.example .env
# Edit .env with API keys (Safe182, Firebase, Google Maps)
npm run dev

# Frontend setup
cd frontend
npm install
cp .env.example .env
# Edit .env with Firebase config, Google Maps API key, reCAPTCHA site key
npm start

# Firebase Functions setup
cd functions
npm install
npm run build
```

### Running Tests

```bash
# E2E tests with Playwright (from root)
npx playwright test

# Run specific test file
npx playwright test tests/admin.spec.js
```

### Building

```bash
# Frontend production build
cd frontend
npm run build

# Firebase Functions build
cd functions
npm run build
```

### Firebase Deployment

```bash
# Deploy everything (hosting, functions, Firestore rules)
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only hosting
firebase deploy --only hosting

# Deploy only Firestore rules
firebase deploy --only firestore:rules
```

### Useful Development Commands

```bash
# View Firebase Functions logs
firebase functions:log

# Check Firebase Functions list
firebase functions:list

# Get Firebase Functions config
firebase functions:config:get

# Set Firebase Functions config
firebase functions:config:set some.key="value"

# View backend logs (when running locally)
cd backend
npm start
```

## Architecture & Data Flow

### Backend Architecture

**Entry Point:** `backend/server.js`
- Express server for REST API endpoints
- WebSocket manager for legacy support (mostly unused now)
- Node-cron scheduler for periodic API polling (default: 5-minute intervals)

**Key Services:**
- `backend/services/apiPoller.js` - Polls Safe182 API, transforms data, geocodes addresses, saves to Firebase
- `backend/services/firebaseService.js` - Firebase Admin SDK operations (save/query Firestore)
- `backend/services/storageService.js` - Firebase Storage operations for photos
- `backend/services/pushNotificationService.js` - FCM push notification sender
- `backend/services/recaptchaService.js` - reCAPTCHA Enterprise verification

**Routes:**
- `/api/auth` - Firebase authentication (login, token refresh)
- `/api/reports` - User-reported missing persons (create, list, update status)
- `/api/admin` - Admin dashboard operations (user management, report review)
- `/api` - Miscellaneous endpoints (status, stats)
- `/` - Missing person pages (dynamic HTML generation for SEO/sharing)

### Frontend Architecture

**Entry Point:** `frontend/src/App.tsx`
- Main React component with authentication state
- Modal management (login, reports, admin, statistics, phone auth)
- Push notification prompt handling
- Announcement banner/popup display

**State Management:**
- **Zustand Store** (`frontend/src/stores/emergencyStore.ts`) - Global state for missing persons, filters, UI state
- Real-time data is synced via `useApiData` hook using Firestore `onSnapshot`

**Key Hooks:**
- `frontend/src/hooks/useApiData.ts` - Firestore real-time subscription (replaces WebSocket)
- `frontend/src/hooks/usePushNotifications.ts` - FCM push notification management

**Components:**
- `EmergencyMap` - Google Maps with markers (@vis.gl/react-google-maps)
- `Sidebar` - List of missing persons with filtering
- `FilterPanel` - Date/region/type filters
- `ReportModal` - User report submission (requires phone auth)
- `AdminDashboard` - Admin UI (tabs for users, reports, comments, statistics, announcements)
- `StatisticsModal` - Regional statistics with minimap heatmap
- `MissingPersonComments` - Comment system for each missing person

### Firebase Functions

**Entry Point:** `functions/src/index.ts`
- Cloud Functions for serverless API endpoints
- Scheduled tasks (daily region statistics aggregation)
- HTTP endpoints for region stats, recaptcha score review

**Key Functions:**
- `aggregateRegionStats` - Scheduled function (daily 2 AM KST) to aggregate missing person counts by region
- `getRegionStats` - HTTP endpoint to fetch aggregated regional statistics
- `reviewRecaptchaScore` - HTTP endpoint for admin to review reCAPTCHA scores

### Data Models

**MissingPerson** (Firestore `missingPersons` collection):
```typescript
{
  id: string;              // Unique ID (from Safe182 API or generated)
  name: string;
  age: number;
  gender: 'M' | 'F' | 'U';
  location: { lat, lng, address };
  photo?: string;          // Primary photo URL
  photos?: string[];       // All photo URLs
  description: string;
  missingDate: string;     // ISO date string
  type: 'missing_child' | 'runaway' | 'disabled' | 'dementia' | 'facility' | 'unknown';
  status: 'active' | 'found' | 'investigating';
  source: 'api' | 'user_report';
  updatedAt: number;       // Timestamp
  reportedBy?: { uid, name, phone, relation, reportedAt };
  commentCount?: number;
  // ... additional fields (height, weight, clothes, bodyType, etc.)
}
```

**User Authentication:**
- Firebase Auth with Google, Phone, and Email/Password providers
- Phone authentication required for user reports
- Admin access controlled via `ADMIN_EMAILS` environment variable and hardcoded UIDs in `frontend/src/utils/adminUtils.ts`

## Important Development Notes

### API Data Polling

The backend polls the Safe182 API on a schedule (default: every 5 minutes via node-cron). The data flow is:
1. `apiPoller.pollMissingPersonsAPI()` fetches all pages from Safe182 API
2. Transform API data format (Korean fields → English)
3. Geocode addresses (Google Geocoding API → OSM fallback → Korean city coordinates)
4. Save to Firestore via `firebaseService.saveMissingPersons()` (upsert logic)
5. Update `lastSeenInAPI` timestamp for each missing person from API
6. Mark stale missing persons as 'found' (auto-discovery)
7. Frontend subscribes to Firestore changes via `useApiData` hook

**Important:** The polling interval is configured via `API_POLL_INTERVAL_MINUTES` environment variable in `backend/.env`.

### Auto-Discovery of Found Missing Persons

The system automatically marks missing persons as "found" when they disappear from the Safe182 API for an extended period, indicating they may have been found or resolved.

**How it works:**
- Each API poll updates the `lastSeenInAPI` timestamp for all active missing persons
- After saving new data, the system checks for missing persons from API source that haven't appeared in recent polls
- If a missing person's `lastSeenInAPI` is older than the threshold (default: 7 days), status changes to 'found'
- A `foundReason` field is added: "API에서 {N}일 이상 확인되지 않음 (자동 처리)"

**Configuration:**
- Set `AUTO_MARK_FOUND_DAYS` in `backend/.env` to adjust the threshold (default: 7)
- Only affects missing persons with `source: 'api'` and `status: 'active'`
- User-reported missing persons are NOT automatically marked as found

**Implementation:**
- `firebaseService.markStaleMissingPersonsAsFound(daysThreshold)` - Finds and marks stale records
- Called during each API poll cycle in `apiPoller.pollMissingPersonsAPI()`
- Broadcasts update to frontend via WebSocket when persons are marked as found

### Real-Time Updates

The system uses **Firestore real-time listeners** (`onSnapshot`) instead of WebSocket for real-time updates. The WebSocket infrastructure still exists in the codebase but is not actively used for data synchronization.

Frontend subscribes to Firestore via:
```typescript
// frontend/src/hooks/useApiData.ts
const q = query(collection(firestore, 'missingPersons'), orderBy('updatedAt', 'desc'));
onSnapshot(q, (snapshot) => {
  // Handle document changes
});
```

### Authentication & Authorization

- **Admin Access:** Determined by `hasAdminAccess(email, uid)` in `frontend/src/utils/adminUtils.ts`
  - Check email against `ADMIN_EMAILS` env var (backend)
  - Hardcoded UIDs in frontend (update this file when adding admins)
- **Phone Verification:** Required for submitting user reports
  - Prompts users without phone numbers to verify via `UserProfileModal`
  - Uses Firebase Phone Auth with reCAPTCHA

### reCAPTCHA Integration

The system uses **reCAPTCHA Enterprise v3** for spam protection on user reports:
1. Frontend loads reCAPTCHA script via `utils/recaptcha.ts`
2. On report submission, execute reCAPTCHA and get token
3. Send token to backend in `x-recaptcha-token` header
4. Backend verifies via Google reCAPTCHA Enterprise API
5. Block submissions with score < `RECAPTCHA_MIN_SCORE` (default: 0.5)

### Firebase Storage

User-uploaded photos are stored in Firebase Storage:
- Path format: `missing-persons/{id}/{filename}`
- Handled by `backend/services/storageService.js`
- Public read access configured in `storage.rules`

### SEO & Social Sharing

The backend generates dynamic HTML pages for missing persons at `/{id}` routes:
- Route: `backend/routes/missingPages.js`
- Includes Open Graph meta tags for social media previews
- Falls back to React SPA for actual app functionality

### Push Notifications

FCM (Firebase Cloud Messaging) is used for push notifications:
1. Frontend requests notification permission via `usePushNotifications` hook
2. FCM token stored in Firestore `userTokens` collection
3. Backend sends notifications via `pushNotificationService.js`
4. Foreground messages handled by `firebaseMessaging.ts`

When user logs out, FCM token is detached via `detachFcmToken()`.

### Regional Statistics

Statistics are pre-aggregated daily via Firebase Functions:
- Scheduled function runs at 2 AM KST (`aggregateRegionStats`)
- Aggregates counts by region (시/도 level) and missing person type
- Stored in `regionStats` collection with date-based document IDs
- Frontend fetches via `getRegionStats` HTTP function
- Displayed in `StatisticsModal` with minimap heatmap visualization

### Comment System

Users can comment on missing persons:
- Firestore collection: `missingPersonComments`
- Supports nested comments (replies)
- Comment reports stored in `commentReports` collection
- Admins can review and manage reports via Admin Dashboard

## Environment Variables

### Backend (`backend/.env`)
- `SAFE182_ESNTL_ID`, `SAFE182_AUTH_KEY` - Safe182 API credentials
- `GOOGLE_GEOCODING_API_KEY` - For precise address geocoding
- `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_PATH` - Firebase Admin SDK
- `RECAPTCHA_SECRET_KEY` - reCAPTCHA Enterprise secret
- `ADMIN_EMAILS` - Comma-separated admin email list
- `ALLOWED_ORIGINS` or `FRONTEND_URL` - CORS configuration
- `API_POLL_INTERVAL_MINUTES` - Polling interval (default: 5)
- `AUTO_MARK_FOUND_DAYS` - Days before auto-marking as found (default: 7)

### Frontend (`frontend/.env`)
- `REACT_APP_GOOGLE_MAPS_API_KEY`, `REACT_APP_MAP_ID` - Google Maps configuration
- `REACT_APP_FIREBASE_*` - Firebase client SDK config
- `REACT_APP_RECAPTCHA_SITE_KEY` - reCAPTCHA site key
- `REACT_APP_API_URL` - Backend API URL (empty for local proxy)

## Common Tasks

### Adding a New Admin

1. Add email to `ADMIN_EMAILS` in `backend/.env`
2. Add UID to `ADMIN_UIDS` array in `frontend/src/utils/adminUtils.ts`
3. Restart backend server

### Modifying Missing Person Types

Types are defined in `frontend/src/types/index.ts`:
```typescript
type MissingPersonType = 'missing_child' | 'runaway' | 'disabled' | 'dementia' | 'facility' | 'unknown';
```

Update:
1. Type definition in `frontend/src/types/index.ts`
2. Type labels in `FilterPanel.tsx` (Korean labels)
3. API transformation in `backend/services/apiPoller.js` (`transformAPIData`)
4. Default filters in `emergencyStore.ts` initial state

### Adjusting API Polling Interval

Set `API_POLL_INTERVAL_MINUTES` in `backend/.env`:
```
API_POLL_INTERVAL_MINUTES=10
```
Restart the backend server for changes to take effect.

### Debugging Firestore Real-Time Issues

Check the browser console for:
```
❌ 실시간 데이터 구독 실패
```

Common issues:
- Firebase config incorrect in `.env`
- Firestore rules blocking read access
- Network connectivity issues

Enable verbose Firestore logging:
```typescript
import { enableIndexedDbPersistence } from 'firebase/firestore';
enableIndexedDbPersistence(firestore)
  .then(() => console.log('✅ Firestore 오프라인 지원 활성화'))
  .catch((err) => console.warn('⚠️ Firestore 오프라인 지원 실패:', err));
```

## Project Structure Notes

- **Root package.json** - Firebase tools and Playwright only
- **Backend** - Standalone Express server (can run independently)
- **Frontend** - Create React App with TypeScript
- **Functions** - Firebase Cloud Functions (TypeScript)
- **Public** - Static assets (PWA manifest, icons, service worker)

The system is designed for Firebase Hosting deployment with Cloud Functions for serverless backend, but the Express backend can also be deployed separately to platforms like Render or Heroku.
