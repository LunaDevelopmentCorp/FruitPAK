import api from "./client";

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface GrowerPaymentPayload {
  grower_id: string;
  amount: number;
  currency: string;
  payment_type: string;
  payment_date: string;
  notes?: string;
  batch_ids: string[];
}

export interface GrowerPaymentOut {
  id: string;
  payment_ref: string;
  grower_id: string;
  grower_name: string | null;
  batch_ids: string[];
  currency: string;
  gross_amount: number;
  net_amount: number;
  total_kg: number | null;
  payment_type: string;
  paid_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export async function submitGrowerPayment(
  payload: GrowerPaymentPayload
): Promise<GrowerPaymentOut> {
  const { data } = await api.post<GrowerPaymentOut>("/payments/grower", payload);
  return data;
}

export async function listGrowerPayments(
  grower_id?: string
): Promise<GrowerPaymentOut[]> {
  const params = grower_id ? { grower_id } : {};
  const { data } = await api.get<PaginatedResponse<GrowerPaymentOut>>("/payments/grower", { params });
  return data.items;
}
