/**
 * Branding & deployment-specific UI text, configured at build time via Vite env
 * vars (see .env.example). Defaults are neutral so the app works unbranded.
 */
const env = import.meta.env || {};

/** Product name shown in the login header, tab title, and notifications. */
export const APP_NAME = env.VITE_APP_NAME || 'Mailcow Webmail';

/** Organisation name for the footer copyright line; empty = APP_NAME. */
export const ORG_NAME = env.VITE_ORG_NAME || '';

/** Subtitle under the login header. */
export const LOGIN_TAGLINE = env.VITE_LOGIN_TAGLINE || 'Masuk ke webmail Anda';

/** Helpdesk address for "reset password" links; empty hides the link. */
export const SUPPORT_EMAIL = env.VITE_SUPPORT_EMAIL || '';

/** Mail domain used for the email-settings help page when the user is unknown. */
export const DEFAULT_MAIL_DOMAIN = env.VITE_DEFAULT_MAIL_DOMAIN || '';

/** Account pre-filled by the dev-only quick-fill button; empty hides it. */
export const DEV_LOGIN_HINT = env.VITE_DEV_LOGIN_HINT || '';
