import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary 컴포넌트
 * React 컴포넌트 트리에서 발생하는 에러를 catch하고 fallback UI를 표시합니다.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // 다음 렌더링에서 fallback UI를 표시하도록 상태 업데이트
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 에러 로깅 (개발 환경에서만)
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    // 프로덕션에서는 에러 리포팅 서비스로 전송 (Sentry, LogRocket 등)
    // reportErrorToService(error, errorInfo);

    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      // 커스텀 fallback UI가 있으면 사용
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 기본 fallback UI
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle size={32} />
              <h1 className="text-xl font-bold">문제가 발생했습니다</h1>
            </div>

            <p className="text-gray-700 mb-4">
              애플리케이션에서 예기치 않은 오류가 발생했습니다.
              페이지를 새로고침하거나 잠시 후 다시 시도해주세요.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-4 p-3 bg-gray-100 rounded text-sm">
                <summary className="cursor-pointer font-semibold text-gray-800 mb-2">
                  에러 상세 정보 (개발 모드)
                </summary>
                <pre className="text-xs text-red-600 overflow-auto">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                다시 시도
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                페이지 새로고침
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
