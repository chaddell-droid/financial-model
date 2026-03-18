import { useReducer, useMemo, useEffect } from "react";
import { DAYS_PER_MONTH } from './model/constants.js';
import { fmt, fmtFull } from './model/formatters.js';
import { getVestEvents, getTotalRemainingVesting } from './model/vesting.js';
import { computeProjection, computeWealthProjection } from './model/projection.js';
import { runMonteCarlo, runDadMonteCarlo } from './model/monteCarlo.js';
import { exportModelData } from './model/exportData.js';
import { evaluateAllGoals } from './model/goalEvaluation.js';
import { INITIAL_STATE, MODEL_KEYS } from './state/initialState.js';
import { reducer } from './state/reducer.js';
import Header from './components/Header.jsx';
import SaveLoadPanel from './components/SaveLoadPanel.jsx';
import KeyMetrics from './components/KeyMetrics.jsx';
import ComparisonBanner from './components/ComparisonBanner.jsx';
import MsftVestingChart from './charts/MsftVestingChart.jsx';
import BridgeChart from './charts/BridgeChart.jsx';
import SavingsDrawdownChart from './charts/SavingsDrawdownChart.jsx';
import MonteCarloPanel from './charts/MonteCarloPanel.jsx';
import NetWorthChart from './charts/NetWorthChart.jsx';
import SequenceOfReturnsChart from './charts/SequenceOfReturnsChart.jsx';
import TimelineChart from './charts/TimelineChart.jsx';
import SarahPracticeChart from './charts/SarahPracticeChart.jsx';
import IncomeCompositionChart from './charts/IncomeCompositionChart.jsx';
import MonthlyCashFlowChart from './charts/MonthlyCashFlowChart.jsx';
import GoalPanel from './panels/GoalPanel.jsx';
import DadMode from './panels/DadMode.jsx';
import SarahMode from './panels/SarahMode.jsx';
import ScenarioStrip from './panels/ScenarioStrip.jsx';
import IncomeControls from './panels/IncomeControls.jsx';
import ExpenseControls from './panels/ExpenseControls.jsx';
import DataTable from './panels/DataTable.jsx';
import SummaryAsk from './panels/SummaryAsk.jsx';


