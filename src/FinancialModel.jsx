import { useReducer, useMemo, useEffect } from "react";
import { DAYS_PER_MONTH } from './model/constants.js';
import { fmt, fmtFull } from './model/formatters.js';
import { getVestEvents, getTotalRemainingVesting } from './model/vesting.js';
import { computeProjection, findOperationalBreakevenIndex } from './model/projection.js';
import { runMonteCarlo, runDadMonteCarlo } from './model/monteCarlo.js';
import { exportModelData } from './model/exportData.js';
import { evaluateAllGoals } from './model/goalEvaluation.js';
import { INITIAL_STATE, MODEL_KEYS } from './state/initialState.js';
import { reducer } from './state/reducer.js';
import Header from './components/Header.jsx';
import SaveLoadPanel from './components/SaveLoadPanel.jsx';
import KeyMetrics from './components/KeyMetrics.jsx';
import ComparisonBanner from './components/ComparisonBanner.jsx';
import TabBar from './components/TabBar.jsx';
import ActiveTogglePills from './components/ActiveTogglePills.jsx';
import SavingsDrawdownChart from './charts/SavingsDrawdownChart.jsx';
import NetWorthChart from './charts/NetWorthChart.jsx';
import RetirementIncomeChart from './charts/RetirementIncomeChart.jsx';
import DadMode from './panels/DadMode.jsx';
import SarahMode from './panels/SarahMode.jsx';
import ScenarioStrip from './panels/ScenarioStrip.jsx';
import GoalPanel from './panels/GoalPanel.jsx';
import OverviewTab from './panels/tabs/OverviewTab.jsx';
import PlanTab from './panels/tabs/PlanTab.jsx';
import IncomeTab from './panels/tabs/IncomeTab.jsx';
import RiskTab from './panels/tabs/RiskTab.jsx';
import DetailsTab from './panels/tabs/DetailsTab.jsx';


