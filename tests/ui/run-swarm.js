import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const manifestPath = path.resolve('tests/ui/coverage-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const baseUrl = process.env.UI_SWARM_URL || manifest.appUrl;
const stickyUrl = baseUrl.includes('reset_storage=1')
  ? baseUrl.replace(/([?&])reset_storage=1(&?)/, (match, prefix, suffix) => (suffix ? prefix : ''))
  : baseUrl;
const VIEWPORTS = {
  desktop: { width: 1440, height: 2600 },
  stacked: { width: 1180, height: 2200 },
  compact: { width: 900, height: 1600 },
};

function fail(message) {
  throw new Error(message);
}

function ok(condition, message) {
  if (!condition) fail(message);
}

function eq(actual, expected, message) {
  if (actual !== expected) {
    fail(`${message}: expected ${expected}, got ${actual}`);
  }
}

function summarizeResults(results) {
  const passed = results.filter((result) => result.status === 'pass').length;
  const failed = results.filter((result) => result.status === 'fail').length;
  return { passed, failed, total: results.length };
}

function printWorkerSummary(workerId, results) {
  const summary = summarizeResults(results);
  console.log(`\n[${workerId}] ${summary.passed}/${summary.total} passed`);
  for (const result of results) {
    const prefix = result.status === 'pass' ? 'PASS' : 'FAIL';
    console.log(`  ${prefix} ${result.id}${result.note ? ` - ${result.note}` : ''}`);
    if (result.error) {
      console.log(`    ${result.error}`);
    }
  }
}

async function createSession(viewport = 'desktop') {
  const resolvedViewport = typeof viewport === 'string'
    ? (VIEWPORTS[viewport] || VIEWPORTS.desktop)
    : viewport;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: resolvedViewport, acceptDownloads: true });
  const page = await context.newPage();
  const consoleIssues = [];
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      consoleIssues.push(`${msg.type()}: ${msg.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    consoleIssues.push(`pageerror: ${error.message}`);
  });
  return { browser, context, page, consoleIssues };
}

async function closeSession(session) {
  await session.context.close();
  await session.browser.close();
}

async function gotoApp(page, { reset = true } = {}) {
  await page.goto(reset ? baseUrl : stickyUrl, { waitUntil: 'networkidle' });
}

async function hoverMidpoint(locator) {
  const box = await locator.boundingBox();
  ok(box, 'missing hover target bounding box');
  await locator.hover({ position: { x: Math.max(4, box.width / 2), y: Math.max(4, box.height / 2) } });
}

async function runEntry(id, fn) {
  try {
    const note = await fn();
    return { id, status: 'pass', note };
  } catch (error) {
    return { id, status: 'fail', error: error instanceof Error ? error.message : String(error) };
  }
}

async function worker1() {
  const session = await createSession({ width: 1440, height: 2600 });
  const { page, consoleIssues } = session;
  const results = [];

  try {
    await gotoApp(page);

    results.push(await runEntry('shell.header.primary_controls', async () => {
      await page.getByTestId('header-present-mode').click();
      await expectAria(page.getByTestId('header-present-mode'), /Exit presentation mode/i, 'present mode aria did not toggle');
      await page.getByTestId('header-present-mode').click();

      await page.getByTestId('header-enter-sarah-mode').click();
      await page.getByTestId('sarah-mode-exit').click();

      await page.getByTestId('header-enter-dad-mode').click();
      await page.getByTestId('dad-mode-exit').click();

      await page.getByTestId('header-toggle-save-load').click();
      ok(await page.getByTestId('save-load-panel').count() === 1, 'save/load panel did not open');
      await page.getByTestId('header-toggle-save-load').click();
      ok(await page.getByTestId('save-load-panel').count() === 0, 'save/load panel did not close');

      await page.getByTestId('scenario-retire-debt').click();
      let resetDialogMessage = '';
      page.once('dialog', async (dialog) => {
        resetDialogMessage = dialog.message();
        await dialog.accept();
      });
      await page.getByTestId('header-reset-all').click();
      await page.waitForTimeout(120);
      ok(resetDialogMessage.includes('Reset all assumptions'), 'reset confirmation message mismatch');
      ok((await page.getByTestId('scenario-retire-debt').getAttribute('aria-checked')) === 'false', 'reset did not restore baseline state');

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('header-export-json').click();
      const download = await downloadPromise;
      ok(Boolean(download.suggestedFilename()), 'export did not produce a download');
      return 'header actions and reset confirmation behaved correctly';
    }));

    results.push(await runEntry('shell.tab_bar.navigation', async () => {
      await page.getByTestId('tab-overview').click();
      await expectVisibleText(page, 'Bridge to Sustainability');
      await page.getByTestId('tab-plan').click();
      ok(await page.getByTestId('income-controls').count() === 1, 'plan tab missing income controls');
      await page.getByTestId('tab-income').click();
      await expectVisibleText(page, 'MSFT Vesting Runway');
      await page.getByTestId('tab-risk').click();
      ok(await page.getByTestId('monte-carlo-panel').count() === 1, 'risk tab missing Monte Carlo panel');
      await page.getByTestId('tab-details').click();
      await expectVisibleText(page, 'Detailed Projections');
      return 'all tabs switched to expected content';
    }));

    results.push(await runEntry('shell.mode_exclusivity', async () => {
      await gotoApp(page);
      await page.getByTestId('header-enter-sarah-mode').click();
      ok(await page.getByTestId('sarah-mode-root').count() === 1, 'Sarah mode did not render');
      ok(await page.getByTestId('app-shell').count() === 0, 'planner shell should not remain visible in Sarah mode');
      ok(await page.getByTestId('goal-panel').count() === 0, 'planner goal panel should be hidden in Sarah mode');

      await page.getByTestId('header-present-mode').click();
      ok(await page.getByTestId('app-shell').count() === 1, 'present mode should restore the planner shell');
      ok(await page.getByTestId('sarah-mode-root').count() === 0, 'Sarah mode should clear when present mode starts');
      ok(await page.getByTestId('header-enter-sarah-mode').count() === 0, 'present mode should hide alternate-mode buttons');

      await page.getByTestId('header-present-mode').click();
      await page.getByTestId('header-enter-dad-mode').click();
      ok(await page.getByTestId('dad-mode-root').count() === 1, 'Dad mode did not render');
      ok(await page.getByTestId('sarah-mode-root').count() === 0, 'Sarah mode should not remain visible in Dad mode');
      ok(await page.getByTestId('app-shell').count() === 0, 'planner shell should not remain visible in Dad mode');
      ok(await page.getByTestId('header-toggle-save-load').count() === 0, 'planner-only utility controls should be hidden in Dad mode');
      await page.getByTestId('dad-mode-exit').click();
      ok(await page.getByTestId('app-shell').count() === 1, 'planner shell should return after leaving Dad mode');
      return 'planner, present, Sarah, and Dad states stayed mutually exclusive';
    }));

    results.push(await runEntry('shell.save_load.lifecycle', async () => {
      await page.getByTestId('header-toggle-save-load').click();
      await page.getByTestId('save-load-name').fill('Swarm Worker 1');
      await page.getByTestId('save-load-save-current').click();
      ok(await page.getByTestId('save-load-load-0').count() === 1, 'saved scenario row missing');

      await page.getByTestId('scenario-retire-debt').click();
      await page.getByTestId('save-load-update-0').click();
      await page.getByTestId('save-load-load-0').click();
      ok((await page.getByTestId('scenario-retire-debt').getAttribute('aria-checked')) === 'true', 'load did not restore updated scenario state');

      await page.getByTestId('save-load-compare-0').click();
      ok(await page.getByTestId('comparison-banner').count() === 1, 'compare banner did not open');
      await page.getByTestId('save-load-compare-0').click();
      ok(await page.getByTestId('comparison-banner').count() === 0, 'compare banner did not toggle off');

      await page.getByTestId('save-load-delete-0').click();
      ok(await page.getByTestId('save-load-load-0').count() === 0, 'saved scenario row did not delete');
      return 'save, update, load, compare, and delete all worked';
    }));

    results.push(await runEntry('shell.comparison_banner.clear', async () => {
      await page.getByTestId('save-load-name').fill('Compare Target');
      await page.getByTestId('save-load-save-current').click();
      await page.getByTestId('save-load-compare-0').click();
      ok(await page.getByTestId('comparison-banner').count() === 1, 'comparison banner missing');
      await page.getByTestId('comparison-banner-clear').click();
      ok(await page.getByTestId('comparison-banner').count() === 0, 'comparison banner did not clear');
      return 'comparison banner cleared cleanly';
    }));

    results.push(await runEntry('shell.goal_panel.core', async () => {
      await page.getByTestId('goal-panel-toggle').click();
      await page.getByTestId('goal-panel-toggle').click();
      await page.getByTestId('goal-panel-add-toggle').click();
      await page.getByTestId('goal-form-name').fill('Swarm Goal');
      await page.getByTestId('goal-form-type').selectOption('net_worth_target');
      await page.getByTestId('goal-form-target-amount').fill('123456');
      await page.getByTestId('goal-form-target-month').fill('60');
      await page.getByTestId('goal-form-submit').click();
      ok(await page.locator('[data-testid^="goal-delete-"]').count() >= 1, 'goal card did not render');

      await page.getByTestId('save-load-name').fill('Goal Save');
      await page.getByTestId('save-load-save-current').click();
      const deleteButtons = page.locator('[data-testid^="goal-delete-"]');
      await deleteButtons.first().click();
      await page.getByTestId('save-load-load-1').click();
      ok(await page.locator('[data-testid^="goal-delete-"]').count() >= 1, 'goal state did not persist through save/load');
      return 'goal form, delete, and persistence all worked';
    }));

    results.push(await runEntry('shell.scenario_strip.core', async () => {
      await gotoApp(page);
      eq(await page.getByTestId('scenario-strip').getAttribute('data-layout'), 'desktop', 'scenario strip desktop layout flag');
      eq(await page.getByTestId('scenario-strip').getAttribute('data-order'), 'controls-first', 'scenario strip order flag');
      await expectVisibleText(page, 'Primary Levers');
      ok(await page.getByTestId('primary-levers-summary').count() === 1, 'primary levers summary did not render');

      await page.getByTestId('scenario-base-expenses').fill('45000');
      await page.getByTestId('scenario-retire-debt').click();
      await page.getByTestId('scenario-lifestyle-cuts').click();
      await page.getByTestId('scenario-total-cuts').fill('16500');
      await page.getByTestId('scenario-van-sold').click();
      await page.getByTestId('scenario-bcs-parents-annual').fill('41000');
      await expectVisibleText(page, 'We owe $0/mo');
      ok((await page.getByTestId('primary-levers-monthly-outflow').textContent()).includes('$31,097/mo'), 'primary levers outflow summary did not update');
      ok((await page.getByTestId('primary-levers-monthly-savings').textContent()).includes('$26,864/mo'), 'primary levers savings summary did not update');
      ok((await page.getByTestId('primary-levers-one-time-ask').textContent()).includes('$189,778'), 'primary levers one-time ask summary did not update');

      eq(await page.getByTestId('primary-levers-lever-spending_cuts').getAttribute('data-rank'), '1', 'spending cuts rank');
      eq(await page.getByTestId('primary-levers-lever-spending_cuts').getAttribute('data-impact'), '16500', 'spending cuts impact');
      eq(await page.getByTestId('primary-levers-lever-retire_debt').getAttribute('data-rank'), '2', 'retire debt rank');
      eq(await page.getByTestId('primary-levers-lever-sell_van').getAttribute('data-rank'), '3', 'sell van rank');
      eq(await page.getByTestId('primary-levers-lever-bcs_support').getAttribute('data-rank'), '4', 'BCS support rank');

      await page.getByTestId('primary-levers-breakdown-toggle').click();
      ok(await page.getByTestId('primary-levers-breakdown').count() === 1, 'primary levers breakdown did not open');
      await expectVisibleText(page, 'Debt retirement');
      await expectVisibleText(page, 'BCS support change');
      await expectVisibleText(page, 'No other one-time assumptions are active right now.');
      await page.getByTestId('scenario-reset-cuts-override').click();
      return 'primary levers summary, ranking, disclosure, and grouped consequences updated correctly';
    }));

    results.push(await runEntry('shell.compact_layout', async () => {
      await page.setViewportSize(VIEWPORTS.compact);
      await gotoApp(page);
      const appShell = page.getByTestId('app-shell');
      eq(await appShell.getAttribute('data-compact'), 'true', 'compact shell data flag');
      eq(await appShell.getAttribute('data-rail-placement'), 'below', 'compact rail placement');
      const primaryLevers = page.getByTestId('scenario-strip');
      eq(await primaryLevers.getAttribute('data-layout'), 'compact', 'primary levers compact layout flag');
      eq(await primaryLevers.getAttribute('data-order'), 'controls-first', 'primary levers compact order flag');
      const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      ok(noOverflow, 'compact shell introduced horizontal overflow');
      const orderOk = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="app-shell"]');
        const workspace = root?.querySelector('[data-testid="app-shell-workspace"]');
        const rail = root?.querySelector('[data-testid="app-shell-rail"]');
        if (!root || !workspace || !rail) return false;
        return Boolean(workspace.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      ok(orderOk, 'compact shell rail should follow the workspace in DOM order');
      const scenarioOrderOk = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="scenario-strip"]');
        const controls = root?.querySelector('[data-testid="primary-levers-controls-section"]');
        const rail = root?.querySelector('[data-testid="primary-levers-consequence-rail"]');
        if (!root || !controls || !rail) return false;
        return Boolean(controls.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      ok(scenarioOrderOk, 'primary levers consequence rail should stack below the controls in compact mode');
      await page.setViewportSize(VIEWPORTS.desktop);
      await gotoApp(page);
      return 'compact shell stacked correctly without overflow';
    }));

    ok(consoleIssues.length === 0, `console issues detected: ${consoleIssues.join(' | ')}`);
    return results;
  } finally {
    await closeSession(session);
  }
}

async function worker2() {
  const session = await createSession({ width: 1440, height: 2600 });
  const { page, consoleIssues } = session;
  const results = [];

  try {
    await gotoApp(page);

    results.push(await runEntry('overview.bridge_chart.observe', async () => {
      const geometry = await page.evaluate(() => {
        const endpoint = Array.from(document.querySelectorAll('svg text')).find((node) => /\/mo$/.test(node.textContent || ''));
        if (!endpoint) return null;
        const svg = endpoint.ownerSVGElement;
        const textRect = endpoint.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        return {
          insideSvg: textRect.right <= svgRect.right && textRect.left >= svgRect.left,
          label: endpoint.textContent,
        };
      });
      ok(geometry && geometry.insideSvg, 'bridge endpoint label is clipped');
      return geometry.label;
    }));

    await page.getByTestId('tab-plan').click();

    results.push(await runEntry('plan.monthly_cash_flow.hover', async () => {
      const surface = page.getByTestId('monthly-cash-flow-hover-surface');
      await hoverMidpoint(surface);
      const text = await surface.innerText();
      ok(/Q\d'\d{2}/.test(text), 'cash-flow hover tooltip did not appear');
      return 'cash-flow tooltip rendered';
    }));

    results.push(await runEntry('plan.income_controls.core', async () => {
      await page.getByLabel('Rate growth/yr').fill('8');
      await page.getByLabel('Current hourly rate').fill('220');
      await page.getByLabel('Current clients/day').fill('5');
      await expectVisibleText(page, 'Current gross/mo:');

      await page.getByTestId('income-ss-type-ss').click();
      await expectVisibleText(page, 'SS Retirement at 62');
      await page.getByTestId('income-ss-type-ssdi').click();
      await expectVisibleText(page, 'SSDI Back Pay');

      await page.getByTestId('income-chad-job').click();
      await expectVisibleText(page, 'Gross annual salary');
      await page.getByTestId('income-chad-job').click();

      await page.getByTestId('income-ssdi-denied').click();
      const consulting = page.getByLabel('Monthly consulting income');
      ok(await consulting.isDisabled(), 'consulting slider should be disabled under SSDI denied');
      await page.getByTestId('income-van-sold').click();
      await expectVisibleText(page, 'Expected sale price');
      return 'income controls updated correctly, including denied consulting disable';
    }));

    results.push(await runEntry('plan.expense_controls.core', async () => {
      await page.getByTestId('expense-cut-cutOliver').fill('4000');
      await page.getByTestId('expense-cut-cutMedical').fill('1500');
      await page.getByTestId('expense-add-milestone').click();
      const milestoneNames = page.locator('[data-testid^="expense-milestone-name-"]');
      const milestoneMonths = page.locator('[data-testid^="expense-milestone-month-"]');
      const milestoneSavings = page.locator('[data-testid^="expense-milestone-savings-"]');
      const milestoneDeletes = page.locator('[data-testid^="expense-milestone-delete-"]');
      await milestoneNames.last().fill('Swarm milestone');
      await milestoneMonths.last().fill('18');
      await milestoneSavings.last().fill('2500');
      await milestoneDeletes.last().click();
      await page.getByTestId('expense-mold-include').click();
      await page.getByTestId('expense-roof-include').click();
      await page.getByTestId('expense-other-projects-include').click();
      return 'expense controls, milestone lifecycle, and one-time toggles worked';
    }));

    ok(consoleIssues.length === 0, `console issues detected: ${consoleIssues.join(' | ')}`);
    return results;
  } finally {
    await closeSession(session);
  }
}

async function worker3() {
  const session = await createSession({ width: 1440, height: 2200 });
  const { page, consoleIssues } = session;
  const results = [];

  try {
    await gotoApp(page);
    await page.getByTestId('tab-income').click();

    results.push(await runEntry('income.msft_vesting.controls', async () => {
      const before = await page.getByTestId('msft-vesting-total-remaining').innerText();
      const footerBefore = await page.getByTestId('msft-vesting-footer').innerText();
      await page.getByLabel('MSFT annual price growth').fill('10');
      await page.waitForTimeout(120);
      const after = await page.getByTestId('msft-vesting-total-remaining').innerText();
      const footerAfter = await page.getByTestId('msft-vesting-footer').innerText();
      ok(before !== after, 'MSFT total remaining did not change');
      ok(footerBefore !== footerAfter, 'MSFT footer projection did not change');
      return `${before} -> ${after}`;
    }));

    results.push(await runEntry('income.sarah_practice.observe', async () => {
      const summaryBefore = await page.getByTestId('sarah-practice-summary').innerText();
      const subtitleBefore = await page.getByTestId('sarah-practice-subtitle').innerText();
      await page.getByTestId('tab-plan').click();
      await page.getByLabel('Current hourly rate').fill('220');
      await page.getByLabel('Rate growth/yr').fill('8');
      await page.getByLabel('Client growth/yr').fill('12');
      await page.getByTestId('tab-income').click();
      const summaryAfter = await page.getByTestId('sarah-practice-summary').innerText();
      const subtitleAfter = await page.getByTestId('sarah-practice-subtitle').innerText();
      ok(summaryBefore !== summaryAfter, 'Sarah practice summary did not update');
      ok(subtitleBefore !== subtitleAfter, 'Sarah practice subtitle did not update');
      return `${summaryBefore} -> ${summaryAfter}`;
    }));

    results.push(await runEntry('income.composition.hover', async () => {
      const surface = page.getByTestId('income-composition-hover-surface');
      await hoverMidpoint(surface);
      const text = await surface.innerText();
      ok(text.includes('Total income'), 'income composition tooltip missing');
      return 'composition tooltip rendered';
    }));

    ok(consoleIssues.length === 0, `console issues detected: ${consoleIssues.join(' | ')}`);
    return results;
  } finally {
    await closeSession(session);
  }
}

async function worker4() {
  const session = await createSession({ width: 1440, height: 2200 });
  const { page, consoleIssues } = session;
  const results = [];

  try {
    await gotoApp(page);
    await page.getByTestId('tab-risk').click();

    results.push(await runEntry('risk.monte_carlo.controls', async () => {
      ok(await page.getByTestId('risk-workflow-overview').count() === 1, 'risk workflow overview missing');
      await page.getByLabel('Investment volatility').fill('19');
      await page.getByLabel('Business growth uncertainty').fill('7');
      await page.getByLabel('MSFT price uncertainty').fill('21');
      await page.getByLabel('SSDI max delay').fill('11');
      await page.getByLabel('SSDI denial rate').fill('18');
      await page.getByLabel('Spending discipline uncertainty').fill('25');
      await page.getByLabel('Number of simulations').fill('400');
      await page.getByTestId('monte-carlo-run').click();
      await expectVisibleText(page, '400 randomized paths answering the solvency question');
      return 'deterministic Monte Carlo run completed';
    }));

    results.push(await runEntry('risk.monte_carlo.hover', async () => {
      const surface = page.getByTestId('monte-carlo-fan-chart-hover-surface');
      await hoverMidpoint(surface);
      const text = await surface.innerText();
      ok(text.includes('P50') && text.includes('Det'), 'Monte Carlo hover tooltip missing');
      return 'Monte Carlo tooltip rendered';
    }));

    results.push(await runEntry('risk.sequence_of_returns.controls', async () => {
      ok(await page.getByTestId('sequence-returns-summary').count() === 1, 'sequence summary strip missing');
      const before = await page.getByTestId('sequence-returns-narrative').innerText();
      await page.getByLabel('Bad year 1 return').fill('-35');
      await page.getByLabel('Bad year 2 return').fill('-25');
      await page.waitForTimeout(120);
      const after = await page.getByTestId('sequence-returns-narrative').innerText();
      ok(before !== after, 'sequence-of-returns narrative did not update');
      return 'sequence narrative updated';
    }));

    results.push(await runEntry('risk.savings_drawdown.instances', async () => {
      const railSurface = page.getByTestId('savings-drawdown-hover-surface-right-rail');
      await hoverMidpoint(railSurface);
      const railTooltip = page.getByTestId('savings-drawdown-tooltip-right-rail');
      await railTooltip.waitFor({ state: 'visible' });
      const railText = await railTooltip.innerText();
      ok(railText.trim().length > 0, 'right-rail savings tooltip missing');
      return 'shared rail savings chart rendered hover tooltip on the Risk tab';
    }));

    results.push(await runEntry('risk.net_worth.instances', async () => {
      const railSurface = page.getByTestId('net-worth-hover-surface-right-rail');
      await hoverMidpoint(railSurface);
      const railText = await railSurface.innerText();
      ok(railText.includes('Total'), 'right-rail net worth tooltip missing');
      return 'shared rail net-worth chart rendered hover tooltip on the Risk tab';
    }));

    ok(consoleIssues.length === 0, `console issues detected: ${consoleIssues.join(' | ')}`);
    return results;
  } finally {
    await closeSession(session);
  }
}

async function worker5() {
  const session = await createSession({ width: 1440, height: 2200 });
  const { page, consoleIssues } = session;
  const results = [];

  try {
    await gotoApp(page);
    await page.getByTestId('tab-plan').click();

    results.push(await runEntry('retirement.mode_and_help', async () => {
      await page.getByTestId('retirement-mode-adaptive_pwa').click();
      const adaptiveIdentity = await page.getByTestId('retirement-mode-identity').innerText();
      ok(adaptiveIdentity.includes('Adaptive PWA'), 'adaptive mode identity banner missing');
      await page.getByRole('button', { name: /Explain Retirement Mode/i }).click();
      await page.getByTestId('retirement-adaptive-pwa-intro-dismiss').click();
      await gotoApp(page, { reset: false });
      await page.getByTestId('tab-plan').click();
      await page.getByTestId('retirement-mode-adaptive_pwa').click();
      ok(await page.getByTestId('retirement-adaptive-pwa-intro').count() === 0, 'Adaptive PWA intro dismissal did not persist');
      const persistedIdentity = await page.getByTestId('retirement-mode-identity').innerText();
      ok(persistedIdentity.includes('Adaptive PWA'), 'adaptive identity banner should persist after reload');
      return 'mode toggle and help dismissal persisted';
    }));

    await gotoApp(page);
    await page.getByTestId('tab-plan').click();

    results.push(await runEntry('retirement.historical_controls', async () => {
      const before = await page.getByTestId('retirement-income-chart').innerText();
      await page.getByTestId('retirement-pool-draw-rate').press('ArrowRight');
      await page.getByTestId('retirement-equity-allocation').press('ArrowRight');
      await page.getByTestId('retirement-pool-floor').press('ArrowRight');
      await page.getByTestId('retirement-chad-passes-age').press('ArrowRight');
      await page.getByTestId('retirement-inheritance-sarah-age').press('ArrowRight');
      await page.getByTestId('retirement-inheritance-amount').press('Home');
      await page.getByTestId('retirement-max-depletion-gap').press('ArrowLeft');
      await page.waitForTimeout(120);
      const after = await page.getByTestId('retirement-income-chart').innerText();
      ok(before !== after, 'historical retirement controls did not update the surface');
      return 'historical retirement controls updated derived summaries';
    }));

    results.push(await runEntry('retirement.main_chart.hover', async () => {
      const chart = page.getByTestId('retirement-main-chart');
      await chart.hover({ position: { x: 420, y: 180 } });
      const text = await page.getByTestId('retirement-income-chart').innerText();
      ok(text.includes('Plan pool') || text.includes('Average path pool'), 'retirement main chart tooltip missing');
      return 'main chart tooltip rendered';
    }));

    results.push(await runEntry('retirement.pwa_controls', async () => {
      await page.getByTestId('retirement-mode-adaptive_pwa').click();
      const before = await page.getByTestId('retirement-income-chart').innerText();
      await page.getByTestId('retirement-bequest-target').press('ArrowRight');
      await page.getByTestId('retirement-pwa-strategy').selectOption('fixed_percentile');
      await page.getByTestId('retirement-pwa-target-percentile').press('ArrowRight');
      await page.getByTestId('retirement-pwa-strategy').selectOption('sticky_median');
      await page.getByTestId('retirement-pwa-tolerance-low').press('ArrowRight');
      await page.getByTestId('retirement-pwa-tolerance-high').press('ArrowLeft');
      await page.waitForTimeout(120);
      const after = await page.getByTestId('retirement-income-chart').innerText();
      ok(before !== after, 'PWA controls did not update the retirement surface');
      return 'PWA controls updated recommendation state';
    }));

    results.push(await runEntry('retirement.pwa_distribution.hover', async () => {
      const rect = page.locator('[data-testid="retirement-pwa-distribution-svg"] rect').first();
      await rect.hover();
      const text = await page.getByTestId('retirement-pwa-distribution-container').innerText();
      ok(text.includes('Frequency') && text.includes('Bequest target'), 'PWA distribution tooltip missing');
      return 'distribution tooltip rendered';
    }));

    results.push(await runEntry('retirement.decision_preview.observe', async () => {
      const preview = page.getByTestId('retirement-decision-preview');
      ok(await preview.count() === 1, 'decision preview missing');
      const before = await preview.innerText();
      ok(!/NaN|undefined|null/.test(before), 'decision preview contains invalid tokens');
      await page.getByTestId('retirement-bequest-target').press('ArrowRight');
      await page.waitForTimeout(120);
      const after = await preview.innerText();
      ok(before !== after, 'decision preview did not rerender after bequest change');
      return 'decision preview rerendered cleanly';
    }));

    ok(consoleIssues.length === 0, `console issues detected: ${consoleIssues.join(' | ')}`);
    return results;
  } finally {
    await closeSession(session);
  }
}

async function worker6() {
  const session = await createSession({ width: 1440, height: 2200 });
  const { page, consoleIssues } = session;
  const results = [];

  try {
    await gotoApp(page);

    results.push(await runEntry('details.summary_and_table.observe', async () => {
      await page.getByTestId('tab-details').click();
      ok(await page.getByTestId('summary-ask').count() === 1, 'summary ask card missing');
      ok(await page.getByTestId('summary-ask-next-lever').count() === 1, 'summary ask next-lever section missing');
      await expectVisibleText(page, 'Detailed Projections');
      const text = await page.locator('body').innerText();
      ok(!/NaN|undefined/.test(text), 'details surface contains invalid tokens');
      return 'details summary and table rendered coherently';
    }));

    results.push(await runEntry('sarah_mode.entry_exit_and_sliders', async () => {
      await page.getByTestId('header-enter-sarah-mode').click();
      ok(await page.getByTestId('sarah-mode-root').count() === 1, 'Sarah mode root missing');
      ok(await page.getByTestId('sarah-mode-hero').count() === 1, 'Sarah mode hero missing');
      await page.getByLabel('Your hourly rate').press('End');
      await page.getByLabel('Current clients/day').press('End');
      await expectVisibleText(page, '/mo');
      await page.getByTestId('sarah-mode-exit').click();
      ok(await page.getByTestId('header-enter-sarah-mode').count() === 1, 'did not exit Sarah mode');
      return 'Sarah mode entry, sliders, and exit worked';
    }));

    results.push(await runEntry('dad_mode.entry_exit_and_progression', async () => {
      await page.getByTestId('header-enter-dad-mode').click();
      ok(await page.getByTestId('dad-mode-root').count() === 1, 'Dad mode root missing');
      await page.getByTestId('dad-mode-next-act-1').click();
      await page.getByTestId('dad-mode-next-act-2').click();
      await expectVisibleText(page, 'Your contribution');
      return 'Dad mode progressed through all acts';
    }));

    results.push(await runEntry('dad_mode.support_controls', async () => {
      await page.getByTestId('dad-pay-off-debt').press('End');
      await page.getByTestId('dad-bcs-parents').press('End');
      await page.getByTestId('dad-mold-toggle').click();
      await page.getByTestId('dad-roof-toggle').click();
      await expectVisibleText(page, 'Fully covered');
      await page.getByTestId('dad-mode-exit').click();
      return 'Dad support controls updated derived support math';
    }));

    ok(consoleIssues.length === 0, `console issues detected: ${consoleIssues.join(' | ')}`);
    return results;
  } finally {
    await closeSession(session);
  }
}

async function expectVisibleText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
}

async function expectAria(locator, pattern, message) {
  const value = await locator.getAttribute('aria-label');
  ok(pattern.test(value || ''), message);
}

async function main() {
  const started = Date.now();
  const workerFns = {
    'worker-1': worker1,
    'worker-2': worker2,
    'worker-3': worker3,
    'worker-4': worker4,
    'worker-5': worker5,
    'worker-6': worker6,
  };

  const workerIds = manifest.workers.map((worker) => worker.id);
  const settled = await Promise.all(workerIds.map(async (workerId) => {
    try {
      const results = await workerFns[workerId]();
      return { workerId, results };
    } catch (error) {
      return {
        workerId,
        results: [{ id: `${workerId}.session`, status: 'fail', error: error instanceof Error ? error.message : String(error) }],
      };
    }
  }));

  let totalPass = 0;
  let totalFail = 0;
  for (const { workerId, results } of settled) {
    printWorkerSummary(workerId, results);
    totalPass += results.filter((result) => result.status === 'pass').length;
    totalFail += results.filter((result) => result.status === 'fail').length;
  }

  const durationSec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nUI swarm complete: ${totalPass} passed, ${totalFail} failed, ${totalPass + totalFail} total in ${durationSec}s`);

  if (totalFail > 0) {
    process.exitCode = 1;
  }
}

await main();
