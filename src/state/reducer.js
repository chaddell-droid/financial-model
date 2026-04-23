import { INITIAL_STATE } from './initialState.js';
import { migrate, validateAndSanitize } from './schemaValidation.js';

export function reducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_FIELDS':
      return { ...state, ...action.fields };
    case 'RESTORE_STATE': {
      const migrated = migrate(action.state);
      const sanitized = validateAndSanitize(migrated);
      const restored = { ...state, ...sanitized };
      return { ...restored, _templateBaseState: restored };
    }
    case 'RESET_ALL':
      return {
        ...INITIAL_STATE,
        // Preserve UI-only state that shouldn't reset
        savedScenarios: state.savedScenarios,
        checkInHistory: state.checkInHistory,
        monthlyActuals: state.monthlyActuals,
        merchantClassifications: state.merchantClassifications,
        storageStatus: state.storageStatus,
        _templateBaseState: null,
      };
    case 'APPLY_TEMPLATE': {
      const base = state._templateBaseState || state;
      return {
        ...base,
        ...action.overrides,
        _templateBaseState: base,
        savedScenarios: state.savedScenarios,
        checkInHistory: state.checkInHistory,
        monthlyActuals: state.monthlyActuals,
        merchantClassifications: state.merchantClassifications,
        storageStatus: state.storageStatus,
        showSaveLoad: state.showSaveLoad,
        activeTab: state.activeTab,
      };
    }
    case 'RECORD_CHECK_IN': {
      const existing = state.checkInHistory.filter(c => c.month !== action.checkIn.month);
      return {
        ...state,
        checkInHistory: [...existing, action.checkIn].sort((a, b) => a.month - b.month),
        activeCheckInMonth: null,
      };
    }
    case 'DELETE_CHECK_IN': {
      return {
        ...state,
        checkInHistory: state.checkInHistory.filter(c => c.month !== action.month),
      };
    }
    case 'MERGE_ACTUALS': {
      const newActuals = { ...state.monthlyActuals };
      newActuals[action.month] = { transactions: action.transactions };
      return { ...state, monthlyActuals: newActuals };
    }
    case 'UPDATE_TRANSACTION_TYPE': {
      const monthData = state.monthlyActuals[action.month];
      if (!monthData) return state;
      const targetTxn = monthData.transactions.find(t => t.id === action.transactionId);
      const updatedTxns = monthData.transactions.map(t =>
        t.id === action.transactionId ? { ...t, type: action.newType } : t
      );
      return {
        ...state,
        monthlyActuals: {
          ...state.monthlyActuals,
          [action.month]: { transactions: updatedTxns },
        },
        merchantClassifications: targetTxn
          ? { ...state.merchantClassifications, [targetTxn.merchant]: action.newType }
          : state.merchantClassifications,
      };
    }
    case 'BULK_CLASSIFY': {
      // action.month, action.category, action.newType
      const md = state.monthlyActuals[action.month];
      if (!md) return state;
      const newClassifications = { ...state.merchantClassifications };
      const updatedTxns = md.transactions.map(t => {
        if (t.category === action.category && t.amount < 0) {
          newClassifications[t.merchant] = action.newType;
          return { ...t, type: action.newType };
        }
        return t;
      });
      return {
        ...state,
        monthlyActuals: { ...state.monthlyActuals, [action.month]: { transactions: updatedTxns } },
        merchantClassifications: newClassifications,
      };
    }
    case 'BULK_CLASSIFY_MERCHANT': {
      // action.month, action.merchant, action.newType
      // Updates ALL transactions from this merchant across ALL months
      const newClassifications = { ...state.merchantClassifications, [action.merchant]: action.newType };
      const newActuals = {};
      for (const [month, data] of Object.entries(state.monthlyActuals)) {
        newActuals[month] = {
          transactions: data.transactions.map(t =>
            t.merchant === action.merchant && t.amount < 0 ? { ...t, type: action.newType } : t
          ),
        };
      }
      return { ...state, monthlyActuals: newActuals, merchantClassifications: newClassifications };
    }
    case 'RESET_ACTUALS_MONTH': {
      const { [action.month]: _, ...remaining } = state.monthlyActuals;
      return {
        ...state,
        monthlyActuals: remaining,
        ...(action.clearClassifications ? { merchantClassifications: {} } : {}),
      };
    }
    case 'RESET_ACTUALS_ALL': {
      return {
        ...state,
        monthlyActuals: {},
        ...(action.clearClassifications ? { merchantClassifications: {} } : {}),
      };
    }
    case 'APPLY_PREVIEW_MOVE': {
      // action.move = { id, label, mutation }
      // If a move with the same id already exists, replace it in place
      // (preserves ordering for re-dragged continuous-lever sliders in Phase 2).
      // Otherwise, append.
      if (!action.move || !action.move.id || !action.move.mutation) return state;
      const existing = Array.isArray(state.previewMoves) ? state.previewMoves : [];
      const idx = existing.findIndex(m => m && m.id === action.move.id);
      const next = idx >= 0
        ? existing.map((m, i) => (i === idx ? action.move : m))
        : [...existing, action.move];
      return { ...state, previewMoves: next };
    }
    case 'REMOVE_PREVIEW_MOVE': {
      // action.id
      const existing = Array.isArray(state.previewMoves) ? state.previewMoves : [];
      return { ...state, previewMoves: existing.filter(m => m && m.id !== action.id) };
    }
    case 'CLEAR_PREVIEW': {
      return { ...state, previewMoves: [] };
    }
    case 'COMMIT_PREVIEW': {
      // Atomically merge every staged mutation into baseline state and clear
      // the preview stack. Single reducer dispatch; no partial commits.
      const moves = Array.isArray(state.previewMoves) ? state.previewMoves : [];
      if (moves.length === 0) return state;
      let merged = { ...state };
      for (const m of moves) {
        if (m && m.mutation && typeof m.mutation === 'object') {
          merged = { ...merged, ...m.mutation };
        }
      }
      merged.previewMoves = [];
      return merged;
    }
    default:
      return state;
  }
}
