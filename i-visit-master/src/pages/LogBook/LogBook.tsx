// src/pages/LogBook/LogBook.tsx
import { useEffect, useState, useMemo } from "react";
import Button from "../../components/common/Button";
import DashboardLayout from "../../layouts/DashboardLayout";
import Meta from "../../utils/Meta";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/common/Table";
import Modal from "../../components/common/Modal";
import PaginationControls from "../../components/common/PaginationControls";

import {
  getAllLogs,
  getActiveLogs,
  getAllLogEntries,
  type VisitorLogDTO,
  type VisitorLogEntryDTO,
  getAllStations,
  type Station,
} from "../../api/Index";

import FilterHeader from "../../components/filters/FilterHeader";
import { PURPOSE_OPTIONS } from "../../constants/purposeOptions";
import { sortGateAware } from "../../utils/locationSort";

interface LogStats {
  active: number;
  uniqueToday: number;
  frequentBuilding: string;
  highestGate: string;
  uniqueWeek: number;
  uniqueMonth: number;
}

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

export default function LogBook() {
  Meta({ title: "Log Book - iVisit" });

  const [data, setData] = useState<VisitorLogDTO[]>([]);
  const [activeLogIds, setActiveLogIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<"all" | "active" | "inactive">("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [stations, setStations] = useState<Station[]>([]);
  const [guardFilter, setGuardFilter] = useState<string>("all");
  const [purposeFilter, setPurposeFilter] = useState<string>("all");
  const [passFilter, setPassFilter] = useState<"all" | "withPass" | "withoutPass">("all");

  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // log details modal state
  const [logEntries, setLogEntries] = useState<VisitorLogEntryDTO[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<VisitorLogDTO | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<VisitorLogEntryDTO[]>([]);

  // Client-side pagination
  const [page, setPage] = useState(0);      // 0-based
  const [pageSize, setPageSize] = useState(25);

  // FETCH DATA
  useEffect(() => {
    async function fetchLogs() {
      try {
        setLoading(true);
        const [allLogs, activeLogs, stationsData, entriesData] = await Promise.all([
          getAllLogs(),
          getActiveLogs(),
          getAllStations(),
          getAllLogEntries(),
        ]);

        setData(allLogs);
        setActiveLogIds(activeLogs.map((l) => l.visitorLogID));
        setStations(stationsData);
        setLogEntries(entriesData);
      } catch (err) {
        console.error(err);
        setError("Failed to load visitor logs.");
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, []);

  // Helper: status of a log using VisitorLog.status with fallback
  const isLogActive = (log: VisitorLogDTO) => {
    const status = (log.status ?? "").toUpperCase();

    if (status === "ACTIVE" || status === "OVERSTAY") return true;
    if (status && status !== "ACTIVE" && status !== "OVERSTAY") return false;

    return activeLogIds.includes(log.visitorLogID);
  };

  const firstPassByLogId = useMemo(() => {
    const map: Record<number, string | null> = {};

    logEntries
      .slice()
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      .forEach((entry) => {
        if (entry.visitorLogId == null) return;

        const label = entry.recordedPassDisplayCode ?? entry.passNo;
        if (!label) return;

        if (map[entry.visitorLogId] != null) return;

        map[entry.visitorLogId] = label;
      });

    return map;
  }, [logEntries]);

  const endTimestampByLogId = useMemo(() => {
    const map: Record<number, string> = {};

    logEntries.forEach((entry) => {
      if (entry.visitorLogId == null) return;
      const existing = map[entry.visitorLogId];
      if (!existing) {
        map[entry.visitorLogId] = entry.timestamp;
        return;
      }

      const existingTime = new Date(existing).getTime();
      const currentTime = new Date(entry.timestamp).getTime();
      if (currentTime > existingTime) {
        map[entry.visitorLogId] = entry.timestamp;
      }
    });

    return map;
  }, [logEntries]);

  const openDetails = (log: VisitorLogDTO) => {
    const entriesForLog = logEntries
      .filter((e) => e.visitorLogId === log.visitorLogID)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

    setSelectedLog(log);
    setSelectedEntries(entriesForLog);
    setDetailsOpen(true);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setSelectedLog(null);
    setSelectedEntries([]);
  };

  // unique locations for filter
  const locationOptions = useMemo(() => {
    if (!stations.length) return [];

    const names = stations
      .map((s) => (s.name || "").trim())
      .filter((n) => n && n !== "N/A");

    const unique = Array.from(new Set(names));

    return sortGateAware(unique);
  }, [stations]);

  const earliestLogDate = useMemo(() => {
    if (!data.length) return null;

    const dates = data
      .map((d) => (d.date || "").slice(0, 10))
      .filter(Boolean);

    if (!dates.length) return null;
    return dates.reduce((min, d) => (d < min ? d : min), dates[0]);
  }, [data]);

  const guardOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach((d) => {
      const name = (d.loggedBy ?? "").trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [data]);


  const handleFromDateChange = (raw: string) => {
    if (!raw) {
      setFromDate("");
      setPage(0);
      return;
    }

    let val = raw;

    if (earliestLogDate && val < earliestLogDate) {
      val = earliestLogDate;
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

    if (earliestLogDate && val < earliestLogDate) {
      val = earliestLogDate;
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

  // FILTERED DATA
  const filteredLogs = useMemo(() => {
    const term = search.toLowerCase();
    const from = fromDate || undefined;
    const to = toDate || undefined;

    const sorted = data.slice().sort((a, b) => {
      const aTs = endTimestampByLogId[a.visitorLogID] ?? a.date ?? "";
      const bTs = endTimestampByLogId[b.visitorLogID] ?? b.date ?? "";

      const aTime = new Date(aTs).getTime();
      const bTime = new Date(bTs).getTime();

      // newest first; invalid dates go last
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;

      return bTime - aTime;
    });

    return sorted.filter((e) => {
      const logIsActive = isLogActive(e);
      const location = (e.location || "").trim().toLowerCase();

      const dateKey = e.date ? e.date.slice(0, 10) : null;

      // 0) Date range filter
      if (!isWithinRange(dateKey, from, to)) return false;

      // 1) Status filter
      if (statusFilter === "active" && !logIsActive) return false;
      if (statusFilter === "inactive" && logIsActive) return false;

      // 2) Location filter (latest location)
      if (locationFilter !== "all") {
        if (!location || location !== locationFilter.trim().toLowerCase())
          return false;
      }

      // 3) Guard filter
      if (guardFilter !== "all") {
        const loggedBy = (e.loggedBy ?? "").trim();
        if (!loggedBy || loggedBy !== guardFilter) return false;
      }

      // 4) Purpose filter (canonical string match)
      if (purposeFilter !== "all") {
        const purpose = (e.purposeOfVisit ?? "").trim();
        if (!purpose || purpose !== purposeFilter) return false;
      }

      // 5) Has pass / no pass filter
      const firstPass = firstPassByLogId[e.visitorLogID] ?? e.passNo ?? "";
      const hasPass = !!firstPass && firstPass !== "—";

      if (passFilter === "withPass" && !hasPass) return false;
      if (passFilter === "withoutPass" && hasPass) return false;

      // 6) Text search
      if (!term) return true;

      const fields = [
        e.fullName ?? "",
        e.idType ?? "",
        e.passNo ?? "",
        e.location ?? "",
        e.purposeOfVisit ?? "",
        e.loggedBy ?? "",
        e.date ?? "",
        e.time ?? "",
      ];

      return fields.some((field) => field.toLowerCase().includes(term));
    });
  }, [
    data,
    search,
    statusFilter,
    locationFilter,
    guardFilter,
    purposeFilter,
    passFilter,
    activeLogIds,
    fromDate,
    toDate,
    firstPassByLogId,
    endTimestampByLogId,
  ]);

  // PAGINATION DERIVED FROM FILTERED LOGS
  const totalElements = filteredLogs.length;
  const totalPages =
    totalElements === 0 ? 0 : Math.ceil(totalElements / pageSize);

  const currentPage = totalPages === 0 ? 0 : Math.min(page, totalPages - 1);

  const pagedLogs = filteredLogs.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize
  );

  // STATS
  const stats = useMemo<LogStats | null>(() => {
    if (data.length === 0) return null;

    const today = new Date().toISOString().slice(0, 10);

    const todayLogs = data.filter((d) => d.date === today);
    const todayActiveLogs = todayLogs.filter((d) => isLogActive(d));

    const uniqueToday = new Set(todayLogs.map((d) => d.fullName)).size;
    const active = todayActiveLogs.length;

    const locationCount: Record<string, number> = {};
    todayLogs.forEach((d) => {
      const loc = d.location || "Unknown";
      locationCount[loc] = (locationCount[loc] || 0) + 1;
    });
    const frequentBuilding = Object.entries(locationCount).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];

    const gateCount: Record<string, number> = {};
    todayLogs.forEach((d) => {
      const loc = (d.location || "").toLowerCase();
      if (loc.includes("gate")) {
        const key = d.location || "Unknown gate";
        gateCount[key] = (gateCount[key] || 0) + 1;
      }
    });
    const highestGate = Object.entries(gateCount).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];

    // "week" and "month" are based on all distinct names in data
    const uniqueWeek = new Set(data.map((d) => d.fullName)).size;
    const uniqueMonth = new Set(data.map((d) => d.fullName)).size;

    return {
      active,
      uniqueToday,
      frequentBuilding: frequentBuilding || "N/A",
      highestGate: highestGate || "N/A",
      uniqueWeek,
      uniqueMonth,
    };
  }, [data, activeLogIds]);

  // UI STATES
  if (loading) {
    return (
      <DashboardLayout>
        <p className="text-gray-400 text-center mt-8">Loading logs...</p>
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
        title="Log Book"
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(0);
        }}
        searchPlaceholder="Search name, pass, purpose..."
        filters={[
          {
            id: "status",
            label: "Status",
            type: "select",
            value: statusFilter,
            options: [
              { label: "All", value: "all" },
              { label: "Active only", value: "active" },
              { label: "Inactive only", value: "inactive" },
            ],
            onChange: (v) => {
              setStatusFilter(v as "all" | "active" | "inactive");
              setPage(0);
            },
          },
          {
            id: "location",
            label: "Location",
            type: "select",
            value: locationFilter,
            options: [
              { label: "All", value: "all" },
              ...locationOptions.map((loc) => ({
                label: loc,
                value: loc,
              })),
            ],
            onChange: (v) => {
              setLocationFilter(v);
              setPage(0);
            },
          },
          {
            id: "guard",
            label: "Guard",
            type: "select",
            value: guardFilter,
            options: [
              { label: "All", value: "all" },
              ...guardOptions.map((g) => ({ label: g, value: g })),
            ],
            onChange: (v) => {
              setGuardFilter(v);
              setPage(0);
            },
          },
          {
            id: "purpose",
            label: "Purpose",
            type: "select",
            value: purposeFilter,
            options: [
              { label: "All", value: "all" },
              ...PURPOSE_OPTIONS.filter((o) => o.value).map((o) => ({
                label: o.label,
                value: o.value,
              })),
            ],
            onChange: (v) => {
              setPurposeFilter(v);
              setPage(0);
            },
          },
          {
            id: "pass",
            label: "Pass",
            type: "select",
            value: passFilter,
            options: [
              { label: "All", value: "all" },
              { label: "With pass", value: "withPass" },
              { label: "Without pass", value: "withoutPass" },
            ],
            onChange: (v) => {
              setPassFilter(v as "all" | "withPass" | "withoutPass");
              setPage(0);
            },
          },
          {
            id: "dateRange",
            label: "Start date",
            type: "dateRange",
            fromValue: fromDate,
            toValue: toDate,
            min: earliestLogDate ?? undefined,
            max: todayKey,
            onFromChange: (val) => handleFromDateChange(val),
            onToChange: (val) => handleToDateChange(val),
          },
        ]}
        actions={
          <Button className="min-w-[110px]" onClick={() => setIsModalOpen(true)}>
            Statistics
          </Button>
        }
      />

      <Table>
        <Thead>
          <Tr>
            <Th>Full Name</Th>
            <Th>ID Type</Th>
            <Th>Pass No</Th>
            <Th>Start Time</Th>
            <Th>End Time</Th>
            <Th>Latest Location</Th>
            <Th>Status</Th>
            <Th>Actions</Th>
          </Tr>
        </Thead>
        <Tbody>
          {pagedLogs.map((row, i) => {
            const statusRaw =
              (row.status ?? (isLogActive(row) ? "ACTIVE" : "COMPLETED")).toUpperCase();

            const statusLabel =
              statusRaw === "ACTIVE"
                ? "Active"
                : statusRaw === "OVERSTAY"
                  ? "Overstay"
                  : statusRaw.charAt(0) + statusRaw.slice(1).toLowerCase();

            const statusClass =
              statusRaw === "ACTIVE"
                ? "text-green-400"
                : statusRaw === "OVERSTAY"
                  ? "text-yellow-400"
                  : "text-red-400";

            const startIso = `${row.date}T${row.time}`;
            const startLabel = formatDateTimeLabel(startIso);

            const firstPass = firstPassByLogId[row.visitorLogID] ?? null;
            const passLabel = firstPass ?? row.passNo ?? "—";

            const endIso = endTimestampByLogId[row.visitorLogID];
            let endLabel = "—";
            if (!isLogActive(row) && endIso) {
              endLabel = formatDateTimeLabel(endIso);
            }

            return (
              <Tr key={i}>
                <Td>{row.fullName}</Td>
                <Td>{row.idType}</Td>
                <Td>{passLabel}</Td>
                <Td>{startLabel}</Td>
                <Td>{endLabel}</Td>
                <Td>{row.location || "N/A"}</Td>
                <Td>
                  <span className={statusClass}>{statusLabel}</span>
                </Td>
                <Td>
                  <Button
                    variation="secondary"
                    className="text-xs px-2 py-1"
                    onClick={() => openDetails(row)}
                  >
                    View Details
                  </Button>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>

      <PaginationControls
        page={currentPage}
        pageSize={pageSize}
        totalElements={totalElements}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(0);
        }}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Statistics"
      >
        {data.length > 0 && stats ? (
          <div className="space-y-4">
            <div>
              <p className="font-semibold">On this day...</p>
              <ul className="list-disc list-inside text-sm text-gray-300">
                <li>{stats.active} Active Visitor(s)</li>
                <li>{stats.uniqueToday} Unique Visitor(s)</li>
                <li>{stats.frequentBuilding} is the frequent Building</li>
                <li>{stats.highestGate} has the highest influx</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold">Other Data...</p>
              <ul className="list-disc list-inside text-sm text-gray-300">
                <li>{stats.uniqueWeek} Unique Visitor(s) this Week</li>
                <li>{stats.uniqueMonth} Unique Visitor(s) this Month</li>
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-center">No statistics available.</p>
        )}
      </Modal>
      <Modal
        isOpen={detailsOpen}
        onClose={closeDetails}
        title="Log Session Details"
      >
        {selectedLog ? (
          <div className="space-y-6 text-sm text-slate-100">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Visitor card */}
              <section className="bg-white/5 border border-white/10 rounded-md p-3 backdrop-blur-sm">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">
                  Visitor
                </p>
                <p className="text-base font-semibold leading-snug">
                  {selectedLog.fullName}
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  ID Type:{" "}
                  <span className="font-medium">{selectedLog.idType}</span>
                </p>
                <p className="text-xs text-slate-300">
                  Pass No:{" "}
                  <span className="font-medium">
                    {selectedLog.passNo || "—"}
                  </span>
                </p>
              </section>

              {/* Session card */}
              <section className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-md p-3 space-y-1">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">
                  Session
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Start:{" "}
                  <span className="font-medium">
                    {formatDateTimeLabel(
                      `${selectedLog.date}T${selectedLog.time}`
                    )}
                  </span>
                </p>
                <p className="text-xs text-slate-300">
                  End:{" "}
                  <span className="font-medium">
                    {(() => {
                      const endIso =
                        endTimestampByLogId[selectedLog.visitorLogID];

                      if (!endIso && isLogActive(selectedLog)) return "Active";
                      if (!endIso) return "—";
                      return formatDateTimeLabel(endIso);
                    })()}
                  </span>
                </p>
                <p className="text-xs text-slate-300">
                  Logged By:{" "}
                  <span className="font-medium">
                    {selectedLog.loggedBy}
                  </span>
                </p>
                <p className="text-xs text-slate-300">
                  Latest Location:{" "}
                  <span className="font-medium">
                    {selectedLog.location || "N/A"}
                  </span>
                </p>
              </section>
            </div>

            <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-md p-3">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">
                Purpose of Visit
              </p>
              <p className="text-xs text-slate-100 leading-relaxed">
                {selectedLog.purposeOfVisit || "N/A"}
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-sm">Visited Stations</p>
                {selectedEntries.length > 0 && (
                  <p className="text-[11px] text-slate-400">
                    {selectedEntries.length} movement
                    {selectedEntries.length > 1 ? "s" : ""}
                  </p>
                )}
              </div>

              {selectedEntries.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No movement recorded for this log.
                </p>
              ) : (
                <div className="flex flex-col max-h-56 border border-white/10 rounded-md overflow-hidden bg-white/5 backdrop-blur-sm">
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Time</Th>
                        <Th>Station</Th>
                        <Th>Guard</Th>
                        <Th>Pass</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {selectedEntries.map((e) => (
                        <Tr key={e.entryId}>
                          <Td className="text-[11px]">
                            {formatDateTimeLabel(e.timestamp)}
                          </Td>
                          <Td className="text-[11px]">{e.stationName}</Td>
                          <Td className="text-[11px]">{e.guardName}</Td>
                          <Td className="text-[11px]">
                            {(() => {
                              const passLabel =
                                e.recordedPassDisplayCode ?? e.passNo;
                              const origin =
                                e.recordedPassOrigin ?? e.passOrigin;

                              if (!passLabel) return "—";
                              if (!origin) return passLabel;
                              return `${passLabel} (${origin})`;
                            })()}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-2 border-t border-white/10">
              <Button variation="secondary" onClick={closeDetails}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-300">No log selected.</p>
        )}
      </Modal>
    </DashboardLayout>
  );
}
