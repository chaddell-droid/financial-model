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
    default:
      return state;
  }
}
