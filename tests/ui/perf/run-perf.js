import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const budgetsPath = path.resolve('tests/ui/perf/budgets.json');
const budgets = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));
const budgetById = new Map(budgets.metrics.map((entry) => [entry.id, entry]));
const baseUrl = process.env.UI_PERF_URL || budgets.appUrl;
const viewport = { width: 1440, height: 1800 };

function fail(message) {
  throw new Error(message);
}

function ok(condition, message) {
  if (!condition) fail(message);
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

function getCounter(state, bucket, name) {
  return state?.[bucket]?.[name] || 0;
}

function getMaxCounterDelta(before, after, bucket, names = []) {
  return names.reduce((max, name) => {
    const delta = getCounter(after, bucket, name) - getCounter(before, bucket, name);
    return Math.max(max, delta);
  }, 0);
}

function summarizeSamples(samples) {
  const durations = samples.map((sample) => sample.durationMs);
  const longTaskCounts = samples.map((sample) => sample.count);
  const longTaskMax = samples.map((sample) => sample.maxMs);
  const sliderCommitMax = samples.map((sample) => sample.sliderCommitMax);
  const renderMax = samples.map((sample) => sample.renderMax);
  const computeMax = samples.map((sample) => sample.computeMax);
  return {
    medianMs: Math.round(median(durations)),
    p95Ms: Math.round(percentile(durations, 0.95)),
    maxMs: Math.round(Math.max(...durations)),
    longTaskMedianCount: Math.round(median(longTaskCounts)),
    longTaskMaxCount: Math.max(...longTaskCounts),
    longTaskMaxMs: Math.max(...longTaskMax),
    sliderCommitMax: Math.max(...sliderCommitMax),
    renderMax: Math.max(...renderMax),
    computeMax: Math.max(...computeMax),
  };
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
  await page.waitForFunction(() => Boolean(window.__FIN_MODEL_TEST__?.resetPerfMetrics && window.__FIN_MODEL_TEST__?.getPerfMetrics), null, { timeout: 10000 });
}

async function settle(page, frames = 2) {
  await page.evaluate(async (count) => {
    for (let index = 0; index < count; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, frames);
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

async function resetPerfMetrics(page) {
  return page.evaluate(() => window.__FIN_MODEL_TEST__.resetPerfMetrics());
}

async function readPerfMetrics(page) {
  return page.evaluate(() => window.__FIN_MODEL_TEST__.getPerfMetrics());
}

async function waitForCounterDelta(page, { bucket, name, before, minDelta = 1, timeout = 10000 }) {
  await page.waitForFunction(
    ({ bucket, name, before, minDelta }) => {
      const harness = window.__FIN_MODEL_TEST__;
      if (!harness?.getPerfMetrics) return false;
      const metrics = harness.getPerfMetrics();
      return (((metrics[bucket] || {})[name] || 0) >= before + minDelta);
    },
    { bucket, name, before, minDelta },
    { timeout },
  );
}

async function dragSliderToValue(page, locator, targetValue, steps = 1) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  ok(box, 'missing slider bounding box');
  const meta = await locator.evaluate((element) => ({
    min: Number(element.min || 0),
    max: Number(element.max || 100),
    value: Number(element.value || 0),
  }));
  const range = Math.max(1, meta.max - meta.min);
  const usableWidth = Math.max(12, box.width - 16);
  const clamp = Math.min(meta.max, Math.max(meta.min, targetValue));
  const startRatio = (meta.value - meta.min) / range;
  const endRatio = (clamp - meta.min) / range;
  const y = box.y + (box.height / 2);
  const startX = box.x + 8 + (usableWidth * startRatio);
  const endX = box.x + 8 + (usableWidth * endRatio);
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps });
  await page.mouse.up();
}

async function measureInteraction(page, { action, ready, tracked }) {
  const before = await resetPerfMetrics(page);
  await startLongTaskCapture(page);
  const startedAt = Date.now();
  await action();
  await ready(before);
  await settle(page, 2);
  const after = await readPerfMetrics(page);
  const durationMs = Date.now() - startedAt;
  const longTasks = await stopLongTaskCapture(page);

  return {
    durationMs,
    ...longTasks,
    sliderCommitMax: getMaxCounterDelta(before, after, 'sliderCommitCounts', tracked.sliderCommitNames),
    renderMax: getMaxCounterDelta(before, after, 'renderCounts', tracked.renderNames),
    computeMax: getMaxCounterDelta(before, after, 'computeCounts', tracked.computeNames),
  };
}

function checkBudget(metricId, summary) {
  const budget = budgetById.get(metricId);
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
  if (typeof budget.maxSliderCommitMax === 'number' && summary.sliderCommitMax > budget.maxSliderCommitMax) {
    fail(`${metricId} slider commit max ${summary.sliderCommitMax} exceeded budget ${budget.maxSliderCommitMax}`);
  }
  if (typeof budget.maxRenderMax === 'number' && summary.renderMax > budget.maxRenderMax) {
    fail(`${metricId} render max ${summary.renderMax} exceeded budget ${budget.maxRenderMax}`);
  }
  if (typeof budget.maxComputeMax === 'number' && summary.computeMax > budget.maxComputeMax) {
    fail(`${metricId} compute max ${summary.computeMax} exceeded budget ${budget.maxComputeMax}`);
  }
}

async function measureTabMetric() {
  const session = await createSession();
  try {
    const { page } = session;
    const samples = [];
    for (let run = 0; run < budgets.runs + budgets.warmups; run += 1) {
      await gotoApp(page);
      await startLongTaskCapture(page);
      const startedAt = Date.now();
      await page.getByTestId('tab-plan').click();
      await page.getByTestId('plan-workspace').waitFor();
      await settle(page, 3);
      const durationMs = Date.now() - startedAt;
      const longTasks = await stopLongTaskCapture(page);
      const sample = {
        durationMs,
        ...longTasks,
        sliderCommitMax: 0,
        renderMax: 0,
        computeMax: 0,
      };
      if (run >= budgets.warmups) samples.push(sample);
    }
    return samples;
  } finally {
    await closeSession(session);
  }
}

async function measurePlanSliderMetric({
  tabTestId = 'tab-plan',
  testId,
  targetValue,
  setup,
  tracked,
  readyCounter = { bucket: 'computeCounts', name: 'projection' },
}) {
  const session = await createSession();
  try {
    const { page } = session;
    const samples = [];
    for (let run = 0; run < budgets.runs + budgets.warmups; run += 1) {
      await gotoApp(page);
      if (tabTestId) {
        await page.getByTestId(tabTestId).click();
      }
      if (typeof setup === 'function') {
        await setup(page);
      }
      await settle(page, 3);
      const locator = page.getByTestId(testId);
      const sample = await measureInteraction(page, {
        action: () => dragSliderToValue(page, locator, targetValue),
        ready: (before) => waitForCounterDelta(page, {
          bucket: readyCounter.bucket,
          name: readyCounter.name,
          before: getCounter(before, readyCounter.bucket, readyCounter.name),
        }),
        tracked,
      });
      if (run >= budgets.warmups) samples.push(sample);
    }
    return samples;
  } finally {
    await closeSession(session);
  }
}

async function measureLabelSliderMetric({ tabTestId, label, targetValue, setup, tracked, readyCounter }) {
  const session = await createSession();
  try {
    const { page } = session;
    const samples = [];
    for (let run = 0; run < budgets.runs + budgets.warmups; run += 1) {
      await gotoApp(page);
      if (tabTestId) {
        await page.getByTestId(tabTestId).click();
      }
      if (typeof setup === 'function') {
        await setup(page);
      }
      await settle(page, 3);
      const locator = page.getByLabel(label);
      const sample = await measureInteraction(page, {
        action: () => dragSliderToValue(page, locator, targetValue),
        ready: (before) => waitForCounterDelta(page, {
          bucket: readyCounter.bucket,
          name: readyCounter.name,
          before: getCounter(before, readyCounter.bucket, readyCounter.name),
        }),
        tracked,
      });
      if (run >= budgets.warmups) samples.push(sample);
    }
    return samples;
  } finally {
    await closeSession(session);
  }
}

async function measureGoalSliderMetric() {
  const session = await createSession();
  try {
    const { page } = session;
    const samples = [];
    for (let run = 0; run < budgets.runs + budgets.warmups; run += 1) {
      await gotoApp(page);
      await page.getByTestId('tab-plan').click();
      await page.getByTestId('goal-panel-add-toggle').click();
      await settle(page, 3);
      const locator = page.getByTestId('goal-form-target-month');
      const sample = await measureInteraction(page, {
        action: () => dragSliderToValue(page, locator, 72),
        ready: (before) => waitForCounterDelta(page, {
          bucket: 'sliderCommitCounts',
          name: 'goal-form-target-month',
          before: getCounter(before, 'sliderCommitCounts', 'goal-form-target-month'),
        }),
        tracked: {
          sliderCommitNames: ['goal-form-target-month'],
          renderNames: ['GoalPanel'],
          computeNames: [],
        },
      });
      if (run >= budgets.warmups) samples.push(sample);
    }
    return samples;
  } finally {
    await closeSession(session);
  }
}

async function measureRetirementSliderMetric() {
  const session = await createSession();
  try {
    const { page } = session;
    const samples = [];
    for (let run = 0; run < budgets.runs + budgets.warmups; run += 1) {
      await gotoApp(page);
      await page.getByTestId('tab-plan').click();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const locator = page.getByTestId('retirement-pool-draw-rate');
      await locator.waitFor({ timeout: 10000 });
      await settle(page, 3);
      const sample = await measureInteraction(page, {
        action: () => dragSliderToValue(page, locator, 5.5),
        ready: (before) => waitForCounterDelta(page, {
          bucket: 'sliderCommitCounts',
          name: 'retirement-pool-draw-rate',
          before: getCounter(before, 'sliderCommitCounts', 'retirement-pool-draw-rate'),
        }),
        tracked: {
          sliderCommitNames: ['retirement-pool-draw-rate'],
          renderNames: ['RetirementIncomeChart'],
          computeNames: [],
        },
      });
      if (run >= budgets.warmups) samples.push(sample);
    }
    return samples;
  } finally {
    await closeSession(session);
  }
}

const flows = [
  { id: 'shell.overview_to_plan_ready_ms', run: () => measureTabMetric() },
  {
    id: 'plan.base_expense_slider_drag_ms',
    run: () => measurePlanSliderMetric({
      testId: 'scenario-base-expenses',
      targetValue: 42000,
      tracked: {
        sliderCommitNames: ['scenario-base-expenses'],
        renderNames: ['ScenarioStrip', 'PlanTab'],
        computeNames: ['projection'],
      },
    }),
  },
  {
    id: 'plan.cuts_slider_drag_ms',
    run: () => measurePlanSliderMetric({
      testId: 'scenario-total-cuts',
      targetValue: 16000,
      setup: async (page) => {
        const toggle = page.getByTestId('scenario-lifestyle-cuts');
        if ((await toggle.getAttribute('aria-checked')) !== 'true') {
          await toggle.click();
        }
      },
      tracked: {
        sliderCommitNames: ['scenario-total-cuts'],
        renderNames: ['ScenarioStrip', 'PlanTab'],
        computeNames: ['projection'],
      },
    }),
  },
  {
    id: 'plan.bcs_slider_drag_ms',
    run: () => measurePlanSliderMetric({
      testId: 'scenario-bcs-parents-annual',
      targetValue: 35000,
      tracked: {
        sliderCommitNames: ['scenario-bcs-parents-annual'],
        renderNames: ['ScenarioStrip', 'PlanTab'],
        computeNames: ['projection'],
      },
    }),
  },
  {
    id: 'income.ssdi_approval_slider_drag_ms',
    run: () => measureLabelSliderMetric({
      tabTestId: 'tab-plan',
      label: 'SSDI approval (months out)',
      targetValue: 12,
      readyCounter: { bucket: 'computeCounts', name: 'projection' },
      tracked: {
        sliderCommitNames: ['SSDI approval (months out)'],
        renderNames: ['IncomeControls', 'PlanTab'],
        computeNames: ['projection'],
      },
    }),
  },
  { id: 'goal.target_month_slider_drag_ms', run: () => measureGoalSliderMetric() },
  { id: 'retirement.pool_draw_slider_drag_ms', run: () => measureRetirementSliderMetric() },
  {
    id: 'risk.mc_num_sims_slider_drag_ms',
    run: () => measureLabelSliderMetric({
      tabTestId: 'tab-risk',
      label: 'Number of simulations',
      targetValue: 800,
      readyCounter: { bucket: 'sliderCommitCounts', name: 'Number of simulations' },
      tracked: {
        sliderCommitNames: ['Number of simulations'],
        renderNames: ['MonteCarloPanel'],
        computeNames: [],
      },
    }),
  },
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
    console.log(
      `PASS ${result.id} median=${result.summary.medianMs}ms p95=${result.summary.p95Ms}ms ` +
      `commits=${result.summary.sliderCommitMax} renders=${result.summary.renderMax} computes=${result.summary.computeMax} ` +
      `longTasks=${result.summary.longTaskMaxCount}`
    );
  } else {
    console.log(`FAIL ${result.id} ${result.error}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
