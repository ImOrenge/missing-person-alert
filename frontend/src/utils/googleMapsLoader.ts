const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-script';
const GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api/js';
const LOADING_TIMEOUT_MS = 15000;

type GoogleNamespace = typeof google;

declare global {
  interface Window {
    google?: GoogleNamespace;
  }
}

let loaderPromise: Promise<GoogleNamespace> | null = null;

const waitForGoogleMaps = (
  resolve: (value: GoogleNamespace) => void,
  reject: (reason?: Error) => void,
  onSuccess?: () => void
) => {
  const startTime = Date.now();

  const poll = () => {
    if (window.google?.maps?.places) {
      onSuccess?.();
      resolve(window.google);
      return;
    }

    if (Date.now() - startTime > LOADING_TIMEOUT_MS) {
      reject(new Error('Google Maps Places 라이브러리 로드 시간이 초과되었습니다'));
      return;
    }

    setTimeout(poll, 100);
  };

  poll();
};

const insertScriptTag = (apiKey: string) => {
  const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
  if (existingScript) {
    return existingScript;
  }

  const script = document.createElement('script');
  script.id = GOOGLE_MAPS_SCRIPT_ID;
  script.src = `${GOOGLE_MAPS_BASE_URL}?key=${encodeURIComponent(apiKey)}&libraries=places&language=ko`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
  return script;
};

export const loadGoogleMapsScript = (): Promise<GoogleNamespace> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('브라우저 환경에서만 Google Maps를 사용할 수 있습니다'));
  }

  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }

  if (window.google?.maps && typeof window.google.maps.importLibrary === 'function') {
    loaderPromise = window.google.maps
      .importLibrary('places')
      .then(() => window.google as GoogleNamespace)
      .catch((error: Error) => {
        loaderPromise = null;
        throw error;
      });
    return loaderPromise;
  }

  if (loaderPromise) {
    return loaderPromise;
  }

  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error('Google Maps API 키(REACT_APP_GOOGLE_MAPS_API_KEY)가 설정되어 있지 않습니다'));
  }

  loaderPromise = new Promise<GoogleNamespace>((resolve, reject) => {
    const script = insertScriptTag(apiKey);

    const handleError = () => {
      script.removeEventListener('error', handleError);
      loaderPromise = null;
      reject(new Error('Google Maps 스크립트를 불러오지 못했습니다'));
    };

    script.addEventListener('error', handleError);

    waitForGoogleMaps(resolve, (error) => {
      script.removeEventListener('error', handleError);
      loaderPromise = null;
      reject(error);
    }, () => {
      script.removeEventListener('error', handleError);
    });
  });

  return loaderPromise;
};

export default loadGoogleMapsScript;