export default function FinancialModel() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const set = (field) => (value) => {
    dispatch({ type: 'SET_FIELD', field, value });
    // If an individual cut changes, clear the macro override so detail takes over
    if (field.startsWith('cut') && field !== 'cutsOverride') {
      dispatch({ type: 'SET_FIELD', field: 'cutsOverride', value: null });
    }
  };

  const {
    sarahRate, sarahMaxRate, sarahRateGrowth, sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
    msftGrowth,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiPersonal, ssdiFamilyTotal, kidsAgeOutMonths, chadConsulting,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
    baseExpenses, debtService,
    bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft,
    lifestyleCutsApplied, cutsOverride,
    cutOliver, cutVacation, cutShopping, cutMedical, cutGym,
    cutAmazon, cutSaaS, cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth,
    milestones,
    retireDebt,
    startingSavings, investmentReturn,
    ssdiBackPayMonths,
    moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude,
    debtCC, debtPersonal, debtIRS, debtFirstmark,
    savedScenarios, scenarioName, showSaveLoad, presentMode,
    compareState, compareName,
    sarahMode,
    dadMode, dadStep, dadDebtPct, dadBcsParents, dadMold, dadRoof, dadProjects, dadMcResult, dadBaselineBalance,
    starting401k, return401k, homeEquity, homeAppreciation,
    mcResults, mcRunning, mcNumSims, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline,
    seqBadY1, seqBadY2,
    goals,
    storageStatus,
    activeTab,
  } = state;

  // Backward-compatible computed totals from individual cuts
  const lifestyleCuts = cutOliver + cutVacation + cutGym;
  const cutInHalf = cutMedical + cutShopping + cutSaaS;
  const extraCuts = cutAmazon + cutEntertainment + cutGroceries + cutPersonalCare + cutSmallItems;

  // Derived values
  const daysPerMonth = DAYS_PER_MONTH;
  const sarahCurrentNet = Math.round(sarahRate * sarahCurrentClients * daysPerMonth);
  const sarahCeiling = Math.round(sarahMaxRate * sarahMaxClients * daysPerMonth);
  const vestEvents = useMemo(() => getVestEvents(msftGrowth), [msftGrowth]);
  const totalRemainingVesting = useMemo(() => getTotalRemainingVesting(msftGrowth), [msftGrowth]);
  const bcsFamilyMonthly = Math.round(Math.max(0, bcsAnnualTotal - bcsParentsAnnual) / 12);
  const debtTotal = debtCC + debtPersonal + debtIRS + debtFirstmark;
  const oneTimeTotal = (moldInclude ? moldCost : 0) + (roofInclude ? roofCost : 0) + (otherInclude ? otherProjects : 0);
  const advanceNeeded = (retireDebt ? debtTotal : 0) + oneTimeTotal;
  const ssdiBackPayGross = ssdiBackPayMonths * ssdiPersonal;
  const ssdiAttorneyFee = Math.min(Math.round(ssdiBackPayGross * 0.25), 9200);

  const gatherState = () => {
    const s = {};
    for (const key of MODEL_KEYS) s[key] = state[key] ?? INITIAL_STATE[key];
    s.bcsFamilyMonthly = bcsFamilyMonthly;
    // If cutsOverride is set, use it as total cuts (split into lifestyleCuts, zero the rest)
    // Otherwise use the individual item sums
    const override = state.cutsOverride;
    if (override != null) {
      s.lifestyleCuts = override;
      s.cutInHalf = 0;
      s.extraCuts = 0;
    } else {
      s.lifestyleCuts = lifestyleCuts;
      s.cutInHalf = cutInHalf;
      s.extraCuts = extraCuts;
    }
    return s;
  };

  // Projections
  const projection = useMemo(() => computeProjection(gatherState()), [
    sarahRate, sarahMaxRate, sarahRateGrowth, sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
    msftGrowth,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiPersonal, ssdiFamilyTotal, kidsAgeOutMonths, chadConsulting,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
    baseExpenses, debtService, bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, milestones,
    lifestyleCutsApplied, cutsOverride,
    cutOliver, cutVacation, cutShopping, cutMedical, cutGym,
    cutAmazon, cutSaaS, cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth,
    retireDebt,
    startingSavings, investmentReturn, ssdiBackPayMonths,
    moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude,
    debtCC, debtPersonal, debtIRS, debtFirstmark,
    starting401k, return401k,
    homeEquity, homeAppreciation,
  ]);
  const data = projection.data;
  const savingsData = projection.savingsData;
  const monthlyDetail = projection.monthlyData;
  const ssdiBackPayActual = projection.backPayActual;

  // wealthData assembled from monthlyDetail (401k + home equity now both in main simulation)
  const wealthData = useMemo(() =>
    monthlyDetail.map(d => ({
      month: d.month,
      balance401k: d.balance401k,
      homeEquity: d.homeEquity,
    })),
    [monthlyDetail]
  );

  const goalResults = useMemo(() => {
    if (!goals || goals.length === 0) return [];
    return evaluateAllGoals(goals, monthlyDetail, { wealthData, retireDebt });
  }, [goals, monthlyDetail, wealthData, retireDebt]);

  const compareProjection = useMemo(() => {
    if (!compareState) return null;
    return computeProjection(compareState);
  }, [compareState]);

  // Scenario persistence
  const restoreState = (s) => {
    if (!s) return;
    dispatch({ type: 'RESTORE_STATE', state: s });
  };

  const storageAvailable = typeof window !== "undefined" && window.storage && typeof window.storage.set === "function";

  useEffect(() => {
    if (!storageAvailable) {
      set('storageStatus')("no-storage");
      return;
    }
    (async () => {
      try {
        const result = await window.storage.get("fin-scenarios");
        if (result && result.value) {
          const parsed = JSON.parse(result.value);
          if (Array.isArray(parsed)) {
            set('savedScenarios')(parsed);
            set('storageStatus')(`loaded-${parsed.length}`);
          }
        }
      } catch (e) {
        set('storageStatus')("empty");
      }
    })();
  }, []);

  const saveScenario = async (name) => {
    if (!name.trim()) return;
    const st = gatherState();
    const entry = { name: name.trim(), state: st, savedAt: new Date().toISOString() };
    const updated = [...savedScenarios.filter(s => s.name !== name.trim()), entry];
    set('savedScenarios')(updated);
    set('scenarioName')("");
    if (!storageAvailable) { set('storageStatus')("no-storage"); return; }
    try {
      const val = JSON.stringify(updated);
      const result = await window.storage.set("fin-scenarios", val);
      if (result) {
        set('storageStatus')("saved");
        setTimeout(() => set('storageStatus')(""), 3000);
      } else {
        set('storageStatus')("set-returned-null");
      }
    } catch (e) {
      set('storageStatus')("error: " + e.message);
    }
  };

  const deleteScenario = async (name) => {
    const updated = savedScenarios.filter(s => s.name !== name);
    set('savedScenarios')(updated);
    if (storageAvailable) {
      try { await window.storage.set("fin-scenarios", JSON.stringify(updated)); } catch (e) { /* */ }
    }
  };

  // Monte Carlo
  const handleRunMonteCarlo = () => {
    set('mcRunning')(true);
    setTimeout(() => {
      const base = gatherState();
      const mcParams = { mcNumSims, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline };
      const mcSeed = typeof window !== 'undefined' && window.__FIN_MODEL_TEST__ && typeof window.__FIN_MODEL_TEST__.getMonteCarloSeed === 'function'
        ? window.__FIN_MODEL_TEST__.getMonteCarloSeed()
        : null;
      const results = runMonteCarlo(base, mcParams, goals, { seed: mcSeed });
      set('mcResults')(results);
      set('mcRunning')(false);
    }, 50);
  };

  // Savings zero-crossing
  const savingsZeroMonth = savingsData.find(d => d.balance <= 0);
  const savingsZeroLabel = savingsZeroMonth ? `~${Math.round(savingsZeroMonth.month)} months` : "6+ years";

  // Dad Mode
  const enterDadMode = () => {
    const baseState = {
      ...gatherState(),
      retireDebt: false,
      debtService: debtService,
      bcsParentsAnnual: 25000,
      bcsFamilyMonthly: Math.round(Math.max(0, bcsAnnualTotal - 25000) / 12),
      lifestyleCutsApplied: false,
      vanSold: false,
    };
    const baseline = computeProjection(baseState);
    dispatch({ type: 'RESTORE_STATE', state: {
      dadBaselineBalance: baseline.savingsData,
      dadDebtPct: 0, dadBcsParents: 25000,
      dadMold: false, dadRoof: false, dadProjects: false,
      dadStep: 1, dadMcResult: null, dadMode: true,
    }});
  };

  const dadSupportState = useMemo(() => {
    if (!dadMode) return null;
    return {
      ...gatherState(),
      vanSold: true, lifestyleCutsApplied: true,
      retireDebt: false,
      debtService: Math.round(debtService * (1 - dadDebtPct / 100)),
      bcsParentsAnnual: dadBcsParents,
      bcsFamilyMonthly: Math.round(Math.max(0, bcsAnnualTotal - dadBcsParents) / 12),
      moldInclude: dadMold, roofInclude: dadRoof, otherInclude: dadProjects,
    };
  }, [dadMode, dadDebtPct, dadBcsParents, dadMold, dadRoof, dadProjects,
      sarahRate, sarahMaxRate, sarahRateGrowth, sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
      msftGrowth, ssType, ssdiApprovalMonth, ssdiDenied, ssdiPersonal, ssdiFamilyTotal,
      ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths, kidsAgeOutMonths, chadConsulting,
      chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
      baseExpenses, debtService, bcsAnnualTotal, bcsYearsLeft,
      cutOliver, cutVacation, cutShopping, cutMedical, cutGym, cutAmazon, cutSaaS, cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
      trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
      vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth, startingSavings, investmentReturn, ssdiBackPayMonths,
      moldCost, roofCost, otherProjects, debtCC, debtPersonal, debtIRS, debtFirstmark, milestones, bcsFamilyMonthly]);

  const dadProjection = useMemo(() => {
    if (!dadSupportState) return null;
    return computeProjection(dadSupportState);
  }, [dadSupportState]);

  const dadMcRun = useMemo(() => {
    if (!dadSupportState || dadStep < 3) return null;
    return runDadMonteCarlo(dadSupportState);
  }, [dadSupportState, dadStep]);

  // Raw monthly gap — no toggles, no returns. Matches waterfall "Today" bar.
  const currentMsft = data[0]?.msftVesting || 0;
  const chadJobImmediate = chadJob && (chadJobStartMonth ?? 3) === 0;
  const chadJobNetForGap = chadJobImmediate ? Math.round((chadJobSalary || 80000) * (1 - (chadJobTaxRate || 25) / 100) / 12) : 0;
  const chadJobHealthForGap = chadJobImmediate ? (chadJobHealthSavings || 4200) : 0;
  const rawMonthlyGap = (sarahCurrentNet + currentMsft + trustIncomeNow + chadJobNetForGap)
    - Math.max(baseExpenses + debtService + vanMonthlySavings + bcsFamilyMonthly - chadJobHealthForGap, 0);

  // Steady state net at Y3
  const steadyIdxRaw = data.findIndex(d => d.month >= 36);
  const steadyIdx = steadyIdxRaw >= 0 ? steadyIdxRaw : data.length - 1;
  const steadyStateNet = data[steadyIdx]?.netMonthly || data[data.length - 1].netMonthly;

  const mcGoalResults = mcResults?.goalSuccessRates || null;

  // Export handler
  const handleExportJSON = () => {
    exportModelData(gatherState(), projection, vestEvents, totalRemainingVesting, {
      rawMonthlyGap, sarahCurrentNet, advanceNeeded, ssdiDenied, lifestyleCutsApplied,
      cutOliver, cutVacation, cutShopping, cutMedical, cutGym, cutAmazon, cutSaaS,
      cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
      lifestyleCuts, cutInHalf, extraCuts, goalResults,
    });
  };

  // Chart helpers
  const minNet = Math.min(...data.map(d => d.netMonthly));
  const maxNet = Math.max(...data.map(d => d.netMonthly));
  const maxVesting = Math.max(...data.map(d => d.msftVesting));
  const chartH = 380;
  const netRange = Math.max(Math.abs(minNet), Math.abs(maxNet)) || 1;

  const breakevenIdx = findOperationalBreakevenIndex(data);
  const bestIdx = data.reduce((bestI, d, i) => d.netMonthly > data[bestI].netMonthly ? i : bestI, 0);
  const highlightIdx = breakevenIdx >= 0 ? breakevenIdx : bestIdx;
  const highlightLabel = breakevenIdx >= 0 ? "BREAKEVEN" : "BEST";
  const breakevenLabel = breakevenIdx >= 0 ? data[breakevenIdx].label : `Best: ${fmt(data[bestIdx].netMonthly)} at ${data[bestIdx].label}`;

  // === PROP BUNDLES for tab components ===
  const bridgeProps = {
    monthlyDetail, data,
    sarahCurrentNet, sarahRate, sarahMaxRate, sarahRateGrowth,
    sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
    retireDebt, vanSold, lifestyleCutsApplied,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiFamilyTotal, chadConsulting,
    ssFamilyTotal, ssStartMonth,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    milestones, bcsYearsLeft, bcsFamilyMonthly,
    baseExpenses, debtService, vanMonthlySavings,
    lifestyleCuts, cutInHalf, extraCuts,
    startingSavings, investmentReturn, msftGrowth,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
  };

  const timelineProps = {
    retireDebt, debtService,
    ssType, ssdiApprovalMonth, ssdiFamilyTotal,
    ssdiPersonal, ssdiBackPayActual,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    chadConsulting, milestones,
    bcsYearsLeft, bcsFamilyMonthly,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings,
    kidsAgeOutMonths, msftGrowth,
    currentMsftVesting: data[0].msftVesting,
  };

  const scenarioStripProps = {
    retireDebt, lifestyleCutsApplied, cutsOverride,
    lifestyleCuts, cutInHalf, extraCuts,
    debtTotal, debtService,
    baseExpenses, currentExpenses: data[0].expenses,
    vanSold, vanMonthlySavings,
    bcsAnnualTotal, bcsParentsAnnual,
    bcsYearsLeft, bcsFamilyMonthly,
    moldCost, moldInclude,
    roofCost, roofInclude,
    otherProjects, otherInclude,
    advanceNeeded,
    onFieldChange: set,
  };

  const cashFlowProps = {
    data, chartH, netRange,
    minNet, maxNet, maxVesting,
    highlightIdx, highlightLabel,
    ssType, ssdiApprovalMonth, ssdiFamilyTotal,
    msftGrowth,
  };

  const incomeControlsProps = {
    sarahRate, sarahMaxRate, sarahRateGrowth,
    sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
    sarahCurrentNet, sarahCeiling,
    ssType, ssdiDenied,
    ssdiFamilyTotal, ssdiPersonal, kidsAgeOutMonths,
    ssdiApprovalMonth, ssdiBackPayMonths,
    ssdiBackPayGross, ssdiAttorneyFee, ssdiBackPayActual,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    chadConsulting,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth,
    onFieldChange: set,
  };

  const expenseControlsProps = {
    baseExpenses, debtService,
    debtCC, debtPersonal, debtIRS, debtFirstmark, debtTotal,
    retireDebt, lifestyleCutsApplied,
    cutOliver, cutVacation, cutShopping,
    cutMedical, cutGym, cutAmazon, cutSaaS,
    cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
    lifestyleCuts, cutInHalf, extraCuts,
    bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
    vanSold, vanMonthlySavings,
    milestones,
    moldCost, moldInclude, roofCost, roofInclude,
    otherProjects, otherInclude,
    onFieldChange: set,
  };

  const monteCarloProps = {
    mcResults, mcRunning,
    mcNumSims, mcInvestVol, mcBizGrowthVol,
    mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline,
    onParamChange: set, onRun: handleRunMonteCarlo,
    savingsData, presentMode,
    gatherState,
    mcParams: { mcNumSims, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline },
  };

  const seqReturnsProps = {
    seqBadY1, seqBadY2,
    onParamChange: set,
    startingSavings, investmentReturn,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiBackPayActual,
    ssStartMonth, ssKidsAgeOutMonths,
    monthlyDetail, presentMode,
  };

  const savingsDrawdownProps = {
    savingsData, savingsZeroMonth, savingsZeroLabel,
    compareProjection, compareName,
    data, startingSavings, investmentReturn,
    debtCC, debtPersonal, debtIRS, debtFirstmark,
    debtService, ssdiApprovalMonth, ssdiBackPayActual,
    milestones, retireDebt, presentMode,
    onFieldChange: set, baseExpenses,
  };

  const netWorthProps = {
    savingsData, wealthData,
    starting401k, return401k,
    homeEquity, homeAppreciation,
    presentMode, onFieldChange: set,
  };

  const dataTableProps = { data };

  const summaryAskProps = {
    totalRemainingVesting, data, startingSavings,
    savingsZeroMonth, savingsZeroLabel,
    ssdiApprovalMonth, ssdiBackPayActual, ssdiBackPayMonths,
    retireDebt, debtTotal, debtService,
    moldInclude, moldCost, roofInclude, roofCost,
    otherInclude, otherProjects,
    bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
    advanceNeeded, breakevenIdx,
  };

  // Present mode locks to overview, hides tab bar
  const effectiveTab = presentMode ? "overview" : (activeTab || "overview");

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, sans-serif",
      background: "#0f172a",
      color: "#e2e8f0",
      minHeight: "100vh",
      padding: "24px 16px"
    }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <Header
          presentMode={presentMode}
          onTogglePresentMode={() => set('presentMode')(!presentMode)}
          onEnterDadMode={enterDadMode}
          onEnterSarahMode={() => set('sarahMode')(true)}
          showSaveLoad={showSaveLoad}
          onToggleSaveLoad={() => set('showSaveLoad')(!showSaveLoad)}
          savedScenarios={savedScenarios}
          onReset={() => dispatch({ type: 'RESET_ALL' })}
          onExportJSON={handleExportJSON}
        />

        {!presentMode && (
          <SaveLoadPanel
            showSaveLoad={showSaveLoad}
            savedScenarios={savedScenarios}
            scenarioName={scenarioName}
            onScenarioNameChange={set('scenarioName')}
            onSave={saveScenario}
            onLoad={(s) => { restoreState(s.state); set('scenarioName')(s.name); }}
            onCompare={(name, st) => {
              if (compareState && compareName === name) { set('compareState')(null); set('compareName')(""); }
              else { set('compareState')(st); set('compareName')(name); }
            }}
            compareName={compareName}
            onClearCompare={() => { set('compareState')(null); set('compareName')(""); }}
            onDelete={deleteScenario}
            storageStatus={storageStatus}
            storageAvailable={storageAvailable}
          />
        )}

        {sarahMode && !dadMode && (
          <SarahMode
            ssType={ssType}
            sarahRate={sarahRate} sarahMaxRate={sarahMaxRate} sarahRateGrowth={sarahRateGrowth}
            sarahCurrentClients={sarahCurrentClients} sarahMaxClients={sarahMaxClients} sarahClientGrowth={sarahClientGrowth}
            lifestyleCutsApplied={lifestyleCutsApplied}
            cutOliver={cutOliver} cutVacation={cutVacation} cutShopping={cutShopping}
            cutMedical={cutMedical} cutGym={cutGym} cutAmazon={cutAmazon} cutSaaS={cutSaaS}
            cutEntertainment={cutEntertainment} cutGroceries={cutGroceries} cutPersonalCare={cutPersonalCare} cutSmallItems={cutSmallItems}
            mcResults={mcResults} goalResults={goalResults} goals={goals}
            startingSavings={startingSavings} starting401k={starting401k} homeEquity={homeEquity}
            monthlyDetail={monthlyDetail} savingsData={savingsData} wealthData={wealthData}
            onFieldChange={set}
            onExit={() => set('sarahMode')(false)}
          />
        )}

        {dadMode && (
          <DadMode
            dadMode={dadMode} dadStep={dadStep} dadDebtPct={dadDebtPct}
            dadBcsParents={dadBcsParents} dadMold={dadMold} dadRoof={dadRoof}
            dadProjects={dadProjects} dadMcResult={dadMcRun} dadBaselineBalance={dadBaselineBalance}
            dadProjection={dadProjection}
            data={data} savingsData={savingsData}
            debtTotal={debtTotal} debtService={debtService}
            debtCC={debtCC} debtPersonal={debtPersonal} debtIRS={debtIRS}
            bcsAnnualTotal={bcsAnnualTotal} bcsYearsLeft={bcsYearsLeft}
            vanSold={vanSold} vanMonthlySavings={vanMonthlySavings}
            lifestyleCutsApplied={lifestyleCutsApplied} lifestyleCuts={lifestyleCuts}
            cutInHalf={cutInHalf} extraCuts={extraCuts}
            cutOliver={cutOliver} cutVacation={cutVacation} cutShopping={cutShopping}
            cutMedical={cutMedical} cutGym={cutGym} cutAmazon={cutAmazon} cutSaaS={cutSaaS}
            cutEntertainment={cutEntertainment} cutGroceries={cutGroceries} cutPersonalCare={cutPersonalCare} cutSmallItems={cutSmallItems}
            bcsFamilyMonthly={bcsFamilyMonthly} retireDebt={retireDebt}
            moldCost={moldCost} roofCost={roofCost} otherProjects={otherProjects}
            startingSavings={startingSavings}
            sarahMaxRate={sarahMaxRate} sarahMaxClients={sarahMaxClients}
            ssdiFamilyTotal={ssdiFamilyTotal} ssdiBackPayActual={ssdiBackPayActual}
            chadConsulting={chadConsulting}
            savingsZeroMonth={savingsZeroMonth}
            onFieldChange={set}
          />
        )}

        {!dadMode && !sarahMode && <>
          <KeyMetrics
            netMonthly={data[0].netMonthly}
            breakevenLabel={breakevenLabel}
            breakevenIdx={breakevenIdx}
            savingsZeroLabel={savingsZeroLabel}
            savingsZeroMonth={savingsZeroMonth}
            advanceNeeded={advanceNeeded}
            mcResults={mcResults}
            rawMonthlyGap={rawMonthlyGap}
            steadyStateNet={steadyStateNet}
            steadyLabel={data[steadyIdx]?.label}
          />

          <ActiveTogglePills
            retireDebt={retireDebt}
            lifestyleCutsApplied={lifestyleCutsApplied}
            vanSold={vanSold}
            debtService={debtService}
            totalCuts={lifestyleCuts + cutInHalf + extraCuts}
          />

          {!presentMode && (
            <ScenarioStrip {...scenarioStripProps} />
          )}

          <ComparisonBanner
            compareState={compareState}
            compareName={compareName}
            onClearCompare={() => { set('compareState')(null); set('compareName')(""); }}
          />

          {!presentMode && (
            <TabBar activeTab={effectiveTab} onChange={set('activeTab')} />
          )}

          <GoalPanel
            goals={goals} goalResults={goalResults} mcGoalResults={mcGoalResults}
            mcRunning={mcRunning} presentMode={presentMode}
            onGoalsChange={(newGoals) => set('goals')(newGoals)}
          />

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(580px, 660px)", gap: 24, alignItems: "start" }}>
            {/* Left column: Tab content */}
            <div style={{ minWidth: 0 }}>
              {effectiveTab === "overview" && (
                <OverviewTab bridgeProps={bridgeProps} />
              )}

              {effectiveTab === "plan" && (
                <PlanTab
                  bridgeProps={bridgeProps}
                  cashFlowProps={cashFlowProps}
                  incomeControlsProps={incomeControlsProps}
                  expenseControlsProps={expenseControlsProps}
                  presentMode={presentMode}
                />
              )}

              {effectiveTab === "income" && (
                <IncomeTab
                  vestEvents={vestEvents} totalRemainingVesting={totalRemainingVesting}
                  msftGrowth={msftGrowth} onMsftGrowthChange={set('msftGrowth')}
                  sarahRate={sarahRate} sarahMaxRate={sarahMaxRate} sarahRateGrowth={sarahRateGrowth}
                  sarahCurrentClients={sarahCurrentClients} sarahMaxClients={sarahMaxClients} sarahClientGrowth={sarahClientGrowth}
                  data={data} investmentReturn={investmentReturn}
                  vanSold={vanSold} vanSaleMonth={vanSaleMonth} vanMonthlySavings={vanMonthlySavings}
                  bcsYearsLeft={bcsYearsLeft} milestones={milestones}
                />
              )}

              {effectiveTab === "risk" && (
                <RiskTab
                  monteCarloProps={monteCarloProps}
                  seqReturnsProps={seqReturnsProps}
                  savingsDrawdownProps={{ ...savingsDrawdownProps, instanceId: 'risk-tab' }}
                  netWorthProps={{ ...netWorthProps, instanceId: 'risk-tab' }}
                />
              )}

              {effectiveTab === "details" && (
                <DetailsTab
                  dataTableProps={dataTableProps}
                  summaryAskProps={summaryAskProps}
                  presentMode={presentMode}
                />
              )}
            </div>

            {/* Right column: Key charts — always visible, sticky */}
            <div style={{ position: "sticky", top: 16, alignSelf: "start" }}>
              <SavingsDrawdownChart {...savingsDrawdownProps} instanceId={effectiveTab === 'risk' ? 'right-rail' : 'shared-rail'} />
              <NetWorthChart {...netWorthProps} instanceId={effectiveTab === 'risk' ? 'right-rail' : 'shared-rail'} />
              <RetirementIncomeChart
                savingsData={savingsData} wealthData={wealthData}
                ssType={ssType} ssPersonal={ssPersonal}
                chadJob={chadJob}
                trustIncomeFuture={trustIncomeFuture}
              />
            </div>
          </div>
        </>}
      </div>
    </div>
  );
}
