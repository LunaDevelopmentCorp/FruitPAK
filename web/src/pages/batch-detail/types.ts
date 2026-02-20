import {
  BatchDetail as BatchDetailType,
  LotFromBatchItem,
} from "../../api/batches";
import { BoxSizeConfig, BinTypeConfig } from "../../api/pallets";
import { FruitTypeConfig } from "../../api/config";

/** Extended lot row with UI-only fields for unit selection. */
export type LotRowForm = LotFromBatchItem & {
  unit: "cartons" | "bins";
  bin_type_id?: string;
  bin_count?: number;
};

/** Common props shared by most batch detail sub-components. */
export interface BatchSectionProps {
  batch: BatchDetailType;
  batchId: string;
  onRefresh: () => Promise<void>;
}

/** Config data loaded once and shared across sections. */
export interface BatchConfigs {
  boxSizes: BoxSizeConfig[];
  binTypes: BinTypeConfig[];
  fruitConfigs: FruitTypeConfig[];
}
