// src/pages/LogVisitor/components/LogDetailsModalController.tsx
import { useState, useRef } from "react";
import {
  type Visitor,
  type VisitorLogDTO,
  type VisitorLogEntryDTO,
  type VisitorPass,
  getActiveLogs,
  getAllLogEntries,
  grantPassToLog,
  revokePassFromLog,
  recordLogEntryResilient,
  endVisitorLogResilient,
} from "../../../api/Index";
import { readCardUID } from "../../../hooks/readCard";

type ToastFn = (message: string, options?: any) => void;

interface UseLogDetailsModalControllerArgs {
  passes: VisitorPass[];
  currentUserId: number | null;
  currentStationId: number | null;
  showToast: ToastFn;
  setPollingEnabled: (enabled: boolean) => void;
  setActiveLogs: (logs: VisitorLogDTO[]) => void;
  setLogEntries: (entries: VisitorLogEntryDTO[]) => void;
  setExclusiveOwner: (owner: "logDetails" | null) => void;
}

export function useLogDetailsModalController({
  passes,
  currentUserId,
  currentStationId,
  showToast,
  setPollingEnabled,
  setActiveLogs,
  setLogEntries,
  setExclusiveOwner,
}: UseLogDetailsModalControllerArgs) {
  const [isOpen, setIsOpen] = useState(false);
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [log, setLog] = useState<VisitorLogDTO | null>(null);
  const [entries, setEntries] = useState<VisitorLogEntryDTO[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [detailsPassCode, setDetailsPassCode] = useState("");
  const [detailsPassInternalId, setDetailsPassInternalId] = useState<number | null>(
    null
  );
  const [detailsRfidStatus, setDetailsRfidStatus] = useState<string | null>(null);
  const [detailsRfidLoading, setDetailsRfidLoading] = useState(false);

  const detailsReadSeqRef = useRef(0);

  type ConfirmState = {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => Promise<void> | void;
  };

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const openDetails = (
    v: Visitor,
    l: VisitorLogDTO,
    allEntries: VisitorLogEntryDTO[]
  ) => {
    setVisitor(v);
    setLog(l);
    setIsOpen(true);

    const entriesForLog = allEntries.filter(
      (e: any) => e.visitorLogId === l.visitorLogID
    );
    setEntries(entriesForLog);

    setDetailsPassCode("");
    setDetailsPassInternalId(null);
    setDetailsRfidStatus(null);
    setDetailsRfidLoading(false);
  };

  const closeDetails = () => {
    setIsOpen(false);
    setVisitor(null);
    setLog(null);
    setEntries([]);
    setDetailsLoading(false);
    setDetailsPassCode("");
    setDetailsPassInternalId(null);
    setDetailsRfidStatus(null);
    setDetailsRfidLoading(false);
    setExclusiveOwner(null);
    setPollingEnabled(true);
  };

  const endLogNow = async () => {
    if (!log) return;

    try {
      setDetailsLoading(true);
      const result = await endVisitorLogResilient({
        logId: log.visitorLogID,
        stationId: currentStationId ?? null,
        guardAccountId: currentUserId ?? null,
      });

      const wasQueued =
        typeof result === "object" &&
        result !== null &&
        "queued" in result &&
        (result as any).queued === true;

      if (!wasQueued) {
        const [updatedActive, updatedEntries] = await Promise.all([
          getActiveLogs(),
          getAllLogEntries(),
        ]);
        setActiveLogs(updatedActive);
        setLogEntries(updatedEntries);
      }

      if (wasQueued) {
        showToast(
          "Network issue detected. Checkout has been queued and will sync when the connection is restored.",
          { variant: "warning" }
        );
      } else {
        showToast("Visitor checked out successfully.", {
          variant: "success",
        });
      }

      closeDetails();
    } catch (err: any) {
      showToast(err?.message || "Failed to end log.", { variant: "error" });
      setDetailsLoading(false);
    }
  };

  const handleEndLog = () => {
    if (!log) return;

    setConfirmState({
      open: true,
      title: "End Log",
      message: `End log for ${log.fullName}? This will mark the visitor as checked out.`,
      confirmLabel: "End Log",
      cancelLabel: "Cancel",
      onConfirm: endLogNow,
    });
  };

  const handleCheckInHere = async () => {
    if (!log) return;
    if (!currentStationId || !currentUserId) {
      showToast("You must be logged in at a station to record movement.", {
        variant: "warning",
      });
      return;
    }

    try {
      setDetailsLoading(true);

      const result = await recordLogEntryResilient({
        visitorLogId: log.visitorLogID,
        stationId: currentStationId,
        accountId: currentUserId,
      });

      const wasQueued =
        typeof result === "object" &&
        result !== null &&
        "queued" in result &&
        (result as any).queued === true;

      if (!wasQueued) {
        const updatedEntries = await getAllLogEntries();
        setLogEntries(updatedEntries);

        const entriesForLog = updatedEntries.filter(
          (e) => e.visitorLogId === log.visitorLogID
        );
        setEntries(entriesForLog);

        const updatedActive = await getActiveLogs();
        setActiveLogs(updatedActive);

        const updatedLog = updatedActive.find(
          (l) => l.visitorLogID === log.visitorLogID
        );
        if (updatedLog) {
          setLog(updatedLog);
        }
      }

      if (wasQueued) {
        showToast(
          "Network issue detected. Movement has been queued and will sync when the connection is restored.",
          { variant: "warning" }
        );
      } else {
        showToast("Movement recorded.", { variant: "success" });
      }
    } catch (err: any) {
      showToast(err?.message || "Failed to record movement.", {
        variant: "error",
      });
    } finally {
      setDetailsLoading(false);
      closeDetails();
    }
  };

  const handleGrantPass = async () => {
    if (!log) return;

    let passInternalId = detailsPassInternalId;

    if (!detailsPassCode.trim() && passInternalId == null) {
      showToast("Please enter a pass code first.", { variant: "warning" });
      return;
    }

    if (passInternalId == null) {
      const code = detailsPassCode.trim();

      const found = passes.find(
        (p) =>
          p.displayCode === code ||
          p.passNumber === code ||
          String(p.passID) === code
      );

      if (!found) {
        showToast(`No visitor pass found with code "${code}".`, {
          variant: "error",
        });
        return;
      }

      passInternalId = found.passID;
    }

    try {
      setDetailsLoading(true);

      await grantPassToLog(log.visitorLogID, passInternalId);

      const [updatedActive, updatedEntries] = await Promise.all([
        getActiveLogs(),
        getAllLogEntries(),
      ]);
      setActiveLogs(updatedActive);
      setLogEntries(updatedEntries);

      const updatedLog = updatedActive.find(
        (l) => l.visitorLogID === log.visitorLogID
      );
      if (updatedLog) {
        setLog(updatedLog);
      }

      const entriesForLog = updatedEntries.filter(
        (e: any) => e.visitorLogId === log.visitorLogID
      );
      setEntries(entriesForLog);

      setDetailsPassCode("");
      setDetailsPassInternalId(null);
      setDetailsRfidStatus("Pass granted successfully.");
    } catch (err: any) {
      showToast(err?.message || "Failed to grant pass.", {
        variant: "error",
      });
    } finally {
      setDetailsLoading(false);
    }
  };

  const revokePassNow = async () => {
    if (!log) return;

    try {
      setDetailsLoading(true);

      await revokePassFromLog(log.visitorLogID);

      const [updatedActive, updatedEntries] = await Promise.all([
        getActiveLogs(),
        getAllLogEntries(),
      ]);
      setActiveLogs(updatedActive);
      setLogEntries(updatedEntries);

      const updatedLog = updatedActive.find(
        (l) => l.visitorLogID === log.visitorLogID
      );
      if (updatedLog) {
        setLog(updatedLog);
      }

      const entriesForLog = updatedEntries.filter(
        (e: any) => e.visitorLogId === log.visitorLogID
      );
      setEntries(entriesForLog);

      setDetailsPassCode("");
      setDetailsPassInternalId(null);
      setDetailsRfidStatus("Pass revoked successfully.");
    } catch (err: any) {
      showToast(err?.message || "Failed to revoke pass.", {
        variant: "error",
      });
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleRevokePass = () => {
    if (!log) return;

    setConfirmState({
      open: true,
      title: "Revoke Pass",
      message: `Revoke pass for ${log.fullName}? This will unlink the pass but keep the visitor checked in.`,
      confirmLabel: "Revoke",
      cancelLabel: "Cancel",
      onConfirm: revokePassNow,
    });
  };

  const handleReadRfidForDetails = async () => {
    setExclusiveOwner("logDetails");
    setPollingEnabled(false);
    detailsReadSeqRef.current += 1;
    const seq = detailsReadSeqRef.current;
    setDetailsRfidStatus(null);
    setDetailsRfidLoading(true);

    try {
      const result = await readCardUID();
      if (!result.success || !result.uid) {
        setDetailsRfidStatus(
          result.message || "No card detected. Please tap a card again."
        );
        setDetailsPassInternalId(null);
        return;
      }

      const uid = result.uid;
      setDetailsRfidStatus(`Card detected (UID: ${uid}). Looking up pass...`);

      // For details, we let the backend guard unusable passes.
      const pass = passes.find(
        (p) =>
          p.visitorPassID === uid ||
          p.passNumber?.toUpperCase() === uid.toUpperCase()
      );

      if (!pass) {
        setDetailsRfidStatus(
          `No usable Visitor Pass is linked to UID ${uid}. ` +
          `It may be lost, inactive, retired, or not registered.`
        );
        setDetailsPassInternalId(null);
        setDetailsPassCode("");
        return;
      }

      setDetailsPassInternalId(pass.passID);

      const label =
        (pass as any).displayCode ??
        (pass as any).passNumber ??
        String(pass.passID);

      setDetailsPassCode(label);
      setDetailsRfidStatus(`Linked to pass: ${label}`);
    } catch (err: any) {
      setDetailsRfidStatus(err?.message || "Failed to read RFID card.");
      setDetailsPassInternalId(null);
    } finally {
      setDetailsRfidLoading(false);
      window.setTimeout(() => {
        if (detailsReadSeqRef.current === seq) {
          setPollingEnabled(true);
          setExclusiveOwner(null);
        }
      }, 4000);
    }
  };

  const handleConfirmCancel = () => {
    if (confirmLoading) return;
    setConfirmState((prev) => (prev ? { ...prev, open: false } : prev));
  };

  const handleConfirmExecute = async () => {
    if (!confirmState?.onConfirm) return;
    try {
      setConfirmLoading(true);
      await confirmState.onConfirm();
    } finally {
      setConfirmLoading(false);
      setConfirmState((prev) => (prev ? { ...prev, open: false } : prev));
    }
  };

  return {
    isOpen,
    visitor,
    log,
    entries,
    detailsLoading,
    detailsPassCode,
    setDetailsPassCode,
    detailsRfidStatus,
    detailsRfidLoading,
    openDetails,
    closeDetails,
    handleEndLog,
    handleCheckInHere,
    handleGrantPass,
    handleRevokePass,
    handleReadRfidForDetails,
    confirmState,
    confirmLoading,
    handleConfirmCancel,
    handleConfirmExecute,
  };
}
