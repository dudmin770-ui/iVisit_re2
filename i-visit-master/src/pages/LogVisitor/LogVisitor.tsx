// src/pages/LogVisitor/LogVisitor.tsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useCookies } from "react-cookie";
import { useLocation, useNavigate } from "react-router-dom";

import DashboardLayout from "../../layouts/DashboardLayout";
import Meta from "../../utils/Meta";
import PaginationControls from "../../components/common/PaginationControls";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import Modal from "../../components/common/Modal";
import Button from "../../components/common/Button";
import { useToast } from "../../contexts/ToastContext";
import { useRfidPollingControl } from "../../features/rfid/RfidPollingContext";
import { VISITOR_TYPE_FILTER_VALUES } from "../../constants/visitorTypes";
import { sortGateAware } from "../../utils/locationSort";
import FilterHeader from "../../components/filters/FilterHeader";

import {
  listVisitors,
  type Visitor,
  getActiveLogs,
  getAllLogEntries,
  type VisitorLogDTO,
  type VisitorLogEntryDTO,
  getAllStations,
  type Station,
  getAllPasses,
  type VisitorPass,
  getAllLogs,
} from "../../api/Index";

import { VisitorProfileModal } from "./modals/VisitorProfileModal";
import { StartLogModal } from "./modals/StartLogModal";
import { IncidentReportModal } from "./modals/IncidentReportModal";
import { LogDetailsModal } from "./modals/LogDetailsModal";

import { LogVisitorTable } from "./components/MainTable";
import { filterVisitors, type VisitorFilters } from "./components/MainData";

import { useVisitorProfileModalController } from "./components/VisitorProfileModalFlow";
import { useStartLogModalController } from "./components/StartLogModalFlow";
import { useLogDetailsModalController } from "./components/LogDetailsFlow";
import { useIncidentReportModalController } from "./components/IncidentReportFlow";

