import React from 'react';
import TaxSettingsPanel from '../TaxSettingsPanel.jsx';
import TaxVisualization from '../../charts/TaxVisualization.jsx';

export default function TaxTab(props) {
  return (
    <>
      <TaxSettingsPanel {...props} />
      {props.taxMode === 'engine' && <TaxVisualization {...props} />}
    </>
  );
}
