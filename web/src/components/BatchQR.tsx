import React from "react";
import { QRCodeSVG } from "qrcode.react";

interface BatchQRProps {
  batch: {
    id: string;
    batch_code: string;
    grower_name?: string | null;
    variety?: string | null;
    net_weight_kg?: number | null;
    intake_date?: string | null;
  };
  size?: number;
}

export default function BatchQR({ batch, size = 160 }: BatchQRProps) {
  const qrData = JSON.stringify({
    batch_id: batch.id,
    code: batch.batch_code,
    grower_name: batch.grower_name ?? null,
    variety: batch.variety ?? null,
    net_weight_kg: batch.net_weight_kg ?? null,
    intake_date: batch.intake_date ?? null,
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <QRCodeSVG
        value={qrData}
        size={size}
        fgColor="#15803d"
        level="M"
      />
      <span className="text-xs text-gray-500 font-mono">{batch.batch_code}</span>
    </div>
  );
}
