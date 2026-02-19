// src/pages/LogVisitor/components/LogVisitorData.ts
import { normalizeVisitorType } from "../../../constants/visitorTypes";
import {
  type Visitor,
  type VisitorLogDTO,
} from "../../../api/Index";

export type StatusFilter = "all" | "active" | "inactive";

export interface VisitorFilters {
  search: string;
  statusFilter: StatusFilter;
  entryFilter: string;
  visitorTypeFilter: string;
}

export function filterVisitors(
  visitors: Visitor[],
  activeLogs: VisitorLogDTO[],
  filters: VisitorFilters
): Visitor[] {
  const { search, statusFilter, entryFilter, visitorTypeFilter } = filters;
  const term = search.trim().toLowerCase();

  const getActiveLogForVisitor = (visitorId: number) =>
    activeLogs.find((log) => log.visitorID === visitorId);

  const sorted = visitors.slice().sort((a, b) => {
    const aId = a.visitorID ?? 0;
    const bId = b.visitorID ?? 0;
    return bId - aId;
  });

  return sorted.filter((v) => {
    const log = getActiveLogForVisitor(v.visitorID);

    const isActive = !!log;
    const firstLocation = log?.firstLocation || "";
    const lastLocation = log?.location || "";
    const passNo = log?.passNo || "";
    const normalizedVisitorType = normalizeVisitorType(v.visitorType);

    if (statusFilter === "active" && !isActive) return false;
    if (statusFilter === "inactive" && isActive) return false;

    if (entryFilter !== "all") {
      if (
        !firstLocation ||
        firstLocation.toLowerCase() !== entryFilter.toLowerCase()
      ) {
        return false;
      }
    }

    if (visitorTypeFilter !== "all") {
      if (!normalizedVisitorType || normalizedVisitorType !== visitorTypeFilter) {
        return false;
      }
    }

    if (!term) return true;

    const searchableFields = [
      v.visitorName ?? "",
      normalizedVisitorType,
      v.idNumber ?? "",
      v.idType ?? "",
      v.gender ?? "",
      firstLocation,
      lastLocation,
      passNo,
    ];

    return searchableFields.some((f) => f.toLowerCase().includes(term));
  });
}
