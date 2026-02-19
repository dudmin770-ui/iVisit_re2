// src/pages/LogVisitor/components/IncidentReportModalController.tsx
import { useState } from "react";
import {
  type Visitor,
  type VisitorLogDTO,
  type VisitorPass,
  reportPassIncident,
} from "../../../api/Index";

type ToastFn = (message: string, options?: any) => void;

interface UseIncidentReportModalControllerArgs {
  passes: VisitorPass[];
  currentUserId: number | null;
  currentStationId: number | null;
  showToast: ToastFn;
}

export function useIncidentReportModalController({
  passes,
  currentUserId,
  currentStationId,
  showToast,
}: UseIncidentReportModalControllerArgs) {
  const [isOpen, setIsOpen] = useState(false);
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [log, setLog] = useState<VisitorLogDTO | null>(null);
  const [incidentType, setIncidentType] = useState<string>("LOST");
  const [incidentDescription, setIncidentDescription] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const openIncidentModal = (v: Visitor | null, l: VisitorLogDTO | null) => {
    if (!v || !l) {
      showToast("No active visitor log selected.", { variant: "warning" });
      return;
    }

    if (!l.passNo || l.passNo === "—" || l.passNo === "-") {
      showToast("This visitor currently has no assigned pass.", {
        variant: "warning",
      });
      return;
    }

    setVisitor(v);
    setLog(l);
    setIncidentType("LOST");
    setIncidentDescription("");
    setIsOpen(true);
  };

  const closeIncidentModal = () => {
    setIsOpen(false);
    setVisitor(null);
    setLog(null);
    setIncidentDescription("");
    setIncidentType("LOST");
  };

  const handleReportIncident = async () => {
    if (!log || !visitor) return;

    if (!log.passNo || log.passNo === "—" || log.passNo === "-") {
      showToast("This visitor currently has no assigned pass.", {
        variant: "warning",
      });
      return;
    }

    const code = log.passNo.trim();

    const pass = passes.find(
      (p) =>
        p.displayCode === code || p.passNumber === code || String(p.passID) === code
    );

    if (!pass) {
      showToast(
        `Could not resolve the pass record for code "${log.passNo}".`,
        { variant: "error" }
      );
      return;
    }

    try {
      setLoading(true);

      await reportPassIncident({
        passId: pass.passID,
        visitorId: visitor.visitorID,
        visitorLogId: log.visitorLogID,
        stationId: currentStationId ?? undefined,
        guardAccountId: currentUserId ?? undefined,
        incidentType: incidentType || "LOST",
        description: incidentDescription || undefined,
      });

      showToast(
        "Incident recorded. Admin can review it in the incident list / reports.",
        { variant: "success" }
      );

      closeIncidentModal();
    } catch (err: any) {
      showToast(err?.message || "Failed to report incident for this pass.", {
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    isOpen,
    visitor,
    log,
    incidentType,
    incidentDescription,
    loading,
    openIncidentModal,
    closeIncidentModal,
    setIncidentType,
    setIncidentDescription,
    handleReportIncident,
  };
}
