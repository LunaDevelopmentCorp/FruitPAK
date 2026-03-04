import {
  GRNPayload,
  GRNResponse,
  BatchSummary,
  Grower,
  GrowerField,
  Packhouse,
} from "../../api/batches";
import { BinTypeConfig } from "../../api/pallets";
import { FruitTypeConfig } from "../../api/config";
import { HarvestTeamItem } from "../../api/payments";

/** Reference data loaded once by the shell and shared with sub-components. */
export interface GrnReferenceData {
  growers: Grower[];
  packhouses: Packhouse[];
  fruitConfigs: FruitTypeConfig[];
  binTypes: BinTypeConfig[];
  harvestTeams: HarvestTeamItem[];
}

/** Props for the intake form sub-component. */
export interface IntakeFormProps {
  referenceData: GrnReferenceData;
  onSuccess: (result: GRNResponse) => void;
  onRefreshRecent: () => void;
}

/** Props for the success screen sub-component. */
export interface SuccessScreenProps {
  result: GRNResponse;
  onNewIntake: () => void;
}

/** Props for the recent batches table sub-component. */
export interface RecentBatchesTableProps {
  batches: BatchSummary[];
  loading: boolean;
  grnDate: string;
  onDateChange: (date: string) => void;
  binTypes: BinTypeConfig[];
  onRefresh: () => void;
}

/** Props for the inline edit panel sub-component. */
export interface InlineEditPanelProps {
  batch: BatchSummary;
  binTypes: BinTypeConfig[];
  onSave: () => void;
  onCancel: () => void;
}

/** Server-side field validation error. */
export interface FieldError {
  field: string;
  message: string;
}

// Re-export types used by sub-components for convenience
export type {
  GRNPayload,
  GRNResponse,
  BatchSummary,
  Grower,
  GrowerField,
  Packhouse,
  BinTypeConfig,
  FruitTypeConfig,
  HarvestTeamItem,
};
