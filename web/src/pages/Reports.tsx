import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PageHeader from "../components/PageHeader";
import { showToast } from "../store/toastStore";
import { useTableSort, sortRows, sortableThClass } from "../hooks/useTableSort";
import { listContainers, ContainerSummary } from "../api/containers";
import { listBatches, BatchSummary } from "../api/batches";
import {
  getProductionReport,
  getGrowerSummary,
  getPackout,
  getPerformanceReport,
  getPackingList,
  downloadProductionCsv,
  downloadGrowerSummaryCsv,
  downloadPerformanceCsv,
  downloadPackingListCsv,
  ProductionRow,
  GrowerSummaryRow,
  PackoutResponse,
  PerformanceRow,
  PackingListResponse,
} from "../api/reports";
import { generatePackingList, downloadDocument } from "../api/shipmentDocuments";

type Tab = "packingList" | "production" | "growerSummary" | "packout" | "performance";

const TABS: Tab[] = ["packingList", "production", "growerSummary", "packout", "performance"];

function defaultDateFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultDateTo() {
  return new Date().toISOString().slice(0, 10);
}

export default function Reports() {
  const { t } = useTranslation("reports");
  const [tab, setTab] = useState<Tab>("packingList");

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {TABS.map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === key
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "packingList" && <PackingListTab />}
      {tab === "production" && <ProductionTab />}
      {tab === "growerSummary" && <GrowerSummaryTab />}
      {tab === "packout" && <PackoutTab />}
      {tab === "performance" && <PerformanceTab />}
    </div>
  );
}

// ── Shared: Date range filter bar ────────────────────────────

function DateRangeBar({
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  onRefresh,
  loading,
  onDownload,
  downloading,
}: {
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  onRefresh: () => void;
  loading: boolean;
  onDownload?: () => void;
  downloading?: boolean;
}) {
  const { t } = useTranslation("reports");
  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      <label className="text-sm">
        <span className="text-gray-500 block mb-0.5">{t("dateFrom")}</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="text-gray-500 block mb-0.5">{t("dateTo")}</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm"
        />
      </label>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? "..." : "Apply"}
      </button>
      {onDownload && (
        <button
          onClick={onDownload}
          disabled={downloading}
          className="px-3 py-1.5 border text-sm rounded hover:bg-gray-50 disabled:opacity-50"
        >
          {downloading ? t("downloading") : t("downloadCsv")}
        </button>
      )}
    </div>
  );
}

// ── 1. Production Tab ────────────────────────────────────────

