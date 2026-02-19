// src/pages/Visitors/Visitors.tsx
import { useEffect, useMemo, useState } from "react";
import { useCookies } from "react-cookie";
import Button from "../../components/common/Button";
import DashboardLayout from "../../layouts/DashboardLayout";
import Meta from "../../utils/Meta";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/common/Table";
import Modal from "../../components/common/Modal";
import { useToast } from "../../contexts/ToastContext";
import PaginationControls from "../../components/common/PaginationControls";
import FilterHeader from "../../components/filters/FilterHeader";

import {
  listVisitors,
  archiveVisitors,
  type Visitor,
  getActiveLogs,
  type VisitorLogDTO,
  exportVisitorsPdf,
  exportVisitorsCsvZip,
} from "../../api/Index";

import {
  VISITOR_TYPE_FILTER_VALUES,
  normalizeVisitorType,
} from "../../constants/visitorTypes";
import { GENDER_OPTIONS } from "../../constants/genderOptions";
import { ID_TYPE_OPTIONS, normalizeIdType } from "../../constants/idTypes";


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const getPhotoUrl = (raw?: string) => {
  if (!raw) return undefined;
  // Already absolute (http/https)
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;

  // Ensure a leading slash
  const path = raw.startsWith("/") ? `/${raw.replace(/^\/+/, "")}` : `/${raw}`;
  return `${API_BASE_URL}${path}`;
};

