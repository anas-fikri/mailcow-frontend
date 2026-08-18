import React from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    // Simpan error terakhir utk debugging production — tidak ditampilkan ke
    // layar (keputusan keamanan), hanya bisa diambil via console/localStorage.
    try {
      localStorage.setItem('pcp_last_error', JSON.stringify({
        message: String(error?.message || error),
        stack: String(error?.stack || ''),
        info: errorInfo?.componentStack || '',
        at: new Date().toISOString(),
      }));
    } catch { /* storage penuh / tidak tersedia — abaikan */ }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoBack = () => {
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 bg-background text-foreground">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6">
            <AlertTriangle size={28} className="text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Terjadi Kesalahan</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            Maaf, terjadi kesalahan yang tidak terduga. Silakan coba refresh halaman atau kembali.
          </p>
          {/* Detail error selalu tampil — utk debugging production */}
          {this.state.error && (
            <details className="w-full max-w-md mb-6" open>
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Detail Error
              </summary>
              <pre className="mt-2 p-3 bg-muted rounded-lg text-xs text-muted-foreground overflow-auto max-h-48">
                {this.state.error.message}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={this.handleGoBack}
              className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-sm font-medium transition-colors"
            >
              <ArrowLeft size={16} />
              Kembali
            </button>
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw size={16} />
              Coba Lagi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
