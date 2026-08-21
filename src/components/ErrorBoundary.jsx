import React from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft, Eye, EyeOff } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false };
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

  // Tombol debug: detail error disembunyikan secara default (keputusan
  // keamanan — pesan bisa memuat email/folder/path internal). Pemilik akun
  // bisa membukanya secara opt-in tanpa devtools; info yang sama juga sudah
  // tersedia di console + localStorage('pcp_last_error').
  toggleDetails = () => {
    this.setState((s) => ({ showDetails: !s.showDetails }));
  };

  componentDidUpdate(prevProps, prevState) {
    // Kembalikan ke tersembunyi saat error baru tertangkap.
    if (!prevState.hasError && this.state.hasError && this.state.showDetails) {
      this.setState({ showDetails: false });
    }
  }

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
          {/*
            Detail error disembunyikan secara default (keputusan keamanan —
            pesan bisa memuat email/folder/path internal). Tersedia opt-in via
            tombol "Lihat Detail Error" utk pemilik akun tanpa devtools;
            informasi yang sama juga ada di console + localStorage('pcp_last_error').
          */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <button
              onClick={this.toggleDetails}
              className="flex items-center gap-2 px-4 py-2 border border-border hover:bg-muted text-foreground rounded-lg text-sm font-medium transition-colors"
            >
              {this.state.showDetails ? <EyeOff size={16} /> : <Eye size={16} />}
              {this.state.showDetails ? 'Sembunyikan Detail' : 'Lihat Detail Error'}
            </button>
          </div>

          {this.state.showDetails && (
            <div className="w-full max-w-xl mb-6 space-y-2 text-left">
              <p className="text-[11px] text-muted-foreground">
                Informasi ini hanya untuk debugging dan dapat memuat data pribadi.
              </p>
              <pre className="bg-muted/60 border border-border rounded-lg p-3 text-[11px] leading-relaxed overflow-auto max-h-48 break-all whitespace-pre-wrap font-mono text-foreground">
                {String(this.state.error?.message || this.state.error || 'Kesalahan tidak diketahui.')}
              </pre>
              {this.state.error?.stack && (
                <pre className="bg-muted/60 border border-border rounded-lg p-3 text-[10px] leading-relaxed overflow-auto max-h-56 break-all whitespace-pre-wrap font-mono text-muted-foreground">
                  {String(this.state.error.stack)}
                </pre>
              )}
              {this.state.errorInfo?.componentStack && (
                <pre className="bg-muted/60 border border-border rounded-lg p-3 text-[10px] leading-relaxed overflow-auto max-h-56 break-all whitespace-pre-wrap font-mono text-muted-foreground">
                  {String(this.state.errorInfo.componentStack)}
                </pre>
              )}
            </div>
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
