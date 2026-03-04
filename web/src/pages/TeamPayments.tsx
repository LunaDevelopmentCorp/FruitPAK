import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listHarvestTeams,
  listTeamPayments,
  HarvestTeamItem,
  TeamPaymentOut,
} from "../api/payments";
import { useFinancialConfig } from "../hooks/useFinancialConfig";
import { usePackhouseStore } from "../store/packhouseStore";
import PageHeader from "../components/PageHeader";
import RecordPaymentTab from "./team-payments/RecordPaymentTab";
import TeamManagementTab from "./team-payments/TeamManagementTab";
import ReconciliationTab from "./team-payments/ReconciliationTab";

export default function TeamPayments() {
  const { t } = useTranslation("payments");
  const currentPackhouseId = usePackhouseStore((s) => s.currentPackhouseId);
  const { baseCurrency } = useFinancialConfig();

  // ── Shared data ─────────────────────────────────────────
  const [teams, setTeams] = useState<HarvestTeamItem[]>([]);
  const [payments, setPayments] = useState<TeamPaymentOut[]>([]);

  // ── Tab ─────────────────────────────────────────────────
  const [tab, setTab] = useState<"record" | "teams" | "reconciliation">(
    "record",
  );

  // ── Load data ───────────────────────────────────────────
  const refreshTeams = () => {
    listHarvestTeams().then(setTeams).catch(() => {});
  };

  useEffect(() => {
    refreshTeams();
    listTeamPayments().then(setPayments).catch(() => {});
  }, [currentPackhouseId]);

  // ── Natural sort (shared across tabs) ───────────────────
  const sortedTeams = useMemo(
    () =>
      [...teams].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    [teams],
  );

  // ── Common props for all tabs ───────────────────────────
  const commonProps = {
    teams,
    sortedTeams,
    baseCurrency,
    onRefresh: refreshTeams,
  };

  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? "border-green-600 text-green-700"
        : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <PageHeader title={t("team.title")} />

      {/* Tab bar */}
      <div className="flex gap-1 border-b no-print">
        <button
          onClick={() => setTab("record")}
          className={tabCls(tab === "record")}
        >
          {t("team.tabs.recordPayment")}
        </button>
        <button
          onClick={() => setTab("teams")}
          className={tabCls(tab === "teams")}
        >
          {t("team.tabs.teamManagement")}
        </button>
        <button
          onClick={() => setTab("reconciliation")}
          className={tabCls(tab === "reconciliation")}
        >
          {t("team.tabs.reconciliation")}
        </button>
      </div>

      {tab === "record" && (
        <RecordPaymentTab
          {...commonProps}
          payments={payments}
          onPaymentsChange={setPayments}
        />
      )}
      {tab === "teams" && <TeamManagementTab {...commonProps} />}
      {tab === "reconciliation" && <ReconciliationTab {...commonProps} />}
    </div>
  );
}
