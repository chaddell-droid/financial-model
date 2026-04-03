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
      return { ...state, ...sanitized };
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
      };
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
    default:
      return state;
  }
}
