// src/pages/ArchiveCenter/ArchiveCenter.tsx
import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "../../layouts/DashboardLayout";
import Meta from "../../utils/Meta";
import Button from "../../components/common/Button";
import PaginationControls from "../../components/common/PaginationControls";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/common/Table";
import FilterHeader from "../../components/filters/FilterHeader";

import {
  getArchivedVisitors,
  getArchivedLogs,
  getArchivedEntries,
  getVisitorsCsvExportUrl,
  getLogsCsvExportUrl,
  getEntriesCsvExportUrl,
  getArchivePdfReportUrl,
  type Visitor, type VisitorLogDTO,
  type VisitorLogEntryDTO,
  getAllStations,
  type Station,
} from "../../api/Index";

import {
  VISITOR_TYPE_FILTER_VALUES,
  normalizeVisitorType,
} from "../../constants/visitorTypes";
import { GENDER_OPTIONS } from "../../constants/genderOptions";
import { ID_TYPE_OPTIONS, normalizeIdType } from "../../constants/idTypes";
import { PURPOSE_OPTIONS } from "../../constants/purposeOptions";

import { sortGateAware } from "../../utils/locationSort";

type ViewMode = "EXPORTS" | "VISITORS" | "LOGS" | "ENTRIES";

/**
 * Normalizes a date-ish string to yyyy-MM-dd (or null).
 * Works with ISO-like strings too.
 */
function toDateKey(isoLike?: string | null): string | null {
  if (!isoLike) return null;
  return isoLike.slice(0, 10);
}

/**
 * Inclusive range check on yyyy-MM-dd strings.
 * If from/to are undefined, they are ignored.
 */
function isWithinRange(
  dateKey: string | null,
  from?: string,
  to?: string
): boolean {
  if (!dateKey) return true;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
}

function formatDateTimeLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `${month}-${day}-${year} ${hours}:${minutes}`;
}

const todayKey = new Date().toISOString().slice(0, 10);

