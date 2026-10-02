/**
 * config.js — runtime configuration for the static marketing pages.
 *
 * This file is the DEVELOPMENT default. In production the build script
 * (client/scripts/build-site.mjs) regenerates it from environment variables:
 *   VITE_API_URL          → apiBase   (e.g. https://deskguard-api-2lgn.onrender.com/api)
 *   DESKGUARD_CONTACT_EMAIL → contactEmail
 *   DESKGUARD_SITE_URL    → siteUrl
 *
 * Only public, non-secret values belong here — this file is served to every visitor.
 */
window.DESKGUARD_CONFIG = {
  // Base URL of the DeskGuard API. Empty string = same origin ("/api").
  apiBase: '',
  // TODO(owner): set a real, monitored mailbox via DESKGUARD_CONTACT_EMAIL.
  // Until it is set, contact pages fall back to the contact form / GitHub.
  contactEmail: '',
  // Public origin of this site (used for absolute links). Empty = current origin.
  siteUrl: '',
};
