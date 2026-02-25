import "./i18n";
import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import EnterpriseSetup from "./pages/EnterpriseSetup";
import Dashboard from "./pages/Dashboard";
import GrnIntake from "./pages/GrnIntake";
import BatchesList from "./pages/BatchesList";
import BatchDetail from "./pages/BatchDetail";
import WizardShell from "./pages/wizard/WizardShell";
import Payments from "./pages/Payments";
import TeamPayments from "./pages/TeamPayments";
import PalletsList from "./pages/PalletsList";
import PalletDetail from "./pages/PalletDetail";
import ContainersList from "./pages/ContainersList";
import ContainerDetail from "./pages/ContainerDetail";
import PackagingStock from "./pages/PackagingStock";
import ClientManagement from "./pages/ClientManagement";
import DataManagement from "./pages/DataManagement";
import ReconciliationDashboard from "./pages/reconciliation/ReconciliationDashboard";
import PlatformShell from "./pages/platform/PlatformShell";
import PlatformStats from "./pages/platform/PlatformStats";
import PlatformEnterprises from "./pages/platform/PlatformEnterprises";
import PlatformUsers from "./pages/platform/PlatformUsers";
import AdminShell from "./pages/admin/AdminShell";
import AdminOverview from "./pages/admin/AdminOverview";
import UserManagement from "./pages/admin/UserManagement";
import ActivityLog from "./pages/admin/ActivityLog";
import DeletedItems from "./pages/admin/DeletedItems";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import GlobalToast from "./components/GlobalToast";

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Loading...</p></div>}>
    <ErrorBoundary>
      <BrowserRouter>
        <GlobalToast />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

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
            <Route path="/pallets" element={<PalletsList />} />
            <Route path="/pallets/:palletId" element={<PalletDetail />} />
            <Route path="/containers" element={<ContainersList />} />
            <Route path="/containers/:containerId" element={<ContainerDetail />} />
            <Route path="/packaging" element={<PackagingStock />} />
            <Route path="/clients" element={<ClientManagement />} />
            <Route path="/data" element={<DataManagement />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/team-payments" element={<TeamPayments />} />
            <Route path="/reconciliation" element={<ReconciliationDashboard />} />
            <Route path="/admin" element={<AdminShell />}>
              <Route index element={<Navigate to="/admin/overview" replace />} />
              <Route path="overview" element={<AdminOverview />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="activity" element={<ActivityLog />} />
              <Route path="deleted-items" element={<DeletedItems />} />
            </Route>
            <Route path="/platform" element={<PlatformShell />}>
              <Route index element={<Navigate to="/platform/stats" replace />} />
              <Route path="stats" element={<PlatformStats />} />
              <Route path="enterprises" element={<PlatformEnterprises />} />
              <Route path="users" element={<PlatformUsers />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
    </Suspense>
  );
}