export default function ArchiveCenter() {
  Meta({ title: "Archive Center - iVisit" });

  const [viewMode, setViewMode] = useState<ViewMode>("EXPORTS");

  const [archivedVisitors, setArchivedVisitors] = useState<Visitor[]>([]);
  const [archivedLogs, setArchivedLogs] = useState<VisitorLogDTO[]>([]);
  const [archivedEntries, setArchivedEntries] = useState<VisitorLogEntryDTO[]>(
    []
  );
  const [stations, setStations] = useState<Station[]>([]);

  const [search, setSearch] = useState("");

  const [visitorTypeFilter, setVisitorTypeFilter] = useState<string>("all");
  const [idTypeFilter, setIdTypeFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<string>("all");

  const [logStatusFilter, setLogStatusFilter] = useState<string>("all");
  const [logLocationFilter, setLogLocationFilter] = useState<string>("all");
  const [logGuardFilter, setLogGuardFilter] = useState<string>("all");
  const [logPurposeFilter, setLogPurposeFilter] = useState<string>("all");
  const [logPassFilter, setLogPassFilter] =
    useState<"all" | "withPass" | "withoutPass">("all");

  const [entryStationFilter, setEntryStationFilter] = useState<string>("all");
  const [entryGuardFilter, setEntryGuardFilter] = useState<string>(
    "all"
  );
  const [entryActionFilter, setEntryActionFilter] = useState<string>("all");
  const [entryVisitorTypeFilter, setEntryVisitorTypeFilter] =
    useState<string>("all");
  const [entryPassFilter, setEntryPassFilter] =
    useState<"all" | "withPass" | "withoutPass">("all");

  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Shared client-side pagination
  const [page, setPage] = useState(0);      // 0-based
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [visitorsData, logsData, entriesData, stationsData] =
          await Promise.all([
            getArchivedVisitors(),
            getArchivedLogs(),
            getArchivedEntries(),
            getAllStations(),
          ]);

        setArchivedVisitors(visitorsData);
        setArchivedLogs(logsData);
        setArchivedEntries(entriesData);
        setStations(stationsData);
        setError(null);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load archives.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const earliestArchiveDate = useMemo(() => {
    const dates: string[] = [];

    archivedVisitors.forEach((v) => {
      const key =
        toDateKey(v.archivedAt ?? null) ?? toDateKey(v.createdAt ?? null);
      if (key) dates.push(key);
    });

    archivedLogs.forEach((l) => {
      const key =
        toDateKey(l.archivedAt ?? null) ?? toDateKey(l.date ?? null);
      if (key) dates.push(key);
    });

    archivedEntries.forEach((e) => {
      const key =
        toDateKey(e.archivedAt ?? null) ?? toDateKey(e.timestamp ?? null);
      if (key) dates.push(key);
    });

    if (dates.length === 0) return null;

    return dates.reduce((min, d) => (d < min ? d : min), dates[0]);
  }, [archivedVisitors, archivedLogs, archivedEntries]);

  const visitorTypeOptions = VISITOR_TYPE_FILTER_VALUES;

  const entryStationOptions = useMemo(() => {
    if (!stations.length) return [];
    const names = stations
      .map((s) => (s.name || "").trim())
      .filter((n) => n && n !== "N/A");
    const unique = Array.from(new Set(names));
    return sortGateAware(unique);
  }, [stations]);

  const entryGuardOptions = useMemo(() => {
    const set = new Set<string>();
    archivedEntries.forEach((e) => {
      const g = (e.guardName ?? "").trim();
      if (g) set.add(g);
    });
    return Array.from(set).sort();
  }, [archivedEntries]);

  const logLocationOptions = useMemo(() => {
    const names = archivedLogs
      .map((l) => (l.location ?? "").trim())
      .filter((n) => n);
    const unique = Array.from(new Set(names));
    return sortGateAware(unique);
  }, [archivedLogs]);

  const logGuardOptions = useMemo(() => {
    const set = new Set<string>();
    archivedLogs.forEach((l) => {
      const g = (l.loggedBy ?? "").trim();
      if (g) set.add(g);
    });
    return Array.from(set).sort();
  }, [archivedLogs]);

  const logStatusOptions = useMemo(() => {
    const set = new Set<string>();
    archivedLogs.forEach((l) => {
      const s = (l.status ?? "").trim();
      if (s) set.add(s);
    });
    return Array.from(set).sort();
  }, [archivedLogs]);

  const entryActionOptions = useMemo(() => {
    const set = new Set<string>();
    archivedEntries.forEach((e) => {
      const a = (e.action ?? "").trim();
      if (a) set.add(a);
    });
    return Array.from(set).sort();
  }, [archivedEntries]);

  const handleFromDateChange = (raw: string) => {
    if (!raw) {
      setFromDate("");
      setPage(0);
      return;
    }

    let val = raw;

    if (earliestArchiveDate && val < earliestArchiveDate) {
      val = earliestArchiveDate;
    }

    if (val > todayKey) {
      val = todayKey;
    }

    if (toDate && val > toDate) {
      setToDate(val);
    }

    setFromDate(val);
    setPage(0);
  };

  const handleToDateChange = (raw: string) => {
    if (!raw) {
      setToDate("");
      setPage(0);
      return;
    }

    let val = raw;

    if (earliestArchiveDate && val < earliestArchiveDate) {
      val = earliestArchiveDate;
    }

    if (val > todayKey) {
      val = todayKey;
    }

    if (fromDate && val < fromDate) {
      setFromDate(val);
    }

    setToDate(val);
    setPage(0);
  };

  const filteredVisitors = useMemo(() => {
    const from = fromDate || undefined;
    const to = toDate || undefined;

    const sorted = archivedVisitors.slice().sort((a, b) => {
      const aId = a.visitorID ?? 0;
      const bId = b.visitorID ?? 0;
      return bId - aId; // higher ID = earlier in the list
    });

    return sorted.filter((v) => {
      const dateKey =
        toDateKey(v.archivedAt ?? null) ?? toDateKey(v.createdAt ?? null);
      if (!isWithinRange(dateKey, from, to)) return false;

      const normalizedType = normalizeVisitorType(v.visitorType);
      const normalizedIdType = normalizeIdType(v.idType);
      const term = search.trim().toLowerCase();

      // Visitor type filter
      if (visitorTypeFilter !== "all") {
        if (!normalizedType || normalizedType !== visitorTypeFilter) return false;
      }

      // ID Type filter
      if (idTypeFilter !== "all") {
        if (!normalizedIdType || normalizedIdType !== idTypeFilter) return false;
      }

      // Gender filter
      if (genderFilter !== "all") {
        const g = (v.gender ?? "").trim().toLowerCase();
        if (!g || g !== genderFilter.toLowerCase()) return false;
      }

      if (!term) return true;

      const fields = [
        v.visitorName ?? "",
        v.idNumber ?? "",
        v.idType ?? "",
        normalizedType,
        v.gender ?? "",
      ];

      return fields.some((f) => f.toLowerCase().includes(term));
    });
  }, [
    archivedVisitors,
    search,
    visitorTypeFilter,
    idTypeFilter,
    genderFilter,
    fromDate,
    toDate,
  ]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    const from = fromDate || undefined;
    const to = toDate || undefined;

    const sorted = archivedLogs.slice().sort((a, b) => {
      const aId = a.visitorLogID ?? 0;
      const bId = b.visitorLogID ?? 0;
      return bId - aId; // higher ID = earlier in the list
    });

    return sorted.filter((l) => {
      const dateKey =
        toDateKey(l.archivedAt ?? null) ?? toDateKey(l.date ?? null);
      if (!isWithinRange(dateKey, from, to)) return false;

      const status = (l.status ?? "").trim();
      const location = (l.location ?? "").trim();
      const guard = (l.loggedBy ?? "").trim();
      const purpose = (l.purposeOfVisit ?? "").trim();
      const hasPass = !!(l.passNo && l.passNo.trim());

      if (logStatusFilter !== "all") {
        if (!status || status !== logStatusFilter) return false;
      }

      if (logLocationFilter !== "all") {
        if (!location || location !== logLocationFilter) return false;
      }

      if (logGuardFilter !== "all") {
        if (!guard || guard !== logGuardFilter) return false;
      }

      if (logPurposeFilter !== "all") {
        if (!purpose || purpose !== logPurposeFilter) return false;
      }

      if (logPassFilter === "withPass" && !hasPass) return false;
      if (logPassFilter === "withoutPass" && hasPass) return false;

      if (!term) return true;

      const fields = [
        l.fullName ?? "",
        l.purposeOfVisit ?? "",
        l.firstLocation ?? "",
        l.location ?? "",
        l.loggedBy ?? "",
        l.passNo ?? "",
        l.status ?? "",
      ];

      return fields.some((f) => f.toLowerCase().includes(term));
    });
  }, [
    archivedLogs,
    search,
    fromDate,
    toDate,
    logStatusFilter,
    logLocationFilter,
    logGuardFilter,
    logPurposeFilter,
    logPassFilter,
  ]);

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    const from = fromDate || undefined;
    const to = toDate || undefined;

    const sorted = archivedEntries.slice().sort((a, b) => {
      const aId = a.entryId ?? 0;
      const bId = b.entryId ?? 0;
      return bId - aId; // higher ID = earlier in the list
    });

    return sorted.filter((e) => {
      const dateKey =
        toDateKey(e.archivedAt ?? null) ?? toDateKey(e.timestamp ?? null);
      if (!isWithinRange(dateKey, from, to)) return false;

      if (entryStationFilter !== "all") {
        const station = (e.stationName ?? "").trim().toLowerCase();
        if (!station || station !== entryStationFilter.trim().toLowerCase()) {
          return false;
        }
      }

      if (entryGuardFilter !== "all") {
        const guard = (e.guardName ?? "").trim().toLowerCase();
        if (!guard || guard !== entryGuardFilter.trim().toLowerCase()) {
          return false;
        }
      }

      const action = (e.action ?? "").trim();
      if (entryActionFilter !== "all") {
        if (!action || action !== entryActionFilter) return false;
      }

      const entryType = normalizeVisitorType(e.visitorType as any);
      if (entryVisitorTypeFilter !== "all") {
        if (!entryType || entryType !== entryVisitorTypeFilter) return false;
      }

      const passLabel = (e.recordedPassDisplayCode ??
        e.passNo ??
        "") as string;
      const hasPass = !!passLabel.trim();

      if (entryPassFilter === "withPass" && !hasPass) return false;
      if (entryPassFilter === "withoutPass" && hasPass) return false;

      if (!term) return true;

      const fields = [
        e.visitorName ?? "",
        e.stationName ?? "",
        e.guardName ?? "",
        e.passNo ?? "",
        e.recordedPassDisplayCode ?? "",
        e.recordedPassOrigin ?? "",
        e.visitorType ?? "",
        e.action ?? "",
      ];

      return fields.some((f) => f.toLowerCase().includes(term));
    });
  }, [
    archivedEntries,
    search,
    entryStationFilter,
    entryGuardFilter,
    entryActionFilter,
    entryVisitorTypeFilter,
    entryPassFilter,
    fromDate,
    toDate,
  ]);

  // PAGINATION PER VIEW (all use shared page/pageSize)

  // Visitors
  const totalVisitorElements = filteredVisitors.length;
  const totalVisitorPages =
    totalVisitorElements === 0
      ? 0
      : Math.ceil(totalVisitorElements / pageSize);

  const currentVisitorPage =
    totalVisitorPages === 0 ? 0 : Math.min(page, totalVisitorPages - 1);

  const pagedVisitors = filteredVisitors.slice(
    currentVisitorPage * pageSize,
    currentVisitorPage * pageSize + pageSize
  );

  // Logs
  const totalLogElements = filteredLogs.length;
  const totalLogPages =
    totalLogElements === 0 ? 0 : Math.ceil(totalLogElements / pageSize);

  const currentLogPage =
    totalLogPages === 0 ? 0 : Math.min(page, totalLogPages - 1);

  const pagedLogs = filteredLogs.slice(
    currentLogPage * pageSize,
    currentLogPage * pageSize + pageSize
  );

  // Entries
  const totalEntryElements = filteredEntries.length;
  const totalEntryPages =
    totalEntryElements === 0 ? 0 : Math.ceil(totalEntryElements / pageSize);

  const currentEntryPage =
    totalEntryPages === 0 ? 0 : Math.min(page, totalEntryPages - 1);

  const pagedEntries = filteredEntries.slice(
    currentEntryPage * pageSize,
    currentEntryPage * pageSize + pageSize
  );

  const visitorsCsvUrl = useMemo(
    () => getVisitorsCsvExportUrl(fromDate || undefined, toDate || undefined),
    [fromDate, toDate]
  );
  const logsCsvUrl = useMemo(
    () => getLogsCsvExportUrl(fromDate || undefined, toDate || undefined),
    [fromDate, toDate]
  );
  const entriesCsvUrl = useMemo(
    () => getEntriesCsvExportUrl(fromDate || undefined, toDate || undefined),
    [fromDate, toDate]
  );
  const pdfReportUrl = useMemo(
    () => getArchivePdfReportUrl(fromDate || undefined, toDate || undefined),
    [fromDate, toDate]
  );

  if (loading) {
    return (
      <DashboardLayout>
        <p className="text-gray-400 text-center mt-8">Loading archives...</p>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <p className="text-red-400 text-center mt-8">{error}</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <FilterHeader
        title="Archive Center"
        subtitle="View and export archived visitors, visitor logs, and movement entries for audits and reports. Leave the date range blank to include all archived records."
        searchValue={viewMode === "EXPORTS" ? "" : search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(0);
        }}
        searchPlaceholder={
          viewMode === "VISITORS"
            ? "Filter by name, ID, type..."
            : viewMode === "LOGS"
              ? "Filter by name, purpose, location..."
              : viewMode === "ENTRIES"
                ? "Filter by name, station, guard..."
                : "Search is not used for exports"
        }
        filters={
          viewMode === "VISITORS"
            ? [
              {
                id: "archiveRange",
                label: "Archive range",
                type: "dateRange",
                fromValue: fromDate,
                toValue: toDate,
                min: earliestArchiveDate ?? undefined,
                max: todayKey,
                onFromChange: (val: string) => handleFromDateChange(val),
                onToChange: (val: string) => handleToDateChange(val),
              },
              {
                id: "visitorType",
                label: "Visitor type",
                type: "select",
                value: visitorTypeFilter,
                options: [
                  { label: "All", value: "all" },
                  ...visitorTypeOptions.map((t) => ({
                    label: t,
                    value: t,
                  })),
                ],
                onChange: (value: string) => {
                  setVisitorTypeFilter(value);
                  setPage(0);
                },
              },
              {
                id: "idType",
                label: "ID Type",
                type: "select",
                value: idTypeFilter,
                options: [
                  { label: "All", value: "all" },
                  ...ID_TYPE_OPTIONS.filter((o) => o.value).map((o) => ({
                    label: o.label,
                    value: o.value,
                  })),
                ],
                onChange: (value: string) => {
                  setIdTypeFilter(value);
                  setPage(0);
                },
              },
              {
                id: "gender",
                label: "Gender",
                type: "select",
                value: genderFilter,
                options: [
                  { label: "All", value: "all" },
                  ...GENDER_OPTIONS.filter((o) => o.value).map((o) => ({
                    label: o.label,
                    value: o.value,
                  })),
                ],
                onChange: (value: string) => {
                  setGenderFilter(value);
                  setPage(0);
                },
              },
            ]
            : viewMode === "LOGS"
              ? [
                {
                  id: "archiveRange",
                  label: "Archive range",
                  type: "dateRange",
                  fromValue: fromDate,
                  toValue: toDate,
                  min: earliestArchiveDate ?? undefined,
                  max: todayKey,
                  onFromChange: (val: string) => handleFromDateChange(val),
                  onToChange: (val: string) => handleToDateChange(val),
                },
                {
                  id: "status",
                  label: "Status",
                  type: "select",
                  value: logStatusFilter,
                  options: [
                    { label: "All", value: "all" },
                    ...logStatusOptions.map((s) => ({ label: s, value: s })),
                  ],
                  onChange: (value: string) => {
                    setLogStatusFilter(value);
                    setPage(0);
                  },
                },
                {
                  id: "location",
                  label: "Location",
                  type: "select",
                  value: logLocationFilter,
                  options: [
                    { label: "All", value: "all" },
                    ...logLocationOptions.map((loc) => ({
                      label: loc,
                      value: loc,
                    })),
                  ],
                  onChange: (value: string) => {
                    setLogLocationFilter(value);
                    setPage(0);
                  },
                },
                {
                  id: "guard",
                  label: "Guard",
                  type: "select",
                  value: logGuardFilter,
                  options: [
                    { label: "All", value: "all" },
                    ...logGuardOptions.map((g) => ({ label: g, value: g })),
                  ],
                  onChange: (value: string) => {
                    setLogGuardFilter(value);
                    setPage(0);
                  },
                },
                {
                  id: "purpose",
                  label: "Purpose",
                  type: "select",
                  value: logPurposeFilter,
                  options: [
                    { label: "All", value: "all" },
                    ...PURPOSE_OPTIONS.filter((o) => o.value).map((o) => ({
                      label: o.label,
                      value: o.value,
                    })),
                  ],
                  onChange: (value: string) => {
                    setLogPurposeFilter(value);
                    setPage(0);
                  },
                },
                {
                  id: "pass",
                  label: "Pass",
                  type: "select",
                  value: logPassFilter,
                  options: [
                    { label: "All", value: "all" },
                    { label: "With pass only", value: "withPass" },
                    { label: "Without pass only", value: "withoutPass" },
                  ],
                  onChange: (value: string) => {
                    setLogPassFilter(
                      value as "all" | "withPass" | "withoutPass"
                    );
                    setPage(0);
                  },
                },
              ]
              : viewMode === "ENTRIES"
                ? [
                  {
                    id: "archiveRange",
                    label: "Archive range",
                    type: "dateRange",
                    fromValue: fromDate,
                    toValue: toDate,
                    min: earliestArchiveDate ?? undefined,
                    max: todayKey,
                    onFromChange: (val: string) => handleFromDateChange(val),
                    onToChange: (val: string) => handleToDateChange(val),
                  },
                  {
                    id: "station",
                    label: "Station",
                    type: "select",
                    value: entryStationFilter,
                    options: [
                      { label: "All", value: "all" },
                      ...entryStationOptions.map((s) => ({
                        label: s,
                        value: s,
                      })),
                    ],
                    onChange: (value: string) => {
                      setEntryStationFilter(value);
                      setPage(0);
                    },
                  },
                  {
                    id: "guard",
                    label: "Guard",
                    type: "select",
                    value: entryGuardFilter,
                    options: [
                      { label: "All", value: "all" },
                      ...entryGuardOptions.map((g) => ({ label: g, value: g })),
                    ],
                    onChange: (value: string) => {
                      setEntryGuardFilter(value);
                      setPage(0);
                    },
                  },
                  {
                    id: "action",
                    label: "Action",
                    type: "select",
                    value: entryActionFilter,
                    options: [
                      { label: "All", value: "all" },
                      ...entryActionOptions.map((a) => ({ label: a, value: a })),
                    ],
                    onChange: (value: string) => {
                      setEntryActionFilter(value);
                      setPage(0);
                    },
                  },
                  {
                    id: "visitorType",
                    label: "Visitor type",
                    type: "select",
                    value: entryVisitorTypeFilter,
                    options: [
                      { label: "All", value: "all" },
                      ...visitorTypeOptions.map((t) => ({
                        label: t,
                        value: t,
                      })),
                    ],
                    onChange: (value: string) => {
                      setEntryVisitorTypeFilter(value);
                      setPage(0);
                    },
                  },
                  {
                    id: "pass",
                    label: "Pass",
                    type: "select",
                    value: entryPassFilter,
                    options: [
                      { label: "All", value: "all" },
                      { label: "With pass only", value: "withPass" },
                      { label: "Without pass only", value: "withoutPass" },
                    ],
                    onChange: (value: string) => {
                      setEntryPassFilter(
                        value as "all" | "withPass" | "withoutPass"
                      );
                      setPage(0);
                    },
                  },
                ]
                : [
                  {
                    id: "archiveRange",
                    label: "Archive range",
                    type: "dateRange",
                    fromValue: fromDate,
                    toValue: toDate,
                    min: earliestArchiveDate ?? undefined,
                    max: todayKey,
                    onFromChange: (val: string) => handleFromDateChange(val),
                    onToChange: (val: string) => handleToDateChange(val),
                  },
                ]
        }
        actions={
          <div className="inline-flex bg-slate-800 rounded-md overflow-hidden">
            {[
              { key: "EXPORTS", label: "Exports" },
              { key: "VISITORS", label: "Visitors" },
              { key: "LOGS", label: "Logs" },
              { key: "ENTRIES", label: "Entries" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setViewMode(tab.key as ViewMode);
                  setPage(0);
                }}
                className={`px-3 py-1 text-xs border-r border-slate-700 last:border-r-0 ${viewMode === tab.key
                    ? "bg-primary text-white"
                    : "text-slate-300 hover:bg-slate-700"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      />

      {viewMode === "EXPORTS" && (
        <div className="space-y-4">
          <div className="border border-slate-700 rounded-lg p-4 bg-slate-900/40">
            <p className="text-sm font-semibold mb-2">CSV Exports</p>
            <p className="text-xs text-slate-400 mb-3">
              Generate CSV files directly from archived data for the selected
              date range.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={visitorsCsvUrl} target="_blank" rel="noreferrer">
                <Button variation="secondary" className="text-xs px-3 py-1.5">
                  Download Visitors CSV
                </Button>
              </a>
              <a href={logsCsvUrl} target="_blank" rel="noreferrer">
                <Button variation="secondary" className="text-xs px-3 py-1.5">
                  Download Logs CSV
                </Button>
              </a>
              <a href={entriesCsvUrl} target="_blank" rel="noreferrer">
                <Button variation="secondary" className="text-xs px-3 py-1.5">
                  Download Entries CSV
                </Button>
              </a>
            </div>
          </div>

          <div className="border border-slate-700 rounded-lg p-4 bg-slate-900/40">
            <p className="text-sm font-semibold mb-2">PDF Report</p>
            <p className="text-xs text-slate-400 mb-3">
              Generate a combined PDF report summarizing archived visitors,
              logs, and entries for the selected range.
            </p>
            <a href={pdfReportUrl} target="_blank" rel="noreferrer">
              <Button className="text-xs px-3 py-1.5">Download PDF Report</Button>
            </a>
          </div>
        </div>
      )}

      {viewMode === "VISITORS" && (
        <>
          <Table>
            <Thead>
              <Tr>
                <Th>Visitor</Th>
                <Th>Full Name</Th>
                <Th>Visitor Type</Th>
                <Th>Gender</Th>
                <Th>ID Type</Th>
                <Th>ID Number</Th>
                <Th>Date of Birth</Th>
                <Th>Registered At</Th>
                <Th>Archived At</Th>
              </Tr>
            </Thead>
            <Tbody>
              {pagedVisitors.map((v) => (
                <Tr key={v.visitorID}>
                  <Td>{v.visitorID}</Td>
                  <Td>{v.visitorName}</Td>
                  <Td>{v.visitorType ?? "N/A"}</Td>
                  <Td>{v.gender ?? "N/A"}</Td>
                  <Td>{v.idType ?? "N/A"}</Td>
                  <Td>{v.idNumber ?? "N/A"}</Td>
                  <Td>{v.dateOfBirth ?? "—"}</Td>
                  <Td>{formatDateTimeLabel(v.createdAt)}</Td>
                  <Td>{formatDateTimeLabel(v.archivedAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <PaginationControls
            page={currentVisitorPage}
            pageSize={pageSize}
            totalElements={totalVisitorElements}
            totalPages={totalVisitorPages}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(0);
            }}
          />
        </>
      )}

      {viewMode === "LOGS" && (
        <>
          <Table>
            <Thead>
              <Tr>
                <Th>Log ID</Th>
                <Th>Full Name</Th>
                <Th>ID Type</Th>
                <Th>Pass No</Th>
                <Th>Status</Th>
                <Th>First Location</Th>
                <Th>Last Location</Th>
                <Th>Purpose</Th>
                <Th>Logged By</Th>
                <Th>Date</Th>
                <Th>Time</Th>
                <Th>Archived At</Th>
              </Tr>
            </Thead>
            <Tbody>
              {pagedLogs.map((log) => (
                <Tr key={log.visitorLogID}>
                  <Td>{log.visitorLogID}</Td>
                  <Td>{log.fullName}</Td>
                  <Td>{log.idType}</Td>
                  <Td>{log.passNo}</Td>
                  <Td>{log.status ?? "N/A"}</Td>
                  <Td>{log.firstLocation ?? "—"}</Td>
                  <Td>{log.location}</Td>
                  <Td>{log.purposeOfVisit}</Td>
                  <Td>{log.loggedBy}</Td>
                  <Td>{log.date}</Td>
                  <Td>{log.time}</Td>
                  <Td>{formatDateTimeLabel(log.archivedAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <PaginationControls
            page={currentLogPage}
            pageSize={pageSize}
            totalElements={totalLogElements}
            totalPages={totalLogPages}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(0);
            }}
          />
        </>
      )}

      {viewMode === "ENTRIES" && (
        <>
          <Table>
            <Thead>
              <Tr>
                <Th>Entry ID</Th>
                <Th>Log ID</Th>
                <Th>Visitor Name</Th>
                <Th>Visitor Type</Th>
                <Th>Station</Th>
                <Th>Guard</Th>
                <Th>Pass No</Th>
                <Th>Timestamp</Th>
                <Th>Archived At</Th>
              </Tr>
            </Thead>
            <Tbody>
              {pagedEntries.map((e) => (
                <Tr key={e.entryId}>
                  <Td>{e.entryId}</Td>
                  <Td>{e.visitorLogId}</Td>
                  <Td>{e.visitorName}</Td>
                  <Td>{e.visitorType ?? "N/A"}</Td>
                  <Td>{e.stationName}</Td>
                  <Td>{e.guardName}</Td>
                  <Td>{e.passNo ?? "—"}</Td>
                  <Td>{formatDateTimeLabel(e.timestamp)}</Td>
                  <Td>{formatDateTimeLabel(e.archivedAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <PaginationControls
            page={currentEntryPage}
            pageSize={pageSize}
            totalElements={totalEntryElements}
            totalPages={totalEntryPages}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(0);
            }}
          />
        </>
      )}
    </DashboardLayout>
  );
}
