/**
 * The checkout's one browser-storage key — S1.6: `sessionStorage["aalishaanCheckoutAttempt"]` holds the random
 * attempt key and nothing else (./attempt-key.ts has the rules). It stands alone, with no import, so the Cookies
 * page's clear control (src/components/help/clear-preview-control.tsx) can name it without loading the checkout.
 */
export const ATTEMPT_STORAGE_KEY = "aalishaanCheckoutAttempt";
