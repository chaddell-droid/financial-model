import React, { memo, useState, useMemo } from 'react';
import SurfaceCard from '../../components/ui/SurfaceCard.jsx';
import ActionButton from '../../components/ui/ActionButton.jsx';
import Slider from '../../components/Slider.jsx';
import { fmtFull } from '../../model/formatters.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../../ui/tokens.js';
import { CHECK_IN_HELP } from '../../content/help/checkInHelp.js';
import {
  getMonthLabel, getPlanSnapshot, computeMonthlyDrift, buildStatusSummary,
} from '../../model/checkIn.js';

const MONO = "'JetBrains Mono', monospace";
const STATUS_COLORS = { ahead: '#4ade80', 'on-track': '#fbbf24', behind: '#f87171' };
const pillBox = { padding: '12px 14px', background: '#0f172a', borderRadius: 8, border: '1px solid #334155' };
const dimLabel = { fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 };
const metricNum = (color, size = 20) => ({ fontSize: size, fontWeight: 700, fontFamily: MONO, color });

function initForm(plan) {
  if (!plan) return {};
  return {
    sarahIncome: plan.sarahIncome || 0, msftVesting: plan.msftVesting || 0,
    trustIncome: plan.trustIncome || 0, ssdiIncome: plan.ssdiIncome || 0,
    expenses: plan.expenses || 0, balance: plan.balance || 0, notes: '',
  };
}

