import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const budgetsPath = path.resolve('tests/ui/perf/budgets.json');
const budgets = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));
const baseUrl = process.env.UI_PERF_URL || budgets.appUrl;
const viewport = { width: 1440, height: 1800 };

function fail(message) {
  throw new Error(message);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

async function createSession() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  return { browser, context, page };
}

async function closeSession(session) {
  await session.context.close();
  await session.browser.close();
}

async function gotoApp(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="tab-plan"]', { timeout: 10000 });
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function startLongTaskCapture(page) {
  await page.evaluate(() => {
    if (window.__FIN_PERF_LONGTASK__?.observer) {
      window.__FIN_PERF_LONGTASK__.observer.disconnect();
    }
    const entries = [];
    let observer = null;
    if ('PerformanceObserver' in window) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          entries.push(entry.duration);
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    }
    window.__FIN_PERF_LONGTASK__ = { entries, observer };
  });
}

async function stopLongTaskCapture(page) {
  return page.evaluate(() => {
    const state = window.__FIN_PERF_LONGTASK__;
    if (!state) return { count: 0, maxMs: 0 };
    if (state.observer) state.observer.disconnect();
    const maxMs = state.entries.length ? Math.max(...state.entries) : 0;
    return { count: state.entries.length, maxMs: Math.round(maxMs) };
  });
}

async function measureInteraction(page, { action, ready }) {
  await startLongTaskCapture(page);
  const start = Date.now();
  await action();
  await ready();
  await settle(page);
  const durationMs = Date.now() - start;
  const longTasks = await stopLongTaskCapture(page);
  return { durationMs, ...longTasks };
}

async function measureToggleMetric(testId) {
  const session = await createSession();
  try {
    const { page } = session;
    const samples = [];
    for (let run = 0; run < budgets.runs + budgets.warmups; run += 1) {
      await gotoApp(page);
      await page.getByTestId('tab-plan').click();
      const summaryTestId = 'primary-levers-monthly-savings';
      const before = await page.getByTestId(summaryTestId).innerText();
      const sample = await measureInteraction(page, {
        action: () => page.getByTestId(testId).click(),
        ready: () => page.waitForFunction(({ summaryTestId, before }) => {
          const node = document.querySelector(`[data-testid="${summaryTestId}"]`);
          return node && node.textContent !== before;
        }, { summaryTestId, before }),
      });
      if (run >= budgets.warmups) samples.push(sample);
    }
    return samples;
  } finally {
    await closeSession(session);
  }
}

async function measureSliderMetric(testId, value) {
  const session = await createSession();
  try {
    const { page } = session;
    const samples = [];
    for (let run = 0; run < budgets.runs + budgets.warmups; run += 1) {
      await gotoApp(page);
      await page.getByTestId('tab-plan').click();
      const summaryTestId = 'primary-levers-monthly-outflow';
      const before = await page.getByTestId(summaryTestId).innerText();
      const sample = await measureInteraction(page, {
        action: () => page.getByTestId(testId).evaluate((el, nextValue) => {
          el.value = String(nextValue);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, value),
        ready: () => page.waitForFunction(({ summaryTestId, before }) => {
          const node = document.querySelector(`[data-testid="${summaryTestId}"]`);
          return node && node.textContent !== before;
        }, { summaryTestId, before }),
      });
      if (run >= budgets.warmups) samples.push(sample);
    }
    return samples;
  } finally {
    await closeSession(session);
  }
}

async function measureTabMetric() {
  const session = await createSession();
  try {
    const { page } = session;
    const samples = [];
    for (let run = 0; run < budgets.runs + budgets.warmups; run += 1) {
      await gotoApp(page);
      const sample = await measureInteraction(page, {
        action: () => page.getByTestId('tab-plan').click(),
        ready: () => page.getByTestId('plan-workspace').waitFor(),
      });
      if (run >= budgets.warmups) samples.push(sample);
    }
    return samples;
  } finally {
    await closeSession(session);
  }
}

function summarizeSamples(samples) {
  const durations = samples.map((sample) => sample.durationMs);
  const longTaskCounts = samples.map((sample) => sample.count);
  const longTaskMax = samples.map((sample) => sample.maxMs);
  return {
    medianMs: Math.round(median(durations)),
    p95Ms: Math.round(percentile(durations, 0.95)),
    maxMs: Math.round(Math.max(...durations)),
    longTaskMedianCount: Math.round(median(longTaskCounts)),
    longTaskMaxCount: Math.max(...longTaskCounts),
    longTaskMaxMs: Math.max(...longTaskMax),
  };
}

function checkBudget(metricId, summary) {
  const budget = budgets.metrics.find((entry) => entry.id === metricId);
  if (!budget) fail(`Missing perf budget for ${metricId}`);
  if (summary.medianMs > budget.maxMedianMs) {
    fail(`${metricId} median ${summary.medianMs}ms exceeded budget ${budget.maxMedianMs}ms`);
  }
  if (summary.p95Ms > budget.maxP95Ms) {
    fail(`${metricId} p95 ${summary.p95Ms}ms exceeded budget ${budget.maxP95Ms}ms`);
  }
  if (summary.longTaskMaxCount > budget.maxLongTaskCount) {
    fail(`${metricId} long task count ${summary.longTaskMaxCount} exceeded budget ${budget.maxLongTaskCount}`);
  }
  if (summary.longTaskMaxMs > budget.maxLongTaskMs) {
    fail(`${metricId} long task max ${summary.longTaskMaxMs}ms exceeded budget ${budget.maxLongTaskMs}ms`);
  }
}

const flows = [
  { id: 'shell.overview_to_plan_ready_ms', run: () => measureTabMetric() },
  { id: 'plan.retire_debt_toggle_ms', run: () => measureToggleMetric('scenario-retire-debt') },
  { id: 'plan.van_toggle_ms', run: () => measureToggleMetric('scenario-van-sold') },
  { id: 'plan.cuts_toggle_ms', run: () => measureToggleMetric('scenario-lifestyle-cuts') },
  { id: 'plan.base_expense_slider_ms', run: () => measureSliderMetric('scenario-base-expenses', 42000) },
];

const results = [];
let failed = 0;

try {
  const healthSession = await createSession();
  try {
    await gotoApp(healthSession.page);
  } finally {
    await closeSession(healthSession);
  }
} catch (error) {
  fail(`Perf target did not reach the planner shell at ${baseUrl}: ${error.message}`);
}

for (const flow of flows) {
  try {
    const samples = await flow.run();
    const summary = summarizeSamples(samples);
    checkBudget(flow.id, summary);
    results.push({ id: flow.id, status: 'pass', summary });
  } catch (error) {
    failed += 1;
    results.push({ id: flow.id, status: 'fail', error: error.message });
  }
}

for (const result of results) {
  if (result.status === 'pass') {
    console.log(`PASS ${result.id} median=${result.summary.medianMs}ms p95=${result.summary.p95Ms}ms longTasks=${result.summary.longTaskMaxCount}`);
  } else {
    console.log(`FAIL ${result.id} ${result.error}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
