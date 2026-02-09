import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import WizardShell from "./pages/wizard/WizardShell";
import ReconciliationDashboard from "./pages/reconciliation/ReconciliationDashboard";

function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-green-700">FruitPAK</h1>
        <p className="mt-2 text-gray-600">
          Fruit Inventory Packhouse Management &amp; Export System
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<WizardShell />} />
        <Route path="/reconciliation" element={<ReconciliationDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
