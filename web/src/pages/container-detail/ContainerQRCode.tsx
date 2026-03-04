import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { ContainerDetailType } from "../../api/containers";

export default function ContainerQRCode({
  container,
}: {
  container: ContainerDetailType;
}) {
  const { t } = useTranslation("containers");

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        {t("detail.qrCode")}
      </h3>
      <div className="flex flex-col items-center gap-2">
        <QRCodeSVG
          value={JSON.stringify({
            type: "container",
            container_id: container.id,
            number: container.container_number,
            container_type: container.container_type,
            customer: container.customer_name,
            destination: container.destination,
            pallets: container.pallets
              .map((p) => p.pallet_number)
              .slice(0, 20),
            total_cartons: container.total_cartons,
          })}
          size={160}
          fgColor="#15803d"
          level="M"
        />
        <span className="text-xs text-gray-500 font-mono">
          {container.container_number}
        </span>
      </div>
    </div>
  );
}
