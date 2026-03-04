import { useTranslation } from "react-i18next";
import { ContainerDetailType } from "../../api/containers";

export default function Traceability({
  container,
}: {
  container: ContainerDetailType;
}) {
  const { t } = useTranslation("containers");
  const { t: tc } = useTranslation("common");

  if (container.traceability.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        {t("detail.traceability")}
      </h3>
      <div className="space-y-4">
        {container.traceability.map((tp) => (
          <div key={tp.pallet_number} className="border rounded p-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">
              Pallet {tp.pallet_number} ({tp.current_boxes} {tc("units.boxes")})
            </p>

            {/* Lots */}
            {tp.lots.length > 0 && (
              <div className="ml-4 mb-2">
                <p className="text-xs text-gray-500 mb-1">{t("detail.lots")}</p>
                <div className="space-y-1">
                  {tp.lots.map((lot, i) => (
                    <p key={i} className="text-xs text-gray-700">
                      <span className="font-mono text-green-700">
                        {lot.lot_code}
                      </span>
                      {" \u2014 "}
                      {lot.grade || "?"} / {lot.size || "?"}
                      {lot.box_size_name ? ` \u00b7 ${lot.box_size_name}` : ""}{" "}
                      ({lot.box_count} {tc("units.boxes")})
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Batches / Growers */}
            {tp.batches.length > 0 && (
              <div className="ml-4">
                <p className="text-xs text-gray-500 mb-1">{t("detail.grns")}</p>
                <div className="space-y-1">
                  {tp.batches.map((b, i) => (
                    <p key={i} className="text-xs text-gray-700">
                      <span className="font-mono text-green-700">
                        {b.batch_code}
                      </span>
                      {" \u2190 "}
                      <span className="font-medium">
                        {b.grower_code
                          ? `${b.grower_name} (${b.grower_code})`
                          : b.grower_name || "?"}
                      </span>
                      {" \u00b7 "}
                      {b.fruit_type}
                      {b.intake_date &&
                        ` \u00b7 ${new Date(b.intake_date).toLocaleDateString()}`}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
