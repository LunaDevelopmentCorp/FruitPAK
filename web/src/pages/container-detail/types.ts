import { ContainerDetailType } from "../../api/containers";
import { ShippingLineOut } from "../../api/shippingLines";

/** Common props shared by most container detail sub-components. */
export interface ContainerSectionProps {
  container: ContainerDetailType;
  containerId: string;
  onRefresh: () => void;
}

/** Shipping lines needed by multiple sections (edit form, export form). */
export interface ContainerConfigs {
  shippingLines: ShippingLineOut[];
}

export const CONTAINER_TYPES = [
  "reefer_20ft",
  "reefer_40ft",
  "open_truck",
  "break_bulk",
];
