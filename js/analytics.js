import { CONFIG } from '../config.js';

// Optional visit stats, heatmaps and session recordings with PostHog. Off
// without a key, on this computer while developing, and for the owner when
// signed in, so their own cooking doesn't fill the numbers.
//
// Anything with the class ph-no-capture is blanked in recordings, and what
// people type is masked by default.

let posthog = null;
let queue = [];
let off = true;

export function startAnalytics({ signedIn }) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!CONFIG.posthogKey || local || signedIn) return;
  off = false;
  const host = CONFIG.posthogHost || 'https://us.i.posthog.com';
  const script = document.createElement('script');
  script.src = `${host.replace('.i.posthog.com', '-assets.i.posthog.com')}/static/array.js`;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.onload = () => {
    posthog = window.posthog;
    posthog.init(CONFIG.posthogKey, {
      api_host: host,
      defaults: '2026-08-30',
      person_profiles: 'identified_only',
      // Mise changes screens inside one page (#/r/…), so it sends its own page views.
      capture_pageview: false,
      capture_pageleave: true,
      capture_heatmaps: true,
    });
    for (const [event, props] of queue) posthog.capture(event, props);
    queue = [];
  };
  // Blocked by an ad blocker or offline: stop collecting.
  script.onerror = () => {
    off = true;
    queue = [];
  };
  document.head.append(script);
}

export function track(event, props) {
  if (off) return;
  if (posthog) posthog.capture(event, props);
  else queue.push([event, props]);
}