function TrackTab({
  checkInHistory, monthlyDetail, currentModelMonth,
  onRecordCheckIn, onDeleteCheckIn, savingsData,
  reforecastProjection, goals, goalResults, presentMode,
}) {
  const [editingMonth, setEditingMonth] = useState(null);
  const [formValues, setFormValues] = useState({});

  const plan = useMemo(() => getPlanSnapshot(monthlyDetail, currentModelMonth), [monthlyDetail, currentModelMonth]);
  const existingCheckIn = useMemo(() => checkInHistory?.find(c => c.month === currentModelMonth) || null, [checkInHistory, currentModelMonth]);
  const latestCheckIn = useMemo(() => checkInHistory?.length ? checkInHistory[checkInHistory.length - 1] : null, [checkInHistory]);
  const latestDrift = useMemo(() => {
    if (!latestCheckIn) return null;
    return computeMonthlyDrift(latestCheckIn.actuals, latestCheckIn.planSnapshot);
  }, [latestCheckIn]);
  const statusSummary = useMemo(() => {
    if (!latestCheckIn || !latestDrift) return null;
    return buildStatusSummary(latestCheckIn, latestDrift, savingsData);
  }, [latestCheckIn, latestDrift, savingsData]);

  const isFormOpen = editingMonth === currentModelMonth;
  const hasHistory = checkInHistory && checkInHistory.length > 0;

  const openForm = () => {
    setFormValues(initForm(existingCheckIn ? existingCheckIn.actuals : plan));
    setEditingMonth(currentModelMonth);
  };
  const setField = (key) => (val) => setFormValues(prev => ({ ...prev, [key]: val }));
  const handleRecord = () => {
    onRecordCheckIn({
      month: currentModelMonth, monthLabel: getMonthLabel(currentModelMonth),
      recordedAt: new Date().toISOString(),
      actuals: {
        sarahIncome: formValues.sarahIncome, msftVesting: formValues.msftVesting,
        trustIncome: formValues.trustIncome, ssdiIncome: formValues.ssdiIncome,
        totalIncome: (formValues.sarahIncome || 0) + (formValues.msftVesting || 0) + (formValues.trustIncome || 0) + (formValues.ssdiIncome || 0),
        expenses: formValues.expenses, balance: formValues.balance,
      },
      planSnapshot: plan, notes: formValues.notes || '',
    });
    setEditingMonth(null);
  };

  const sliderRow = (label, key, min, max, step, color, testId) => (
    <Slider label={label} value={formValues[key] || 0} onChange={setField(key)}
      min={min} max={max} step={step} color={color} testId={testId}
      helperText={`Plan: ${fmtFull(plan?.[key] || 0)}`} />
  );

  /* ── Section 1: Record This Month ── */
  const recordSection = (
    <SurfaceCard data-testid="check-in-form" padding="lg">
      <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.primary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        Monthly Check-In
      </div>
      <h2 style={{ fontSize: UI_TEXT.heading, fontWeight: 700, color: UI_COLORS.textStrong, margin: '0 0 4px' }}>
        {getMonthLabel(currentModelMonth)} Check-In
      </h2>
      {!hasHistory && !isFormOpen && (
        <p style={{ fontSize: UI_TEXT.body, color: UI_COLORS.textMuted, lineHeight: 1.6, margin: '8px 0 16px', maxWidth: 640 }}>
          {CHECK_IN_HELP.monthly_check_in.body[0]} {CHECK_IN_HELP.monthly_check_in.body[1]}
        </p>
      )}
      {existingCheckIn && !isFormOpen ? (
        <div style={{ marginTop: UI_SPACE.md }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: UI_SPACE.md, marginBottom: UI_SPACE.lg }}>
            <div>
              <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginBottom: 2 }}>Balance</div>
              <div style={metricNum(UI_COLORS.info)}>{fmtFull(existingCheckIn.actuals.balance)}</div>
            </div>
            <div>
              <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginBottom: 2 }}>Income</div>
              <div style={metricNum(UI_COLORS.positive)}>{fmtFull(existingCheckIn.actuals.totalIncome)}</div>
            </div>
            <div>
              <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginBottom: 2 }}>Expenses</div>
              <div style={metricNum(UI_COLORS.destructive)}>{fmtFull(existingCheckIn.actuals.expenses)}</div>
            </div>
          </div>
          {existingCheckIn.notes && (
            <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textMuted, fontStyle: 'italic', marginBottom: UI_SPACE.md }}>
              &ldquo;{existingCheckIn.notes}&rdquo;
            </div>
          )}
          <ActionButton variant="secondary" onClick={openForm}>Edit</ActionButton>
        </div>
      ) : !isFormOpen ? (
        <div style={{ marginTop: UI_SPACE.md }}>
          <ActionButton variant="primary" onClick={openForm}>Start Check-In</ActionButton>
        </div>
      ) : (
        <div style={{ marginTop: UI_SPACE.lg, display: 'grid', gap: UI_SPACE.lg }}>
          {sliderRow("Sarah's business income", 'sarahIncome', 0, Math.max((plan?.sarahIncome || 0) * 2, 50000), 500, '#38bdf8', 'check-in-sarah-income')}
          {sliderRow('MSFT vesting', 'msftVesting', 0, Math.max((plan?.msftVesting || 0) * 2, 50000), 500, '#60a5fa', 'check-in-msft')}
          {sliderRow('Trust/LLC', 'trustIncome', 0, Math.max((plan?.trustIncome || 0) * 2, 20000), 500, '#c084fc', 'check-in-trust')}
          {sliderRow('SSDI / Social Security', 'ssdiIncome', 0, Math.max((plan?.ssdiIncome || 0) * 2, 10000), 100, '#fb923c', 'check-in-ssdi')}
          {sliderRow('Total expenses', 'expenses', 20000, 80000, 500, '#f87171', 'check-in-expenses')}
          <div style={{ padding: '12px 14px', background: 'rgba(96,165,250,0.08)', borderRadius: 8, border: '1px solid rgba(96,165,250,0.2)' }}>
            <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.info, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              {CHECK_IN_HELP.check_in_balance.short}
            </div>
            <Slider label="Actual savings balance" value={formValues.balance || 0} onChange={setField('balance')}
              min={0} max={500000} step={1000} color="#60a5fa" testId="check-in-balance"
              helperText={`Plan: ${fmtFull(plan?.balance || 0)}`} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: UI_TEXT.caption, color: UI_COLORS.textBody, fontWeight: 600, marginBottom: 4 }}>Notes</label>
            <textarea data-testid="check-in-notes" value={formValues.notes || ''} onChange={e => setField('notes')(e.target.value)}
              placeholder="Anything notable this month..." rows={3}
              style={{ width: '100%', background: '#0f172a', border: `1px solid ${UI_COLORS.border}`, borderRadius: 8,
                padding: '8px 12px', color: UI_COLORS.textBody, fontSize: UI_TEXT.body, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: UI_SPACE.sm }}>
            <ActionButton variant="primary" onClick={handleRecord} data-testid="check-in-submit">Record Check-In</ActionButton>
            <ActionButton variant="ghost" onClick={() => setEditingMonth(null)}>Cancel</ActionButton>
          </div>
        </div>
      )}
    </SurfaceCard>
  );

  /* ── Section 2: Plan vs. Reality ── */
  const driftSection = hasHistory && latestDrift ? (
    <SurfaceCard data-testid="check-in-drift" tone="featured" padding="lg">
      <h3 style={{ fontSize: UI_TEXT.heading, fontWeight: 700, color: UI_COLORS.textStrong, margin: '0 0 4px' }}>Plan vs. Reality</h3>
      <p style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textMuted, margin: '0 0 16px' }}>{CHECK_IN_HELP.check_in_drift.short}</p>
      {latestDrift.balance && (
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: MONO, marginBottom: UI_SPACE.lg,
          color: latestDrift.balance.delta >= 0 ? '#4ade80' : '#f87171' }}>
          {latestDrift.balance.delta >= 0
            ? `You're ${fmtFull(Math.abs(latestDrift.balance.delta))} ahead of plan`
            : `You're ${fmtFull(Math.abs(latestDrift.balance.delta))} behind plan`}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: UI_TEXT.caption }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${UI_COLORS.border}` }}>
              {['', 'Planned', 'Actual', 'Delta'].map(h => (
                <th key={h} style={{ textAlign: h === '' ? 'left' : 'right', padding: '6px 8px',
                  fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.values(latestDrift).map(row => (
              <tr key={row.label} style={{ borderBottom: `1px solid ${UI_COLORS.border}` }}>
                <td style={{ padding: '6px 8px', color: UI_COLORS.textBody }}>{row.label}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: MONO, color: UI_COLORS.textMuted }}>{fmtFull(row.planned)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: MONO, color: UI_COLORS.textBody }}>{fmtFull(row.actual)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: MONO, fontWeight: 600, color: STATUS_COLORS[row.status] }}>
                  {row.delta >= 0 ? '+' : ''}{fmtFull(row.delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {checkInHistory.length > 1 && (
        <div style={{ ...pillBox, marginTop: UI_SPACE.lg }}>
          <div style={dimLabel}>Cumulative ({checkInHistory.length} check-ins)</div>
          <div style={{ fontSize: UI_TEXT.body, color: UI_COLORS.textBody }}>
            Latest balance is{' '}
            <span style={{ fontFamily: MONO, fontWeight: 700, color: latestDrift.balance?.delta >= 0 ? '#4ade80' : '#f87171' }}>
              {latestDrift.balance?.delta >= 0 ? '+' : ''}{fmtFull(latestDrift.balance?.delta || 0)}
            </span>{' '}vs. plan after {checkInHistory.length} months tracked.
          </div>
        </div>
      )}
    </SurfaceCard>
  ) : null;

  /* ── Section 3: What's Next ── */
  const reforecastRunway = useMemo(() => {
    if (!reforecastProjection) return null;
    const rfSav = reforecastProjection.savingsData || reforecastProjection.data?.map(d => ({ month: d.month, balance: d.balance }));
    if (!rfSav) return null;
    const zeroMonth = rfSav.find(d => d.balance <= 0);
    const planZero = savingsData?.find(d => d.balance <= 0);
    return { reforecast: zeroMonth ? zeroMonth.month : null, plan: planZero ? planZero.month : null };
  }, [reforecastProjection, savingsData]);

  const notesTimeline = useMemo(() => {
    if (!checkInHistory) return [];
    return checkInHistory.filter(c => c.notes && c.notes.trim()).reverse();
  }, [checkInHistory]);

  const whatsNextSection = hasHistory ? (
    <SurfaceCard padding="lg">
      <h3 style={{ fontSize: UI_TEXT.heading, fontWeight: 700, color: UI_COLORS.textStrong, margin: '0 0 12px' }}>What's Next</h3>
      {reforecastRunway && (
        <div style={{ ...pillBox, marginBottom: UI_SPACE.lg }}>
          <div style={{ ...dimLabel, marginBottom: 6 }}>{CHECK_IN_HELP.check_in_reforecast.short}</div>
          <div style={{ fontSize: UI_TEXT.body, color: UI_COLORS.textBody, lineHeight: 1.6 }}>
            With your actual balance, runway is{' '}
            <span style={{ fontFamily: MONO, fontWeight: 700, color: UI_COLORS.info }}>
              {reforecastRunway.reforecast ? `~${reforecastRunway.reforecast} months` : '6+ years'}
            </span>
            {reforecastRunway.plan && (<>{' '}(plan said <span style={{ fontFamily: MONO, color: UI_COLORS.textMuted }}>~{reforecastRunway.plan} months</span>)</>)}
            {!reforecastRunway.plan && !reforecastRunway.reforecast && (
              <span style={{ color: UI_COLORS.textMuted }}> — both plan and actuals show 6+ year runway</span>
            )}
          </div>
        </div>
      )}
      <div style={{ fontSize: UI_TEXT.body, color: UI_COLORS.textMuted, marginBottom: UI_SPACE.lg }}>
        Need to update assumptions? Head to the <strong style={{ color: UI_COLORS.textBody }}>Plan</strong> tab.
      </div>
      {notesTimeline.length > 0 && (
        <div>
          <div style={dimLabel}>Notes Timeline</div>
          {notesTimeline.map(c => (
            <div key={c.month} style={{ padding: '8px 12px', marginBottom: 6, background: '#0f172a', borderRadius: 6, border: '1px solid #334155' }}>
              <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginBottom: 2 }}>{c.monthLabel || getMonthLabel(c.month)}</div>
              <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textBody }}>{c.notes}</div>
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
  ) : null;

  /* ── Section 4: Status Card ── */
  const statusSection = hasHistory && statusSummary ? (
    <SurfaceCard data-testid="check-in-status" tone="featured" padding="lg">
      <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Status Card</div>
      <h3 style={{ fontSize: UI_TEXT.heading, fontWeight: 700, color: UI_COLORS.textStrong, margin: '0 0 4px' }}>
        {statusSummary.monthLabel} Check-In:{' '}
        <span style={{ color: statusSummary.headline.includes('Behind') ? '#f87171'
          : statusSummary.headline.includes('ahead') || statusSummary.headline.includes('On Track') ? '#4ade80' : UI_COLORS.textBody }}>
          {statusSummary.headline}
        </span>
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: UI_SPACE.lg,
        marginTop: UI_SPACE.lg, padding: '14px 16px', ...pillBox }}>
        <div>
          <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginBottom: 2 }}>Planned Balance</div>
          <div style={metricNum(UI_COLORS.textMuted, 18)}>{fmtFull(statusSummary.plannedBalance)}</div>
        </div>
        <div>
          <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginBottom: 2 }}>Actual Balance</div>
          <div style={metricNum(UI_COLORS.info, 18)}>{fmtFull(statusSummary.actualBalance)}</div>
        </div>
        <div>
          <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginBottom: 2 }}>Runway</div>
          <div style={metricNum(UI_COLORS.positive, 18)}>{statusSummary.runway}</div>
        </div>
      </div>
      <div style={{ marginTop: UI_SPACE.md, fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, textAlign: 'right' }}>
        Recorded {latestCheckIn?.recordedAt ? new Date(latestCheckIn.recordedAt).toLocaleDateString() : ''}
      </div>
    </SurfaceCard>
  ) : null;

  return (
    <div data-testid="track-tab" style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: UI_SPACE.lg }}>
      {recordSection}
      {driftSection}
      {whatsNextSection}
      {statusSection}
    </div>
  );
}

export default memo(TrackTab);
