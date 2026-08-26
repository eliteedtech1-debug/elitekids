import { Component, ErrorInfo, ReactNode } from 'react';
import { Gamepad2, RefreshCw, Home } from 'lucide-react';
import { t } from '@/lib/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Route-level error boundary for lesson/game pages.
 * One broken asset or render crash must never blank the whole app.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', err, info.componentStack);
  }

  private handleRetry = () => this.setState({ hasError: false, message: '' });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#E7EEF6] p-4">
        <div
          role="alert"
          aria-live="assertive"
          className="max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl animate-game-spring-in"
        >
          <Gamepad2 className="mx-auto mb-3 h-14 w-14 text-[#0F4D92]/30 animate-game-wobble-idle" aria-hidden="true" />
          <h1 className="text-lg font-bold text-gray-800">{t('errorBoundary.title')}</h1>
          <p className="mt-2 text-sm text-gray-500">{t('errorBoundary.body')}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              onClick={this.handleRetry}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#0F4D92] px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-[#0D3F7A] hover:scale-105 active:scale-95 min-h-[44px]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t('errorBoundary.retry')}
            </button>
            <button
              onClick={() => { window.location.href = '/student'; }}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#0F4D92]/20 px-5 py-3 text-sm font-semibold text-[#0F4D92] transition-all hover:bg-[#0F4D92]/5 active:scale-95 min-h-[44px]"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              {t('errorBoundary.home')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