export default function LogVisitor() {
  Meta({ title: "Log Visitor - iVisit" });

  const { showToast } = useToast();
  const [cookies] = useCookies(["userId", "stationId", "role"]);
  const { setPollingEnabled, setExclusiveOwner } = useRfidPollingControl();

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [activeLogs, setActiveLogs] = useState<VisitorLogDTO[]>([]);
  const [allLogs, setAllLogs] = useState<VisitorLogDTO[]>([]);
  const [logEntries, setLogEntries] = useState<VisitorLogEntryDTO[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [passes, setPasses] = useState<VisitorPass[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [entryFilter, setEntryFilter] = useState<string>("all");
  const [visitorTypeFilter, setVisitorTypeFilter] = useState<string>("all");

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const location = useLocation();
  const navigate = useNavigate();

  const [focusVisitorId, setFocusVisitorId] = useState<number | null>(null);
  const [focusPurpose, setFocusPurpose] = useState<string | null>(null);

  const currentUserId =
    cookies.userId != null ? Number(cookies.userId) : null;
  const currentStationId =
    cookies.stationId != null ? Number(cookies.stationId) : null;

  const currentStation = useMemo(
    () => stations.find((s) => s.id === currentStationId) ?? null,
    [stations, currentStationId]
  );

  const isGateStation = useMemo(() => {
    if (!currentStation || !currentStation.name) return false;
    return currentStation.name.toLowerCase().includes("gate");
  }, [currentStation]);

  const showBuildingPassControls = !!(currentStation && !isGateStation);

  const entryLocationOptions = useMemo(() => {
    const set = new Set<string>();

    stations.forEach((s) => {
      const name = (s.name || "").trim();
      if (!name) return;

      const type = (s as any).stationType?.toString().toUpperCase?.() ?? "";

      if (type === "GATE") {
        set.add(name);
        return;
      }

      if (!type && name.toLowerCase().includes("gate")) {
        set.add(name);
      }
    });

    return sortGateAware(Array.from(set));
  }, [stations]);

  const activeStations = useMemo(() => {
    return stations.filter((s) => {
      const any = s as any;

      // Hard cut: archived stations are never shown
      if (any.archived === true) return false;

      // If there is an explicit active flag, respect it
      const activeFlag = any.active ?? any.isActive;
      if (activeFlag === false) return false;

      // Try status fields with different possible names
      const rawStatus =
        any.status ??
        any.stationStatus ??
        any.station_status ??
        any.state ??
        any.stationState;

      if (rawStatus != null) {
        const status = String(rawStatus).trim().toUpperCase();
        if (
          status === "INACTIVE" ||
          status === "DEACTIVATED" ||
          status === "DISABLED" ||
          status === "OFFLINE"
        ) {
          return false;
        }
      }

      // Default: keep it
      return true;
    });
  }, [stations]);

  const visitorTypeOptions = VISITOR_TYPE_FILTER_VALUES;

  const clearScanFocus = useCallback(() => {
    setFocusVisitorId(null);
    setFocusPurpose(null);
    setSearch("");
    navigate("/dashboard/log-visitor", { replace: true });
  }, [navigate]);

  useEffect(() => {
    async function fetchAll() {
      try {
        setLoading(true);
        const [
          visitorsData,
          activeLogsData,
          entriesData,
          stationsData,
          passesData,
          allLogsData,
        ] = await Promise.all([
          listVisitors(),
          getActiveLogs(),
          getAllLogEntries(),
          getAllStations(),
          getAllPasses(),
          getAllLogs(),
        ]);

        setVisitors(visitorsData);
        setActiveLogs(activeLogsData);
        setLogEntries(entriesData);
        setStations(stationsData);
        setPasses(passesData);
        setAllLogs(allLogsData);
        setError(null);
      } catch (err: any) {
        setError(err.message || "Failed to load data for logging visitors.");
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const focus = params.get("focus");
    const purpose = params.get("purpose");

    if (focus) {
      const n = Number(focus);
      if (!Number.isNaN(n)) setFocusVisitorId(n);
    } else {
      setFocusVisitorId(null);
    }

    setFocusPurpose(purpose || null);
  }, [location.search]);

  useEffect(() => {
    if (focusVisitorId != null && visitors.length > 0) {
      const v = visitors.find((x) => x.visitorID === focusVisitorId);
      if (v) {
        setSearch(v.visitorName);
      }
    }
  }, [focusVisitorId, visitors]);

  useEffect(() => {
    if (focusVisitorId == null) return;

    const timeoutId = window.setTimeout(() => {
      clearScanFocus();
    }, 120_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [focusVisitorId, clearScanFocus]);

  // Strictly active logs (activeEnd == null) – used by StartLog controller.
  const getActiveLogForVisitor = (
    visitorId: number
  ): VisitorLogDTO | undefined => {
    return activeLogs.find((log) => log.visitorID === visitorId);
  };

  // Latest LOCKED_OVERSTAY / ENDED_OVERSTAY per visitor, from all logs.
  const getLatestOverstayLogForVisitor = useCallback(
    (visitorId: number): VisitorLogDTO | undefined => {
      // Consider *all* logs for this visitor (non-archived)
      const visitorLogs = allLogs.filter((log) => {
        if (log.visitorID !== visitorId) return false;
        if ((log as any).archived === true) return false;
        return true;
      });

      if (visitorLogs.length === 0) return undefined;

      // Find the latest log overall by end time, then start time
      const latest = visitorLogs.reduce((latest, current) => {
        const latestKey = latest.activeEnd ?? latest.activeStart;
        const currentKey = current.activeEnd ?? current.activeStart;

        if (!latestKey) return current;
        if (!currentKey) return latest;

        return currentKey > latestKey ? current : latest;
      });

      const status = latest.status?.toUpperCase();
      if (status === "LOCKED_OVERSTAY" || status === "ENDED_OVERSTAY") {
        return latest;
      }

      // Latest log is *not* an overstay → don't warn
      return undefined;
    },
    [allLogs]
  );

  // What the table sees: active if present, otherwise latest overstay.
  const getDisplayLogForVisitor = useCallback(
    (visitorId: number): VisitorLogDTO | undefined => {
      const active = getActiveLogForVisitor(visitorId);
      if (active) return active;
      return getLatestOverstayLogForVisitor(visitorId);
    },
    [getLatestOverstayLogForVisitor, activeLogs]
  );

  const filteredVisitors = useMemo(() => {
    const filters: VisitorFilters = {
      search,
      statusFilter,
      entryFilter,
      visitorTypeFilter,
    };

    // For filters, we still only consider truly active logs vs no active log.
    return filterVisitors(visitors, activeLogs, filters);
  }, [visitors, activeLogs, search, statusFilter, entryFilter, visitorTypeFilter]);

  const totalElements = filteredVisitors.length;
  const totalPages =
    totalElements === 0 ? 0 : Math.ceil(totalElements / pageSize);

  const currentPage = totalPages === 0 ? 0 : Math.min(page, totalPages - 1);

  const pagedVisitors = filteredVisitors.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize
  );

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(0);
  };

  const {
    isOpen: profileOpen,
    visitor: profileVisitor,
    openProfile,
    closeProfile,
  } = useVisitorProfileModalController();

  const startLog = useStartLogModalController({
    stations: activeStations,
    passes,
    currentUserId,
    currentStationId,
    focusVisitorId,
    focusPurpose,
    clearScanFocus,
    showToast,
    setPollingEnabled,
    setActiveLogs,
    setLogEntries,
    getActiveLogForVisitor,
    setExclusiveOwner,
  });

  const details = useLogDetailsModalController({
    passes,
    currentUserId,
    currentStationId,
    showToast,
    setPollingEnabled,
    setActiveLogs,
    setLogEntries,
    setExclusiveOwner,
  });

  const incidents = useIncidentReportModalController({
    passes,
    currentUserId,
    currentStationId,
    showToast,
  });

  // Overstay warning modal state
  const [overstayWarningOpen, setOverstayWarningOpen] = useState(false);
  const [overstayVisitor, setOverstayVisitor] = useState<Visitor | null>(null);
  const [overstayLog, setOverstayLog] = useState<VisitorLogDTO | null>(null);

  // Overstay-aware Start Log click: one button in the table, extra logic here.
  const handleStartLogClick = useCallback(
    (v: Visitor) => {
      const existingActive = getActiveLogForVisitor(v.visitorID);
      if (existingActive) {
        showToast(
          'This visitor already has an active log. Use "Check Log" instead.',
          { variant: "warning" }
        );
        return;
      }

      const latestOverstay = getLatestOverstayLogForVisitor(v.visitorID);
      if (latestOverstay) {
        setOverstayVisitor(v);
        setOverstayLog(latestOverstay);
        setOverstayWarningOpen(true);
        return;
      }

      // No active, no overstay – normal behavior
      startLog.openStartLog(v);
    },
    [getActiveLogForVisitor, getLatestOverstayLogForVisitor, startLog, showToast]
  );

const gateStations = useMemo(() => {
  return activeStations.filter((s) => {
    const type = ((s as any).stationType || "").toString().toUpperCase();
    if (type) return type === "GATE";
    return (s.name || "").toLowerCase().includes("gate");
  });
}, [activeStations]);

const buildingStations = useMemo(() => {
  return activeStations.filter((s) => !gateStations.some((g) => g.id === s.id));
}, [activeStations, gateStations]);

  useEffect(() => {
    const REFRESH_INTERVAL_MS = 30_000;

    let cancelled = false;

    const refreshData = async () => {
      if (!navigator.onLine) return;
      if (cancelled) return;

      try {
        const [activeLogsData, entriesData, passesData, allLogsData] =
          await Promise.all([
            getActiveLogs(),
            getAllLogEntries(),
            getAllPasses(),
            getAllLogs(),
          ]);

        if (cancelled) return;

        setActiveLogs(activeLogsData);
        setLogEntries(entriesData);
        setPasses(passesData);
        setAllLogs(allLogsData);
      } catch {
        // ignore
      }
    };

    // refresh on interval
    const intervalId = window.setInterval(refreshData, REFRESH_INTERVAL_MS);

    // refresh on RFID tap event
    const onLogsChanged = () => refreshData();
    window.addEventListener("ivisit:logs-changed", onLogsChanged);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("ivisit:logs-changed", onLogsChanged);
    };
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <p className="text-gray-400 text-center mt-8">
          Loading visitors and logs...
        </p>
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
        title="Log Visitor"
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(0);
        }}
        searchPlaceholder="Search by name, ID, location, pass..."
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
            id: "entryVia",
            label: "Entry via",
            type: "select",
            value: entryFilter,
            options: [
              { label: "All", value: "all" },
              ...entryLocationOptions.map((loc) => ({
                label: loc,
                value: loc,
              })),
            ],
            onChange: (v) => {
              setEntryFilter(v);
              setPage(0);
            },
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
            onChange: (v) => {
              setVisitorTypeFilter(v);
              setPage(0);
            },
          },
        ]}
      />

      <LogVisitorTable
        visitors={pagedVisitors}
        // Table sees active or, if none, latest overstay
        getActiveLogForVisitor={getDisplayLogForVisitor}
        isGateStation={isGateStation}
        onOpenProfile={openProfile}
        onOpenDetails={(v, l) => details.openDetails(v, l, logEntries)}
        // Start Log is overstay-aware via wrapper
        onOpenStartLog={handleStartLogClick}
      />
      <PaginationControls
        page={currentPage}
        pageSize={pageSize}
        totalElements={totalElements}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      <VisitorProfileModal
        isOpen={profileOpen}
        visitor={profileVisitor}
        onClose={closeProfile}
      />

      <StartLogModal
        isOpen={startLog.isOpen}
        visitor={startLog.visitor}
        stations={buildingStations}
        startPurpose={startLog.startPurpose}
        isPurposeLocked={startLog.isPurposeLocked}
        onStartPurposeChange={startLog.handleStartPurposeChange}
        startPassId={startLog.startPassId}
        onStartPassIdChange={startLog.setStartPassId}
        startAllowedStationIds={startLog.startAllowedStationIds}
        onToggleAllowedStation={startLog.toggleAllowedStation}
        rfidStatus={startLog.rfidStatus}
        rfidLoading={startLog.rfidLoading}
        onReadRfid={startLog.handleReadRfid}
        onClose={startLog.closeStartModal}
        onSubmit={startLog.handleStartLog}
      />

      <LogDetailsModal
        isOpen={details.isOpen}
        onClose={details.closeDetails}
        visitor={details.visitor}
        log={details.log}
        entries={details.entries}
        detailsLoading={details.detailsLoading}
        hasStationContext={!!(currentStationId && currentStation)}
        isGateStation={isGateStation}
        showBuildingPassControls={showBuildingPassControls}
        detailsPassCode={details.detailsPassCode}
        detailsRfidStatus={details.detailsRfidStatus}
        detailsRfidLoading={details.detailsRfidLoading}
        onChangePassCode={details.setDetailsPassCode}
        onReadRfidForDetails={details.handleReadRfidForDetails}
        onGrantPass={details.handleGrantPass}
        onRevokePass={details.handleRevokePass}
        onReportIncidentClick={() =>
          incidents.openIncidentModal(details.visitor, details.log)
        }
        onEndLog={details.handleEndLog}
        onLogHere={details.handleCheckInHere}
      />

      <IncidentReportModal
        isOpen={incidents.isOpen}
        onClose={incidents.closeIncidentModal}
        visitor={incidents.visitor}
        log={incidents.log}
        incidentType={incidents.incidentType}
        incidentDescription={incidents.incidentDescription}
        loading={incidents.loading}
        onIncidentTypeChange={incidents.setIncidentType}
        onIncidentDescriptionChange={incidents.setIncidentDescription}
        onSubmit={incidents.handleReportIncident}
      />

      {details.confirmState && (
        <ConfirmDialog
          isOpen={details.confirmState.open}
          title={details.confirmState.title}
          message={details.confirmState.message}
          confirmLabel={details.confirmState.confirmLabel}
          cancelLabel={details.confirmState.cancelLabel}
          loading={details.confirmLoading}
          onCancel={details.handleConfirmCancel}
          onConfirm={details.handleConfirmExecute}
        />
      )}

      {/* Overstay warning modal */}
      {overstayVisitor && overstayLog && (
        <Modal
          isOpen={overstayWarningOpen}
          onClose={() => {
            setOverstayWarningOpen(false);
            setOverstayVisitor(null);
            setOverstayLog(null);
          }}
          title="Previous Overstay Detected"
        >
          <div className="flex flex-col gap-3 text-white">
            <p className="text-sm text-slate-300">
              The last log for{" "}
              <span className="font-semibold">
                {overstayVisitor.visitorName}
              </span>{" "}
              was{" "}
              {overstayLog.status?.toUpperCase() === "LOCKED_OVERSTAY"
                ? "locked for overstay"
                : "ended after an overstay period"}
              . The pass used for that visit may still be locked or have an
              open incident.
            </p>

            <div className="text-xs text-slate-400 border border-white/10 rounded-md p-3 space-y-1">
              <p>
                <span className="font-semibold">Status:</span>{" "}
                {overstayLog.status ?? "N/A"}
              </p>
              <p>
                <span className="font-semibold">Pass:</span>{" "}
                {overstayLog.passNo ?? "—"}
              </p>
              <p>
                <span className="font-semibold">Last Location:</span>{" "}
                {overstayLog.location ?? "—"}
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <Button
                variation="secondary"
                onClick={() => {
                  setOverstayWarningOpen(false);
                  setOverstayVisitor(null);
                  setOverstayLog(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variation="secondary"
                onClick={() => {
                  if (overstayVisitor && overstayLog) {
                    details.openDetails(
                      overstayVisitor,
                      overstayLog,
                      logEntries
                    );
                  }
                  setOverstayWarningOpen(false);
                  setOverstayVisitor(null);
                  setOverstayLog(null);
                }}
              >
                View previous log
              </Button>
              <Button
                onClick={() => {
                  if (overstayVisitor) {
                    startLog.openStartLog(overstayVisitor);
                  }
                  setOverstayWarningOpen(false);
                  setOverstayVisitor(null);
                  setOverstayLog(null);
                }}
              >
                Start new log anyway
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
}