function toDateKey(isoLike?: string | null): string | null {
  if (!isoLike) return null;
  return isoLike.slice(0, 10);
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

const todayKey = new Date().toISOString().slice(0, 10);


export default function Visitors() {
  Meta({ title: "Visitors - iVisit" });

  const [cookies] = useCookies(["role", "token"]);
  const { showToast } = useToast();

  const role = cookies.role as "admin" | "guard" | "support" | undefined;
  const isSupport = role === "support";

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [activeLogs, setActiveLogs] = useState<VisitorLogDTO[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<"all" | "active" | "inactive">("all");
  const [visitorTypeFilter, setVisitorTypeFilter] = useState<string>("all");
const [idTypeFilter, setIdTypeFilter] = useState<string>("all");
const [genderFilter, setGenderFilter] = useState<string>("all");

const [fromDate, setFromDate] = useState<string>("");
const [toDate, setToDate] = useState<string>("");

  const visitorTypeOptions = VISITOR_TYPE_FILTER_VALUES;

  // Client-side pagination state
  const [page, setPage] = useState(0);      // 0-based
  const [pageSize, setPageSize] = useState(25);

  // Profile modal
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileVisitor, setProfileVisitor] = useState<Visitor | null>(null);

  // Export state
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [visitorsData, activeLogsData] = await Promise.all([
          listVisitors(),
          getActiveLogs(),
        ]);

        setVisitors(visitorsData);
        setActiveLogs(activeLogsData);
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Failed to load visitors");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

const earliestVisitorDate = useMemo(() => {
  const dates: string[] = [];

  visitors.forEach((v) => {
    const key = toDateKey(v.createdAt ?? null);
    if (key) dates.push(key);
  });

  if (dates.length === 0) return null;

  return dates.reduce((min, d) => (d < min ? d : min), dates[0]);
}, [visitors]);

const handleFromDateChange = (raw: string) => {
  if (!raw) {
    setFromDate("");
    setPage(0);
    return;
  }

  let val = raw;

  if (earliestVisitorDate && val < earliestVisitorDate) {
    val = earliestVisitorDate;
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

  if (earliestVisitorDate && val < earliestVisitorDate) {
    val = earliestVisitorDate;
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

  // Determine whether a visitor is "Active" based on active log entries.
  // Since VisitorLogDTO doesn't carry visitorID, we match by name for now.
  const getStatus = (visitorName: string) =>
    activeLogs.some(
      (log) =>
        log.fullName &&
        log.fullName.toLowerCase() === visitorName.toLowerCase()
    )
      ? "Active"
      : "Inactive";

  // 1) Apply filters + search in memory
  const sortedVisitors = visitors.slice().sort((a, b) => {
    const aId = a.visitorID ?? 0;
    const bId = b.visitorID ?? 0;
    return bId - aId; // higher ID = earlier in the list
  });

  const filteredVisitors = sortedVisitors.filter((v) => {
  const status = getStatus(v.visitorName);
  const normalizedType = normalizeVisitorType(v.visitorType);
  const normalizedIdType = normalizeIdType(v.idType);
  const term = search.trim().toLowerCase();

  const dateKey = toDateKey(v.createdAt ?? null);
  const from = fromDate || undefined;
  const to = toDate || undefined;

  // Date range filter (Registered At)
  if (!isWithinRange(dateKey, from, to)) return false;

  // Status filter
  if (statusFilter === "active" && status !== "Active") return false;
  if (statusFilter === "inactive" && status !== "Inactive") return false;

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

  // Text search
  if (term) {
    return (
      v.visitorName.toLowerCase().includes(term) ||
      normalizedType.includes(term) ||
      (v.idNumber ?? "").toLowerCase().includes(term) ||
      (v.idType ?? "").toLowerCase().includes(term)
    );
  }

  return true;
});

  // 2) Derive pagination info from filtered visitors
  const totalElements = filteredVisitors.length;
  const totalPages =
    totalElements === 0 ? 0 : Math.ceil(totalElements / pageSize);

  // Clamp current page to valid range
  const currentPage = totalPages === 0 ? 0 : Math.min(page, totalPages - 1);

  // 3) Slice current page
  const pagedVisitors = filteredVisitors.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize
  );

  // 4) Archive related (still based on the full filtered list, not the page slice)
  const inactiveVisitors = filteredVisitors.filter(
    (v) => getStatus(v.visitorName) === "Inactive"
  );
  const inactiveCount = inactiveVisitors.length;

  // Exports are based on the *currently filtered* visitors
  const handleExportVisitorsPdf = async () => {
    const idsToExport = filteredVisitors.map((v) => v.visitorID);

    if (idsToExport.length === 0) {
      showToast(
        "There are no visitors in the current view to export.",
        { variant: "error" }
      );
      return;
    }

    try {
      setIsExportingPdf(true);
      await exportVisitorsPdf(idsToExport, cookies.token);
      showToast("Visitors PDF export generated.", { variant: "success" });
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || "Failed to export visitors PDF.", { variant: "error" });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportVisitorsCsvZip = async () => {
    const idsToExport = filteredVisitors.map((v) => v.visitorID);

    if (idsToExport.length === 0) {
      showToast(
        "There are no visitors in the current view to export.",
        { variant: "error" }
      );
      return;
    }

    try {
      setIsExportingCsv(true);
      await exportVisitorsCsvZip(idsToExport, cookies.token);
      showToast("Visitors CSV archive generated.", { variant: "success" });
    } catch (err: any) {
      console.error(err);
      showToast(
        err?.message || "Failed to export visitors CSV archive.",
        { variant: "error" }
      );
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleArchive = async () => {
    if (inactiveCount === 0) return;

    const confirm = window.confirm(
      `Archive all ${inactiveCount} inactive visitor(s) shown in this list?`
    );
    if (!confirm) return;

    try {
      const idsToArchive = inactiveVisitors.map((v) => v.visitorID);
      await archiveVisitors(idsToArchive);

      // Remove them from local state
      setVisitors((prev) =>
        prev.filter((v) => !idsToArchive.includes(v.visitorID))
      );

      showToast("Inactive visitors archived successfully.", { variant: "success" });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to archive visitors");
      showToast(err?.message || "Failed to archive visitors.", { variant: "error" });
    }
  };

  const openProfile = (visitor: Visitor) => {
    setProfileVisitor(visitor);
    setProfileOpen(true);
  };

  const closeProfile = () => {
    setProfileOpen(false);
    setProfileVisitor(null);
  };

  return (
    <DashboardLayout>
<FilterHeader
  title="Visitors"
  searchValue={search}
  onSearchChange={(v) => {
    setSearch(v);
    setPage(0);
  }}
  searchPlaceholder="Search name, ID, type..."
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
      id: "visitorType",
      label: "Visitor type",
      type: "select",
      value: visitorTypeFilter,
      options: [
        { label: "All", value: "all" },
        ...visitorTypeOptions.map((t) => ({ label: t, value: t })),
      ],
      onChange: (v) => {
        setVisitorTypeFilter(v);
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
    ...ID_TYPE_OPTIONS
      .filter((o) => o.value) // skip empty placeholder
      .map((o) => ({ label: o.label, value: o.value })),
  ],
  onChange: (v) => {
    setIdTypeFilter(v);
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
    ...GENDER_OPTIONS
      .filter((o) => o.value) // skip empty placeholder
      .map((o) => ({ label: o.label, value: o.value })),
  ],
  onChange: (v) => {
    setGenderFilter(v);
    setPage(0);
  },
},
    {
      id: "registeredAt",
      label: "Registered",
      type: "dateRange",
      fromValue: fromDate,
      toValue: toDate,
      min: earliestVisitorDate ?? undefined,
      max: todayKey,
      onFromChange: (val) => handleFromDateChange(val),
      onToChange: (val) => handleToDateChange(val),
    },
  ]}
  actions={
    !isSupport && (
      <>
        <Button
          disabled={inactiveCount === 0}
          onClick={handleArchive}
        >
          Archive ({inactiveCount})
        </Button>

        <Button
          disabled={filteredVisitors.length === 0 || isExportingCsv}
          onClick={handleExportVisitorsCsvZip}
        >
          {isExportingCsv ? "Exporting CSV..." : "Export CSV"}
        </Button>

        <Button
          disabled={filteredVisitors.length === 0 || isExportingPdf}
          onClick={handleExportVisitorsPdf}
        >
          {isExportingPdf ? "Exporting PDF..." : "Export PDF"}
        </Button>
      </>
    )
  }
/>

      {loading ? (
        <p>Loading visitors...</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : filteredVisitors.length === 0 ? (
        <p className="text-slate-300 text-sm">No visitors found.</p>
      ) : (
        <>
          <Table>
            <Thead>
              <Tr>
                <Th>ID #</Th>
                <Th>Full Name</Th>
                <Th>ID Type</Th>
                <Th>Visitor Type</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {pagedVisitors.map((v) => {
                const status = getStatus(v.visitorName);
                const normalizedType = normalizeVisitorType(v.visitorType);

                return (
                  <Tr key={v.visitorID}>
                    <Td>{v.idNumber}</Td>
                    <Td>{v.visitorName}</Td>
                    <Td>{v.idType}</Td>
                    <Td>{normalizedType || "N/A"}</Td>
                    <Td>
                      <span
                        className={
                          status === "Active"
                            ? "text-green-400"
                            : "text-red-400"
                        }
                      >
                        {status}
                      </span>
                    </Td>
                    <Td>
                      <Button
                        variation="secondary"
                        className="text-xs px-2 py-1"
                        onClick={() => openProfile(v)}
                      >
                        View Profile
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
        </>
      )}

      {/* Visitor Profile modal */}
      <Modal
        isOpen={profileOpen}
        onClose={closeProfile}
        title="Visitor Profile"
      >
        {profileVisitor && (
          <div className="flex flex-col gap-3 text-white">
            <div className="flex gap-4">
              {profileVisitor.photoPath ? (
                <img
                  src={getPhotoUrl(profileVisitor.photoPath)}
                  alt={profileVisitor.visitorName}
                  className="w-32 h-32 object-cover rounded-md border border-white/20"
                />
              ) : (
                <div className="w-32 h-32 flex items-center justify-center rounded-md border border-dashed border-white/20 text-xs text-slate-400">
                  No photo
                </div>
              )}
              <div className="flex-1">
                <p className="text-lg font-semibold">
                  {profileVisitor.visitorName}
                </p>
                <p className="text-sm text-slate-300">
                  Visitor Type: {profileVisitor.visitorType ?? "N/A"}
                </p>
                {/* NEW: Gender line */}
                <p className="text-sm text-slate-300">
                  Gender: {profileVisitor.gender ?? "—"}
                </p>
                <p className="text-sm text-slate-300">
                  Date of Birth: {profileVisitor.dateOfBirth ?? "—"}
                </p>
                <p className="text-sm text-slate-300">
                  Registered At: {profileVisitor.createdAt ?? "—"}
                </p>
              </div>
            </div>

            <div className="mt-2 space-y-1 text-sm">
              <p>
                <span className="font-semibold">ID Type:</span>{" "}
                {profileVisitor.idType ?? "—"}
              </p>
              <p>
                <span className="font-semibold">ID Number:</span>{" "}
                {profileVisitor.idNumber ?? "—"}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
