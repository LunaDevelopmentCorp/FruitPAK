/** Simple payment-type badge (advance / final). */
export default function PaymentBadge({ type }: { type: string }) {
  const cls =
    type === "advance"
      ? "bg-yellow-50 text-yellow-700"
      : "bg-green-50 text-green-700";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}
    >
      {type}
    </span>
  );
}
