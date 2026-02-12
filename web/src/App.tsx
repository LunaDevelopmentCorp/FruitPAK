import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import EnterpriseSetup from "./pages/EnterpriseSetup";
import Dashboard from "./pages/Dashboard";
import GrnIntake from "./pages/GrnIntake";
import BatchesList from "./pages/BatchesList";
import BatchDetail from "./pages/BatchDetail";
import WizardShell from "./pages/wizard/WizardShell";
import Payments from "./pages/Payments";
import ReconciliationDashboard from "./pages/reconciliation/ReconciliationDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import GlobalToast from "./components/GlobalToast";

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <GlobalToast />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Enterprise creation — protected but no layout (no tenant yet) */}
          <Route
            path="/enterprise-setup"
            element={
              <ProtectedRoute>
                <EnterpriseSetup />
              </ProtectedRoute>
            }
          />

          {/* Protected — wrapped in layout with nav */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/setup" element={<WizardShell />} />
            <Route path="/grn-intake" element={<GrnIntake />} />
            <Route path="/batches" element={<BatchesList />} />
            <Route path="/batches/:batchId" element={<BatchDetail />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/reconciliation" element={<ReconciliationDashboard />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
