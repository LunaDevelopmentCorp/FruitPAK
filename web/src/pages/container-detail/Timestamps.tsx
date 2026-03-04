import { useTranslation } from "react-i18next";
import { ContainerDetailType } from "../../api/containers";
import { Row } from "./helpers";

export default function Timestamps({
  container,
}: {
  container: ContainerDetailType;
}) {
  const { t } = useTranslation("containers");

  const hasAny =
    container.sealed_at ||
    container.dispatched_at ||
    container.arrived_at ||
    container.delivered_at;

  if (!hasAny) return null;

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        {t("container.timestamps")}
      </h3>
      <div className="grid grid-cols-2 gap-y-2 text-sm">
        {container.sealed_at && (
          <>
            <Row
              label={t("container.sealedAt")}
              value={new Date(container.sealed_at).toLocaleString()}
            />
            {container.sealed_by && (
              <Row
                label={t("container.sealedBy")}
                value={container.sealed_by}
              />
            )}
          </>
        )}
        {container.dispatched_at && (
          <Row
            label={t("container.dispatchedAt")}
            value={new Date(container.dispatched_at).toLocaleString()}
          />
        )}
        {container.arrived_at && (
          <Row
            label={t("container.arrivedAt")}
            value={new Date(container.arrived_at).toLocaleString()}
          />
        )}
        {container.delivered_at && (
          <Row
            label={t("container.deliveredAt")}
            value={new Date(container.delivered_at).toLocaleString()}
          />
        )}
      </div>
    </div>
  );
}
