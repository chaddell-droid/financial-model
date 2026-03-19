import React from "react";
import DataTable from '../DataTable.jsx';
import SummaryAsk from '../SummaryAsk.jsx';

export default function DetailsTab({ dataTableProps, summaryAskProps, presentMode }) {
  return (
    <>
      <DataTable {...dataTableProps} presentMode={presentMode} />
      <SummaryAsk {...summaryAskProps} />
    </>
  );
}
