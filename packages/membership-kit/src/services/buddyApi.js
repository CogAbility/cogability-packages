/**
 * buddyApi — thin module adapter over @cogability/sdk CamClient.
 * All real logic lives in CamClient.
 */

import { CamClient, BrowserSessionStore } from '@cogability/sdk';

function getHost() {
  if (import.meta.env.DEV) return '/cogbot-api';
  return import.meta.env.VITE_COGBOT_HOST || '';
}

const cam = new CamClient({
  host: getHost(),
  cogbotId: import.meta.env.VITE_COGBOT_ID || 'mc_0091:full',
  sessionStore: new BrowserSessionStore(),
});

export async function setAnonymousTokens() {
  return cam.initAnonymous();
}

export async function setAuthenticatedTokens(idToken) {
  return cam.initAuthenticated(idToken);
}

export async function initCogbot() {
  return cam.initCogbot();
}

export async function fetchGreeting() {
  return cam.fetchGreeting();
}

export async function sendMessage(text) {
  return cam.sendMessage(text, { anonymous: true });
}

export async function sendMessageStream(text, { onEvent, signal, anonymous = true } = {}) {
  for await (const event of cam.streamMessage(text, { anonymous, signal })) {
    onEvent?.(event);
  }
}

export async function sendAuthenticatedMessage(text, { idToken }) {
  await cam.initAuthenticated(idToken);
  return cam.sendMessage(text, { anonymous: false });
}

export async function sendAuthenticatedMessageStream(text, { idToken, onEvent, signal }) {
  await cam.initAuthenticated(idToken);
  for await (const event of cam.streamMessage(text, { anonymous: false, signal })) {
    onEvent?.(event);
  }
}

export function buildOnboardingMessage(parentInfo, children) {
  return CamClient.buildOnboardingMessage(parentInfo, children);
}

export function parseResponseGeneric(response) {
  return CamClient.parseResponseGeneric(response);
}

/** Expose the underlying CamClient instance for advanced use. */
export { cam };
