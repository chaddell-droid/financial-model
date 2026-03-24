import { useEffect } from 'react';

function callHarness(method, name) {
  if (typeof window === 'undefined') return;
  const harness = window.__FIN_MODEL_TEST__;
  if (!harness || typeof harness[method] !== 'function') return;
  harness[method](name);
}

export function noteRender(name) {
  callHarness('bumpRender', name);
}

export function noteSliderDraft(name) {
  callHarness('bumpSliderDraft', name);
}

export function noteSliderCommit(name) {
  callHarness('bumpSliderCommit', name);
}

export function noteCompute(name) {
  callHarness('bumpCompute', name);
}

export function useRenderMetric(name) {
  useEffect(() => {
    noteRender(name);
  });
}