function ProductionTab() {
  const { t } = useTranslation("reports");
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getProductionReport({ date_from: dateFrom, date_to: dateTo }));
    } catch {
      showToast("error", t("toast.downloadFailed"));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, t]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(
    () =>
      sortRows(rows, sortCol, sortDir, {
        batch_code: (r) => r.batch_code,
        grower: (r) => r.grower_name,
        fruit: (r) => r.fruit_type,
        net: (r) => r.net_weight_kg,
        lots: (r) => r.lot_count,
        cartons: (r) => r.carton_count,
        waste: (r) => r.waste_kg,
        c2Lots: (r) => r.class2_lots,
        c2Cartons: (r) => r.class2_cartons,
        retLots: (r) => r.returned_lots,
        retKg: (r) => r.returned_kg,
        status: (r) => r.status,
        date: (r) => r.created_at,
      }),
    [rows, sortCol, sortDir],
  );

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadProductionCsv({ date_from: dateFrom, date_to: dateTo });
    } catch {
      showToast("error", t("toast.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <DateRangeBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        onRefresh={load}
        loading={loading}
        onDownload={handleDownload}
        downloading={downloading}
      />
      {rows.length === 0 && !loading ? (
        <p className="text-gray-400 text-sm py-8 text-center">{t("noData")}</p>
      ) : (
        <div className="overflow-x-auto bg-white rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                {[
                  ["batch_code", t("production.batchCode")],
                  ["grower", t("production.grower")],
                  ["fruit", t("production.fruitType")],
                  ["net", t("production.netWeight")],
                  ["lots", t("production.lots")],
                  ["cartons", t("production.cartons")],
                  ["waste", t("production.waste")],
                  ["c2Lots", t("production.class2Lots")],
                  ["c2Cartons", t("production.class2Cartons")],
                  ["retLots", t("production.returnedLots")],
                  ["retKg", t("production.returnedKg")],
                  ["status", t("production.status")],
                  ["date", t("production.date")],
                ].map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    className={`px-3 py-2 text-left ${sortableThClass}`}
                  >
                    {label}{sortIndicator(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((r) => (
                <tr key={r.batch_code + r.created_at} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{r.batch_code}</td>
                  <td className="px-3 py-2">{r.grower_name}</td>
                  <td className="px-3 py-2">{r.fruit_type} {r.variety ? `/ ${r.variety}` : ""}</td>
                  <td className="px-3 py-2 text-right">{r.net_weight_kg ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{r.lot_count}</td>
                  <td className="px-3 py-2 text-right">{r.carton_count}</td>
                  <td className="px-3 py-2 text-right">{r.waste_kg}</td>
                  <td className="px-3 py-2 text-right">{r.class2_lots || "—"}</td>
                  <td className="px-3 py-2 text-right">{r.class2_cartons || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {r.returned_lots > 0 ? (
                      <span className="text-purple-600 font-medium">{r.returned_lots}</span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.returned_kg > 0 ? (
                      <span className="text-purple-600 font-medium">{r.returned_kg}</span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{r.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── 2. Grower Summary Tab ────────────────────────────────────

function GrowerSummaryTab() {
  const { t } = useTranslation("reports");
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [rows, setRows] = useState<GrowerSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getGrowerSummary({ date_from: dateFrom, date_to: dateTo }));
    } catch {
      showToast("error", t("toast.downloadFailed"));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, t]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(
    () =>
      sortRows(rows, sortCol, sortDir, {
        name: (r) => r.grower_name,
        deliveries: (r) => r.delivery_count,
        gross: (r) => r.total_gross_kg,
        net: (r) => r.total_net_kg,
        waste: (r) => r.total_waste_kg,
        wastePct: (r) => r.waste_pct,
        c2Cartons: (r) => r.class2_cartons,
        c2Kg: (r) => r.class2_kg,
        retKg: (r) => r.returned_kg,
      }),
    [rows, sortCol, sortDir],
  );

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadGrowerSummaryCsv({ date_from: dateFrom, date_to: dateTo });
    } catch {
      showToast("error", t("toast.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <DateRangeBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        onRefresh={load}
        loading={loading}
        onDownload={handleDownload}
        downloading={downloading}
      />
      {rows.length === 0 && !loading ? (
        <p className="text-gray-400 text-sm py-8 text-center">{t("noData")}</p>
      ) : (
        <div className="overflow-x-auto bg-white rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                {[
                  ["name", t("grower.name")],
                  ["deliveries", t("grower.deliveries")],
                  ["gross", t("grower.grossKg")],
                  ["net", t("grower.netKg")],
                  ["waste", t("grower.wasteKg")],
                  ["wastePct", t("grower.wastePct")],
                  ["c2Cartons", t("grower.class2Cartons")],
                  ["c2Kg", t("grower.class2Kg")],
                  ["retKg", t("grower.returnedKg")],
                ].map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    className={`px-3 py-2 text-left ${sortableThClass}`}
                  >
                    {label}{sortIndicator(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((r) => (
                <tr key={r.grower_name} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">
                    {r.grower_name}
                    {r.grower_code && (
                      <span className="ml-1 text-gray-400 text-xs">({r.grower_code})</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{r.delivery_count}</td>
                  <td className="px-3 py-2 text-right">{r.total_gross_kg.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{r.total_net_kg.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{r.total_waste_kg.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{r.waste_pct}%</td>
                  <td className="px-3 py-2 text-right">{r.class2_cartons}</td>
                  <td className="px-3 py-2 text-right">{r.class2_kg.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    {r.returned_kg > 0 ? (
                      <span className="text-purple-600 font-medium">{r.returned_kg.toLocaleString()}</span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── 3. Packout Tab ───────────────────────────────────────────

function PackoutTab() {
  const { t } = useTranslation("reports");
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [search, setSearch] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [data, setData] = useState<PackoutResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  // Load recent batches for selector
  useEffect(() => {
    listBatches({ limit: "100" }).then((res) => setBatches(res.items)).catch(() => {});
  }, []);

  const filteredBatches = useMemo(
    () =>
      search
        ? batches.filter(
            (b) =>
              b.batch_code.toLowerCase().includes(search.toLowerCase()) ||
              (b.grower_name || "").toLowerCase().includes(search.toLowerCase()),
          )
        : batches,
    [batches, search],
  );

  const load = useCallback(async (batchId: string) => {
    if (!batchId) return;
    setLoading(true);
    try {
      setData(await getPackout(batchId));
    } catch {
      showToast("error", t("toast.downloadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const sorted = useMemo(
    () =>
      data
        ? sortRows(data.lots, sortCol, sortDir, {
            lot: (r) => r.lot_code,
            grade: (r) => r.grade,
            size: (r) => r.size,
            cartons: (r) => r.carton_count,
            weight: (r) => r.weight_kg,
            waste: (r) => r.waste_kg,
            market: (r) => r.target_market,
          })
        : [],
    [data, sortCol, sortDir],
  );

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="text-sm flex-1 max-w-xs relative">
          <span className="text-gray-500 block mb-0.5">{t("selectBatch")}</span>
          <input
            type="text"
            value={search}
            onFocus={() => { if (!selectedBatchId) setDropdownOpen(true); }}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
            onChange={(e) => {
              setSearch(e.target.value);
              setDropdownOpen(true);
              if (selectedBatchId) {
                setSelectedBatchId("");
                setData(null);
              }
            }}
            placeholder={t("searchBatches")}
            className="border rounded px-2 py-1.5 text-sm w-full"
          />
          {dropdownOpen && !selectedBatchId && filteredBatches.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded shadow-lg max-h-56 overflow-y-auto">
              {filteredBatches.slice(0, 30).map((b) => (
                <button
                  key={b.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedBatchId(b.id);
                    setSearch(b.batch_code);
                    setDropdownOpen(false);
                    load(b.id);
                  }}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0"
                >
                  <span className="font-medium">{b.batch_code}</span>
                  <span className="text-gray-400 ml-2">{b.grower_name} — {b.fruit_type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Clear selection */}
      {selectedBatchId && (
        <button
          onClick={() => {
            setSelectedBatchId("");
            setSearch("");
            setData(null);
          }}
          className="text-xs text-gray-400 hover:text-gray-600 mb-3"
        >
          Clear selection
        </button>
      )}
      {data && (
        <>
          <div className="bg-green-50 border border-green-200 rounded px-4 py-2 mb-4 text-sm">
            <span className="font-medium text-green-800">
              {t("packout.batchHeader", { code: data.batch_code, fruit: `${data.fruit_type}${data.variety ? ` / ${data.variety}` : ""}` })}
            </span>
            <span className="text-green-600 ml-3">
              {data.net_weight_kg ? `${data.net_weight_kg} kg` : ""} — {data.status}
            </span>
          </div>
          {sorted.length === 0 && !loading ? (
            <p className="text-gray-400 text-sm py-8 text-center">{t("noData")}</p>
          ) : (
            <div className="overflow-x-auto bg-white rounded border">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    {[
                      ["lot", t("packout.lotCode")],
                      ["grade", t("packout.grade")],
                      ["size", t("packout.size")],
                      ["cartons", t("packout.cartons")],
                      ["weight", t("packout.weight")],
                      ["waste", t("packout.waste")],
                      ["market", t("packout.market")],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        className={`px-3 py-2 text-left ${sortableThClass}`}
                      >
                        {label}{sortIndicator(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sorted.map((r) => (
                    <tr key={r.lot_code} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{r.lot_code}</td>
                      <td className="px-3 py-2">{r.grade ?? "—"}</td>
                      <td className="px-3 py-2">{r.size ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{r.carton_count}</td>
                      <td className="px-3 py-2 text-right">{r.weight_kg ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{r.waste_kg}</td>
                      <td className="px-3 py-2">{r.target_market ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── 4. Performance Tab ───────────────────────────────────────

function PerformanceTab() {
  const { t } = useTranslation("reports");
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort("date", "desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getPerformanceReport({ date_from: dateFrom, date_to: dateTo }));
    } catch {
      showToast("error", t("toast.downloadFailed"));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, t]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(
    () =>
      sortRows(rows, sortCol, sortDir, {
        date: (r) => r.date,
        batches: (r) => r.batches_received,
        lots: (r) => r.lots_packed,
        pallets: (r) => r.pallets_built,
        waste: (r) => r.total_waste_kg,
        cartons: (r) => r.total_cartons,
      }),
    [rows, sortCol, sortDir],
  );

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadPerformanceCsv({ date_from: dateFrom, date_to: dateTo });
    } catch {
      showToast("error", t("toast.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <DateRangeBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        onRefresh={load}
        loading={loading}
        onDownload={handleDownload}
        downloading={downloading}
      />
      {rows.length === 0 && !loading ? (
        <p className="text-gray-400 text-sm py-8 text-center">{t("noData")}</p>
      ) : (
        <div className="overflow-x-auto bg-white rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                {[
                  ["date", t("performance.date")],
                  ["batches", t("performance.batches")],
                  ["lots", t("performance.lots")],
                  ["pallets", t("performance.pallets")],
                  ["waste", t("performance.waste")],
                  ["cartons", t("performance.cartons")],
                ].map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    className={`px-3 py-2 text-left ${sortableThClass}`}
                  >
                    {label}{sortIndicator(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((r) => (
                <tr key={r.date} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{r.date}</td>
                  <td className="px-3 py-2 text-right">{r.batches_received}</td>
                  <td className="px-3 py-2 text-right">{r.lots_packed}</td>
                  <td className="px-3 py-2 text-right">{r.pallets_built}</td>
                  <td className="px-3 py-2 text-right">{r.total_waste_kg}</td>
                  <td className="px-3 py-2 text-right">{r.total_cartons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── 5. Packing List Tab ─────────────────────────────────────

function PackingListTab() {
  const { t } = useTranslation("reports");
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [data, setData] = useState<PackingListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [view, setView] = useState<"shipping" | "traceability">("shipping");

  // Load containers for selector
  useEffect(() => {
    listContainers().then(setContainers).catch(() => {});
  }, []);

  const filteredContainers = useMemo(
    () => {
      if (!search) return containers;
      const q = search.toLowerCase();
      return containers.filter(
        (c) =>
          c.container_number.toLowerCase().includes(q) ||
          (c.shipping_container_number || "").toLowerCase().includes(q) ||
          (c.customer_name || "").toLowerCase().includes(q) ||
          (c.destination || "").toLowerCase().includes(q) ||
          (c.vessel_name || "").toLowerCase().includes(q) ||
          (c.shipping_line_name || "").toLowerCase().includes(q),
      );
    },
    [containers, search],
  );

  const load = useCallback(async (containerId: string) => {
    if (!containerId) return;
    setLoading(true);
    try {
      setData(await getPackingList(containerId));
    } catch {
      showToast("error", t("toast.downloadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleDownload = async () => {
    if (!selectedId) return;
    setDownloading(true);
    try {
      await downloadPackingListCsv(selectedId, data?.container_number);
    } catch {
      showToast("error", t("toast.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  const [generatingPdf, setGeneratingPdf] = useState(false);
  const handlePdf = async () => {
    if (!selectedId) return;
    setGeneratingPdf(true);
    try {
      const doc = await generatePackingList(selectedId, view);
      const { url } = await downloadDocument(selectedId, doc.id);
      window.open(url, "_blank");
    } catch {
      showToast("error", "Failed to generate PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 mb-4 print:hidden">
        <div className="text-sm flex-1 max-w-xs relative">
          <span className="text-gray-500 block mb-0.5">{t("selectContainer")}</span>
          <input
            type="text"
            value={search}
            onFocus={() => { if (!selectedId) setDropdownOpen(true); }}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
            onChange={(e) => {
              setSearch(e.target.value);
              setDropdownOpen(true);
              if (selectedId) {
                setSelectedId("");
                setData(null);
              }
            }}
            placeholder={t("searchContainers")}
            className="border rounded px-2 py-1.5 text-sm w-full"
          />
          {dropdownOpen && !selectedId && filteredContainers.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded shadow-lg max-h-56 overflow-y-auto">
              {filteredContainers.slice(0, 30).map((c) => (
                <button
                  key={c.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedId(c.id);
                    setSearch(c.container_number);
                    setDropdownOpen(false);
                    load(c.id);
                  }}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0"
                >
                  <span className="font-medium">{c.container_number}</span>
                  {c.shipping_container_number && (
                    <span className="text-gray-500 ml-1 text-xs font-mono">({c.shipping_container_number})</span>
                  )}
                  <span className="text-gray-400 ml-2">
                    {c.customer_name ? `${c.customer_name}` : ""}
                    {c.destination ? ` → ${c.destination}` : ""}
                  </span>
                  {(c.vessel_name || c.shipping_line_name) && (
                    <span className="text-gray-300 ml-2 text-xs">
                      {c.vessel_name || ""}{c.shipping_line_name ? ` (${c.shipping_line_name})` : ""}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        {data && (
          <>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="px-3 py-1.5 border text-sm rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {downloading ? t("downloading") : t("downloadCsv")}
            </button>
            <button
              onClick={handlePdf}
              disabled={generatingPdf}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
            >
              {generatingPdf ? "Generating..." : "PDF"}
            </button>
          </>
        )}
      </div>

      {/* Clear */}
      {selectedId && (
        <button
          onClick={() => {
            setSelectedId("");
            setSearch("");
            setData(null);
          }}
          className="text-xs text-gray-400 hover:text-gray-600 mb-3 print:hidden"
        >
          Clear selection
        </button>
      )}

      {loading && <p className="text-gray-400 text-sm py-8 text-center">Loading...</p>}

      {data && !loading && (
        <div>
          {/* View toggle */}
          <div className="flex gap-2 mb-4 print:hidden">
            <button
              onClick={() => setView("shipping")}
              className={`px-3 py-1.5 text-sm rounded border ${
                view === "shipping"
                  ? "bg-green-600 text-white border-green-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t("packingList.viewShipping")}
            </button>
            <button
              onClick={() => setView("traceability")}
              className={`px-3 py-1.5 text-sm rounded border ${
                view === "traceability"
                  ? "bg-green-600 text-white border-green-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t("packingList.viewTraceability")}
            </button>
            <span className="text-xs text-gray-400 self-center ml-1">
              {view === "shipping" ? t("packingList.shippingDesc") : t("packingList.traceabilityDesc")}
            </span>
          </div>

          {/* Container header */}
          <div className="bg-white border rounded p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div>
              <span className="text-gray-400 text-xs block">{t("packingList.container")}</span>
              <span className="font-medium">{data.container_number}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs block">{t("packingList.shippingNumber")}</span>
              <span className="font-mono text-xs">{data.shipping_container_number || "—"}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs block">{t("packingList.type")}</span>
              <span>{data.container_type}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs block">{t("packingList.seal")}</span>
              <span>{data.seal_number || "—"}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs block">{t("packingList.customer")}</span>
              <span>{data.customer_name || "—"}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs block">{t("packingList.destination")}</span>
              <span>{data.destination || "—"}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs block">{t("packingList.vessel")}</span>
              <span>{data.vessel_name || "—"}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs block">{t("packingList.voyage")}</span>
              <span>{data.voyage_number || "—"}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs block">{t("packingList.exportDate")}</span>
              <span>{data.export_date || "—"}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs block">{t("packingList.transporter")}</span>
              <span>{data.transporter_name || "—"}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs block">{t("packingList.shippingAgent")}</span>
              <span>{data.shipping_agent_name || "—"}</span>
            </div>
          </div>

          {/* Totals */}
          <div className="flex gap-4 mb-3 text-sm">
            <div className="bg-green-50 border border-green-200 rounded px-3 py-1.5">
              <span className="text-green-600 text-xs block">{t("packingList.totalPallets")}</span>
              <span className="font-bold text-green-800">{data.pallet_count}</span>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded px-3 py-1.5">
              <span className="text-blue-600 text-xs block">{t("packingList.totalCartons")}</span>
              <span className="font-bold text-blue-800">{data.total_cartons}</span>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded px-3 py-1.5">
              <span className="text-purple-600 text-xs block">{t("packingList.totalGrossWeight")}</span>
              <span className="font-bold text-purple-800">{data.total_gross_weight_kg.toLocaleString()} kg</span>
            </div>
          </div>

          {/* Shipping view — simple pallet table (compact for A4 print) */}
          {view === "shipping" && (
            <div className="overflow-x-auto bg-white rounded border">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase">
                  <tr>
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th className="px-2 py-1.5 text-left">{t("packingList.palletNo")}</th>
                    <th className="px-2 py-1.5 text-left">{t("packingList.fruitType")}</th>
                    <th className="px-2 py-1.5 text-left">{t("packingList.variety")}</th>
                    <th className="px-2 py-1.5 text-left">{t("packingList.grade")}</th>
                    <th className="px-2 py-1.5 text-left">{t("packingList.size")}</th>
                    <th className="px-2 py-1.5 text-left">{t("packingList.boxSize")}</th>
                    <th className="px-2 py-1.5 text-right">{t("packingList.boxes")}</th>
                    <th className="px-2 py-1.5 text-right">{t("packingList.netWeight")}</th>
                    <th className="px-2 py-1.5 text-right">{t("packingList.grossWeight")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.pallets.map((p, idx) => (
                    <tr key={p.pallet_number} className="hover:bg-gray-50">
                      <td className="px-2 py-1 text-gray-400">{idx + 1}</td>
                      <td className="px-2 py-1 font-medium">{p.pallet_number}</td>
                      <td className="px-2 py-1">{p.fruit_type || "—"}</td>
                      <td className="px-2 py-1">{p.variety || "—"}</td>
                      <td className="px-2 py-1">{p.grade || "—"}</td>
                      <td className="px-2 py-1">{p.size || "—"}</td>
                      <td className="px-2 py-1">{p.box_size || "—"}</td>
                      <td className="px-2 py-1 text-right">{p.boxes}</td>
                      <td className="px-2 py-1 text-right">{p.net_weight_kg ?? "—"}</td>
                      <td className="px-2 py-1 text-right">{p.gross_weight_kg ?? "—"}</td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="bg-gray-50 font-semibold text-xs">
                    <td className="px-2 py-1.5" colSpan={7}>Totals ({data.pallet_count} pallets)</td>
                    <td className="px-2 py-1.5 text-right">{data.total_cartons}</td>
                    <td className="px-2 py-1.5 text-right">
                      {data.pallets.reduce((s, p) => s + (p.net_weight_kg || 0), 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right">{data.total_gross_weight_kg.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Traceability view — pallets with grower/lot detail inline */}
          {view === "traceability" && (
            <div className="overflow-x-auto bg-white rounded border">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("packingList.palletNo")}</th>
                    <th className="px-3 py-2 text-left">{t("packingList.fruitType")}</th>
                    <th className="px-3 py-2 text-left">{t("packingList.grade")}</th>
                    <th className="px-3 py-2 text-left">{t("packingList.size")}</th>
                    <th className="px-3 py-2 text-left">{t("packingList.lotCode")}</th>
                    <th className="px-3 py-2 text-left">{t("packingList.grower")}</th>
                    <th className="px-3 py-2 text-left">{t("packingList.ggn")}</th>
                    <th className="px-3 py-2 text-left">{t("packingList.batchCode")}</th>
                    <th className="px-3 py-2 text-left">{t("packingList.harvestDate")}</th>
                    <th className="px-3 py-2 text-right">{t("packingList.cartons")}</th>
                    <th className="px-3 py-2 text-right">{t("packingList.lotWeight")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.pallets.map((p) =>
                    p.lots.length === 0 ? (
                      <tr key={p.pallet_number} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{p.pallet_number}</td>
                        <td className="px-3 py-2">{p.fruit_type || "—"}</td>
                        <td className="px-3 py-2">{p.grade || "—"}</td>
                        <td className="px-3 py-2">{p.size || "—"}</td>
                        <td className="px-3 py-2 text-gray-400" colSpan={7}>—</td>
                      </tr>
                    ) : (
                      p.lots.map((l, i) => (
                        <tr
                          key={`${p.pallet_number}-${l.lot_code}`}
                          className={`hover:bg-gray-50 ${i > 0 ? "border-t border-gray-100" : ""}`}
                        >
                          {i === 0 ? (
                            <>
                              <td className="px-3 py-2 font-medium" rowSpan={p.lots.length}>{p.pallet_number}</td>
                              <td className="px-3 py-2" rowSpan={p.lots.length}>{p.fruit_type || "—"}</td>
                              <td className="px-3 py-2" rowSpan={p.lots.length}>{p.grade || "—"}</td>
                              <td className="px-3 py-2" rowSpan={p.lots.length}>{p.size || "—"}</td>
                            </>
                          ) : null}
                          <td className="px-3 py-2">{l.lot_code}</td>
                          <td className="px-3 py-2">
                            {l.grower_name}
                            {l.grower_code && <span className="text-gray-400 text-xs ml-1">({l.grower_code})</span>}
                          </td>
                          <td className="px-3 py-2 text-xs">{l.grower_ggn || "—"}</td>
                          <td className="px-3 py-2">{l.batch_code}</td>
                          <td className="px-3 py-2">{l.harvest_date || "—"}</td>
                          <td className="px-3 py-2 text-right">{l.carton_count}</td>
                          <td className="px-3 py-2 text-right">{l.weight_kg ?? "—"}</td>
                        </tr>
                      ))
                    ),
                  )}
                  {/* Totals row */}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-3 py-2" colSpan={9}>Totals ({data.pallet_count} pallets)</td>
                    <td className="px-3 py-2 text-right">{data.total_cartons}</td>
                    <td className="px-3 py-2 text-right">{data.total_gross_weight_kg.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
