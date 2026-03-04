import { useTranslation } from "react-i18next";
import { ContainerDetailType } from "../../api/containers";
import { Card } from "./helpers";

export default function SummaryCards({
  container,
}: {
  container: ContainerDetailType;
}) {
  const { t } = useTranslation("containers");
  const { t: tc } = useTranslation("common");

  const fillPct =
    container.capacity_pallets > 0
      ? Math.round(
          (container.pallet_count / container.capacity_pallets) * 100,
        )
      : 0;

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card
          label={t("detail.pallets")}
          value={`${container.pallet_count} / ${container.capacity_pallets}`}
        />
        <Card label={t("detail.fill")} value={`${fillPct}%`} />
        <Card
          label={t("detail.totalCartons")}
          value={container.total_cartons.toLocaleString()}
        />
        <Card
          label={t("detail.weight")}
          value={
            container.gross_weight_kg
              ? `${container.gross_weight_kg.toLocaleString()} ${tc("units.kg")}`
              : "\u2014"
          }
        />
      </div>

      {/* Fill bar */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>{t("detail.capacity")}</span>
          <span>
            {container.pallet_count} / {container.capacity_pallets}{" "}
            {tc("units.pallets")}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              fillPct >= 100
                ? "bg-green-500"
                : fillPct >= 75
                  ? "bg-yellow-500"
                  : "bg-blue-500"
            }`}
            style={{ width: `${Math.min(fillPct, 100)}%` }}
          />
        </div>
      </div>
    </>
  );
}
