import {
  HarvestTeamItem,
  TeamPaymentOut,
  TeamSummary,
  TeamReconciliationDetail,
} from "../../api/payments";

/** Common props shared by all team-payment tab sub-components. */
export interface TeamPaymentTabProps {
  teams: HarvestTeamItem[];
  /** Teams pre-sorted by natural name order. */
  sortedTeams: HarvestTeamItem[];
  baseCurrency: string;
  onRefresh: () => void;
}

/** Props for the Record Payment tab. */
export interface RecordPaymentTabProps extends TeamPaymentTabProps {
  payments: TeamPaymentOut[];
  onPaymentsChange: (payments: TeamPaymentOut[]) => void;
}

/** Props for the Team Management tab. */
export interface TeamManagementTabProps extends TeamPaymentTabProps {}

/** Props for the Reconciliation tab. */
export interface ReconciliationTabProps extends TeamPaymentTabProps {}

// Re-export API types used by sub-components for convenience
export type {
  HarvestTeamItem,
  TeamPaymentOut,
  TeamSummary,
  TeamReconciliationDetail,
};
