import { INITIAL_STATE } from './initialState.js';

export function reducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'RESTORE_STATE': {
      const s = action.state;
      // Backward compatibility: if old scenario has aggregate cuts but no individual cuts,
      // use defaults for individual cuts
      if (s.lifestyleCuts !== undefined && s.cutOliver === undefined) {
        const legacy = {
          ...state,
          ...s,
          cutOliver: INITIAL_STATE.cutOliver,
          cutVacation: INITIAL_STATE.cutVacation,
          cutShopping: INITIAL_STATE.cutShopping,
          cutMedical: INITIAL_STATE.cutMedical,
          cutGym: INITIAL_STATE.cutGym,
          cutAmazon: INITIAL_STATE.cutAmazon,
          cutSaaS: INITIAL_STATE.cutSaaS,
          cutEntertainment: INITIAL_STATE.cutEntertainment,
          cutGroceries: INITIAL_STATE.cutGroceries,
          cutPersonalCare: INITIAL_STATE.cutPersonalCare,
          cutSmallItems: INITIAL_STATE.cutSmallItems,
        };
        if (!Array.isArray(legacy.goals)) legacy.goals = INITIAL_STATE.goals;
        return legacy;
      }
      const result = { ...state, ...s };
      if (!Array.isArray(result.goals)) result.goals = INITIAL_STATE.goals;
      return result;
    }
    case 'RESET_ALL':
      return {
        ...INITIAL_STATE,
        // Preserve UI-only state that shouldn't reset
        savedScenarios: state.savedScenarios,
        storageStatus: state.storageStatus,
      };
    default:
      return state;
  }
}