export default function FinancialModel() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const set = (field) => (value) => dispatch({ type: 'SET_FIELD', field, value });

  const {
    sarahRate, sarahMaxRate, sarahRateGrowth, sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
    llcAnnual, llcMultiplier, llcDelayMonths, msftGrowth,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiPersonal, ssdiFamilyTotal, kidsAgeOutMonths, chadConsulting,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    baseExpenses, debtService,
    bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft,
    lifestyleCutsApplied,
    cutOliver, cutVacation, cutShopping, cutMedical, cutGym,
    cutAmazon, cutSaaS, cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings,
    milestones,
    retireDebt, llcImproves,
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
    for (const key of MODEL_KEYS) s[key] = state[key];
    s.bcsFamilyMonthly = bcsFamilyMonthly;
    // Add computed aggregate cuts for projection compatibility
    s.lifestyleCuts = lifestyleCuts;
    s.cutInHalf = cutInHalf;
    s.extraCuts = extraCuts;
    return s;
  };

  // Projections
  const projection = useMemo(() => computeProjection(gatherState()), [
    sarahRate, sarahMaxRate, sarahRateGrowth, sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
    llcAnnual, llcMultiplier, llcDelayMonths, msftGrowth,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiPersonal, ssdiFamilyTotal, kidsAgeOutMonths, chadConsulting,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    baseExpenses, debtService, bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, milestones,
    lifestyleCutsApplied,
    cutOliver, cutVacation, cutShopping, cutMedical, cutGym,
    cutAmazon, cutSaaS, cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings,
    retireDebt, llcImproves,
    startingSavings, investmentReturn, ssdiBackPayMonths,
    moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude,
    debtCC, debtPersonal, debtIRS, debtFirstmark
  ]);
  const data = projection.data;
  const savingsData = projection.savingsData;
  const monthlyDetail = projection.monthlyData;
  const ssdiBackPayActual = projection.backPayActual;

  const wealthProjection = useMemo(() => computeWealthProjection({ starting401k, return401k, homeEquity, homeAppreciation }), [starting401k, return401k, homeEquity, homeAppreciation]);
  const wealthData = wealthProjection.wealthData;

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
      const results = runMonteCarlo(base, mcParams, goals);
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
      llcAnnual, llcMultiplier, llcDelayMonths, msftGrowth, ssType, ssdiApprovalMonth, ssdiDenied, ssdiPersonal, ssdiFamilyTotal,
      ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths, kidsAgeOutMonths, chadConsulting, baseExpenses, debtService, bcsAnnualTotal, bcsYearsLeft,
      cutOliver, cutVacation, cutShopping, cutMedical, cutGym, cutAmazon, cutSaaS, cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
      trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
      vanMonthlySavings, startingSavings, investmentReturn, ssdiBackPayMonths,
      moldCost, roofCost, otherProjects, debtCC, debtPersonal, debtIRS, milestones, bcsFamilyMonthly]);

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
  const rawMonthlyGap = (sarahCurrentNet + currentMsft + Math.round(llcAnnual / 12))
    - Math.max(baseExpenses + debtService + vanMonthlySavings + bcsFamilyMonthly, 0);

  // Steady state net at Y3
  const steadyIdx = data.findIndex(d => d.month >= 36) || data.length - 1;
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

  const breakevenIdx = data.findIndex(d => d.netMonthly >= 0);
  const bestIdx = data.reduce((bestI, d, i) => d.netMonthly > data[bestI].netMonthly ? i : bestI, 0);
  const highlightIdx = breakevenIdx >= 0 ? breakevenIdx : bestIdx;
  const highlightLabel = breakevenIdx >= 0 ? "BREAKEVEN" : "BEST";
  const breakevenLabel = breakevenIdx >= 0 ? data[breakevenIdx].label : `Best: ${fmt(data[bestIdx].netMonthly)} at ${data[bestIdx].label}`;

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, sans-serif",
      background: "#0f172a",
      color: "#e2e8f0",
      minHeight: "100vh",
      padding: "24px 16px"
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
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

          <GoalPanel
            goals={goals}
            goalResults={goalResults}
            mcGoalResults={mcGoalResults}
            mcRunning={mcRunning}
            presentMode={presentMode}
            onGoalsChange={(newGoals) => set('goals')(newGoals)}
          />

          <ComparisonBanner
            compareState={compareState}
            compareName={compareName}
            onClearCompare={() => { set('compareState')(null); set('compareName')(""); }}
          />

          {!presentMode && <>
            <MsftVestingChart
              vestEvents={vestEvents}
              totalRemainingVesting={totalRemainingVesting}
              msftGrowth={msftGrowth}
              onMsftGrowthChange={set('msftGrowth')}
            />

            <ScenarioStrip
              retireDebt={retireDebt} lifestyleCutsApplied={lifestyleCutsApplied} llcImproves={llcImproves}
              lifestyleCuts={lifestyleCuts} cutInHalf={cutInHalf} extraCuts={extraCuts}
              debtTotal={debtTotal} debtService={debtService}
              bcsAnnualTotal={bcsAnnualTotal} bcsParentsAnnual={bcsParentsAnnual}
              bcsYearsLeft={bcsYearsLeft} bcsFamilyMonthly={bcsFamilyMonthly}
              moldCost={moldCost} moldInclude={moldInclude}
              roofCost={roofCost} roofInclude={roofInclude}
              otherProjects={otherProjects} otherInclude={otherInclude}
              advanceNeeded={advanceNeeded}
              onFieldChange={set}
            />
          </>}

          <BridgeChart
            monthlyDetail={monthlyDetail} data={data}
            sarahCurrentNet={sarahCurrentNet} sarahRate={sarahRate} sarahMaxRate={sarahMaxRate} sarahRateGrowth={sarahRateGrowth}
            sarahCurrentClients={sarahCurrentClients} sarahMaxClients={sarahMaxClients} sarahClientGrowth={sarahClientGrowth}
            retireDebt={retireDebt} vanSold={vanSold} lifestyleCutsApplied={lifestyleCutsApplied}
            ssType={ssType} ssdiApprovalMonth={ssdiApprovalMonth} ssdiDenied={ssdiDenied} ssdiFamilyTotal={ssdiFamilyTotal} chadConsulting={chadConsulting}
            ssFamilyTotal={ssFamilyTotal} ssStartMonth={ssStartMonth}
            trustIncomeNow={trustIncomeNow} trustIncomeFuture={trustIncomeFuture} trustIncreaseMonth={trustIncreaseMonth}
            milestones={milestones} bcsYearsLeft={bcsYearsLeft} bcsFamilyMonthly={bcsFamilyMonthly}
            llcAnnual={llcAnnual} llcImproves={llcImproves} llcMultiplier={llcMultiplier}
            baseExpenses={baseExpenses} debtService={debtService} vanMonthlySavings={vanMonthlySavings}
            lifestyleCuts={lifestyleCuts} cutInHalf={cutInHalf} extraCuts={extraCuts}
            startingSavings={startingSavings} investmentReturn={investmentReturn} msftGrowth={msftGrowth}
          />

          <SavingsDrawdownChart
            savingsData={savingsData} savingsZeroMonth={savingsZeroMonth} savingsZeroLabel={savingsZeroLabel}
            compareProjection={compareProjection} compareName={compareName}
            data={data} startingSavings={startingSavings} investmentReturn={investmentReturn}
            debtCC={debtCC} debtPersonal={debtPersonal} debtIRS={debtIRS} debtFirstmark={debtFirstmark}
            debtService={debtService} ssdiApprovalMonth={ssdiApprovalMonth} ssdiBackPayActual={ssdiBackPayActual}
            milestones={milestones} retireDebt={retireDebt} presentMode={presentMode}
            onFieldChange={set} baseExpenses={baseExpenses}
          />

          <NetWorthChart
            savingsData={savingsData} wealthData={wealthData}
            starting401k={starting401k} return401k={return401k}
            homeEquity={homeEquity} homeAppreciation={homeAppreciation}
            presentMode={presentMode} onFieldChange={set}
          />

          <MonteCarloPanel
            mcResults={mcResults} mcRunning={mcRunning}
            mcNumSims={mcNumSims} mcInvestVol={mcInvestVol} mcBizGrowthVol={mcBizGrowthVol}
            mcMsftVol={mcMsftVol} mcSsdiDelay={mcSsdiDelay} mcSsdiDenialPct={mcSsdiDenialPct} mcCutsDiscipline={mcCutsDiscipline}
            onParamChange={set} onRun={handleRunMonteCarlo}
            savingsData={savingsData} presentMode={presentMode}
            gatherState={gatherState}
            mcParams={{ mcNumSims, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline }}
          />

          <SequenceOfReturnsChart
            seqBadY1={seqBadY1} seqBadY2={seqBadY2}
            onParamChange={set}
            startingSavings={startingSavings} investmentReturn={investmentReturn}
            ssType={ssType} ssdiApprovalMonth={ssdiApprovalMonth} ssdiDenied={ssdiDenied} ssdiBackPayActual={ssdiBackPayActual}
            ssStartMonth={ssStartMonth} ssKidsAgeOutMonths={ssKidsAgeOutMonths}
            monthlyDetail={monthlyDetail}
            presentMode={presentMode}
          />

          <TimelineChart
            retireDebt={retireDebt} debtService={debtService}
            ssType={ssType} ssdiApprovalMonth={ssdiApprovalMonth} ssdiFamilyTotal={ssdiFamilyTotal}
            ssdiPersonal={ssdiPersonal} ssdiBackPayActual={ssdiBackPayActual}
            ssFamilyTotal={ssFamilyTotal} ssPersonal={ssPersonal} ssStartMonth={ssStartMonth} ssKidsAgeOutMonths={ssKidsAgeOutMonths}
            chadConsulting={chadConsulting} milestones={milestones}
            bcsYearsLeft={bcsYearsLeft} bcsFamilyMonthly={bcsFamilyMonthly}
            llcImproves={llcImproves} llcDelayMonths={llcDelayMonths} llcAnnual={llcAnnual} llcMultiplier={llcMultiplier}
            trustIncomeNow={trustIncomeNow} trustIncomeFuture={trustIncomeFuture} trustIncreaseMonth={trustIncreaseMonth}
            vanSold={vanSold} vanMonthlySavings={vanMonthlySavings}
            kidsAgeOutMonths={kidsAgeOutMonths} msftGrowth={msftGrowth}
            currentMsftVesting={data[0].msftVesting}
          />

          <SarahPracticeChart
            sarahRate={sarahRate} sarahMaxRate={sarahMaxRate} sarahRateGrowth={sarahRateGrowth}
            sarahCurrentClients={sarahCurrentClients} sarahMaxClients={sarahMaxClients} sarahClientGrowth={sarahClientGrowth}
          />

          <IncomeCompositionChart data={data} investmentReturn={investmentReturn} />

          {!presentMode && (
            <MonthlyCashFlowChart
              data={data} chartH={chartH} netRange={netRange}
              minNet={minNet} maxNet={maxNet} maxVesting={maxVesting}
              highlightIdx={highlightIdx} highlightLabel={highlightLabel}
              ssType={ssType} ssdiApprovalMonth={ssdiApprovalMonth} ssdiFamilyTotal={ssdiFamilyTotal}
              msftGrowth={msftGrowth}
            />
          )}

          {!presentMode && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
              <IncomeControls
                sarahRate={sarahRate} sarahMaxRate={sarahMaxRate} sarahRateGrowth={sarahRateGrowth}
                sarahCurrentClients={sarahCurrentClients} sarahMaxClients={sarahMaxClients} sarahClientGrowth={sarahClientGrowth}
                sarahCurrentNet={sarahCurrentNet} sarahCeiling={sarahCeiling}
                ssType={ssType}
                ssdiDenied={ssdiDenied}
                ssdiFamilyTotal={ssdiFamilyTotal} ssdiPersonal={ssdiPersonal} kidsAgeOutMonths={kidsAgeOutMonths}
                ssdiApprovalMonth={ssdiApprovalMonth} ssdiBackPayMonths={ssdiBackPayMonths}
                ssdiBackPayGross={ssdiBackPayGross} ssdiAttorneyFee={ssdiAttorneyFee} ssdiBackPayActual={ssdiBackPayActual}
                ssFamilyTotal={ssFamilyTotal} ssPersonal={ssPersonal} ssStartMonth={ssStartMonth} ssKidsAgeOutMonths={ssKidsAgeOutMonths}
                chadConsulting={chadConsulting}
                trustIncomeNow={trustIncomeNow} trustIncomeFuture={trustIncomeFuture} trustIncreaseMonth={trustIncreaseMonth}
                vanSold={vanSold} vanMonthlySavings={vanMonthlySavings}
                llcAnnual={llcAnnual} llcMultiplier={llcMultiplier} llcDelayMonths={llcDelayMonths} llcImproves={llcImproves}
                onFieldChange={set}
              />
              <ExpenseControls
                baseExpenses={baseExpenses} debtService={debtService}
                debtCC={debtCC} debtPersonal={debtPersonal} debtIRS={debtIRS} debtFirstmark={debtFirstmark} debtTotal={debtTotal}
                retireDebt={retireDebt}
                lifestyleCutsApplied={lifestyleCutsApplied}
                cutOliver={cutOliver} cutVacation={cutVacation} cutShopping={cutShopping}
                cutMedical={cutMedical} cutGym={cutGym} cutAmazon={cutAmazon} cutSaaS={cutSaaS}
                cutEntertainment={cutEntertainment} cutGroceries={cutGroceries} cutPersonalCare={cutPersonalCare} cutSmallItems={cutSmallItems}
                lifestyleCuts={lifestyleCuts} cutInHalf={cutInHalf} extraCuts={extraCuts}
                bcsAnnualTotal={bcsAnnualTotal} bcsParentsAnnual={bcsParentsAnnual} bcsYearsLeft={bcsYearsLeft} bcsFamilyMonthly={bcsFamilyMonthly}
                vanSold={vanSold} vanMonthlySavings={vanMonthlySavings}
                milestones={milestones}
                moldCost={moldCost} moldInclude={moldInclude} roofCost={roofCost} roofInclude={roofInclude}
                otherProjects={otherProjects} otherInclude={otherInclude}
                onFieldChange={set}
              />
            </div>
          )}

          <DataTable data={data} presentMode={presentMode} />

          <SummaryAsk
            totalRemainingVesting={totalRemainingVesting} data={data} startingSavings={startingSavings}
            savingsZeroMonth={savingsZeroMonth} savingsZeroLabel={savingsZeroLabel}
            ssdiApprovalMonth={ssdiApprovalMonth} ssdiBackPayActual={ssdiBackPayActual} ssdiBackPayMonths={ssdiBackPayMonths}
            retireDebt={retireDebt} debtTotal={debtTotal} debtService={debtService}
            moldInclude={moldInclude} moldCost={moldCost} roofInclude={roofInclude} roofCost={roofCost}
            otherInclude={otherInclude} otherProjects={otherProjects}
            bcsParentsAnnual={bcsParentsAnnual} bcsYearsLeft={bcsYearsLeft} bcsFamilyMonthly={bcsFamilyMonthly}
            advanceNeeded={advanceNeeded} breakevenIdx={breakevenIdx}
          />
        </>}
      </div>
    </div>
  );
}
