import React from 'react';
import ReactDOM from 'react-dom/client';
import FinancialModel from './FinancialModel.jsx';
import './index.css';
import { getUiTestConfig, installUiTestHarness } from './testing/uiHarness.js';

// Polyfill window.storage — Claude artifacts provide this API,
// but in a standard browser we use localStorage as the backing store
window.storage = {
  get: async (key) => {
    try {
      const val = localStorage.getItem(`fs_${key}`);
      if (val === null) throw new Error('Key not found');
      return { key, value: val, shared: false };
    } catch (e) {
      throw new Error(`Key not found: ${key}`);
    }
  },
  set: async (key, value) => {
    try {
      localStorage.setItem(`fs_${key}`, value);
      return { key, value, shared: false };
    } catch (e) {
      console.error('Storage set error:', e);
      return null;
    }
  },
  delete: async (key) => {
    try {
      localStorage.removeItem(`fs_${key}`);
      return { key, deleted: true, shared: false };
    } catch (e) {
      return null;
    }
  },
  list: async (prefix) => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('fs_')) {
        const clean = k.slice(3);
        if (!prefix || clean.startsWith(prefix)) {
          keys.push(clean);
        }
      }
    }
    return { keys, shared: false };
  }
};

installUiTestHarness();

const uiTestConfig = getUiTestConfig();
const app = <FinancialModel />;

ReactDOM.createRoot(document.getElementById('root')).render(app);
