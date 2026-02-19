// src/pages/LogVisitor/components/StartLogModalController.tsx
import { useState, useRef } from "react";
import {
  type Visitor,
  type Station,
  type VisitorPass,
  type VisitorLogDTO,
  type VisitorLogEntryDTO,
  getPassByUid,
  getActiveLogs,
  getAllLogEntries,
  createVisitorLogResilient,
} from "../../../api/Index";
import { readCardUID } from "../../../hooks/readCard";

type ToastFn = (message: string, options?: any) => void;

interface UseStartLogModalControllerArgs {
  stations: Station[];
  passes: VisitorPass[];
  currentUserId: number | null;
  currentStationId: number | null;
  focusVisitorId: number | null;
  focusPurpose: string | null;
  clearScanFocus: () => void;
  showToast: ToastFn;
  setPollingEnabled: (enabled: boolean) => void;
  setActiveLogs: (logs: VisitorLogDTO[]) => void;
  setLogEntries: (entries: VisitorLogEntryDTO[]) => void;
  getActiveLogForVisitor: (visitorId: number) => VisitorLogDTO | undefined;
  setExclusiveOwner: (owner: "startLog" | null) => void;
}

export function useStartLogModalController({
  stations,
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
}: UseStartLogModalControllerArgs) {
  const [isOpen, setIsOpen] = useState(false);
  const [visitor, setVisitor] = useState<Visitor | null>(null);

  const [startPurpose, setStartPurpose] = useState("");
  const [startPassId, setStartPassId] = useState("");
  const [startAllowedStationIds, setStartAllowedStationIds] = useState<number[]>(
    []
  );
  const [isPurposeLocked, setIsPurposeLocked] = useState(false);

  const [rfidStatus, setRfidStatus] = useState<string | null>(null);
  const [rfidLoading, setRfidLoading] = useState(false);
  const [startPassInternalId, setStartPassInternalId] = useState<number | null>(
    null
  );
  const [locallyLockedPassIds, setLocallyLockedPassIds] = useState<number[]>([]);

  const readSeqRef = useRef(0); // for polling

  const openStartLog = (v: Visitor) => {
    const existingLog = getActiveLogForVisitor(v.visitorID);
    if (existingLog) {
      showToast(
        'This visitor already has an active log. Use "Check Log" instead.',
        { variant: "warning" }
      );
      return;
    }

    setVisitor(v);

    let defaultPurpose = "";
    if (
      focusVisitorId != null &&
      v.visitorID === focusVisitorId &&
      focusPurpose
    ) {
      defaultPurpose = focusPurpose;
      clearScanFocus();
    }
    setStartPurpose(defaultPurpose);
    setIsPurposeLocked(!!defaultPurpose);

    setStartPassId("");
    setStartPassInternalId(null);
    setRfidStatus(null);
    setRfidLoading(false);

    try {
      const key = `pendingAllowedLocations:${v.visitorID}`;
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const names: string[] = JSON.parse(raw);
        const ids = stations.filter((s) => names.includes(s.name)).map((s) => s.id);
        setStartAllowedStationIds(ids);
      } else {
        setStartAllowedStationIds([]);
      }
    } catch {
      setStartAllowedStationIds([]);
    }

    setIsOpen(true);
  };

  const handleStartPurposeChange = (value: string) => {
    if (isPurposeLocked) return;
    setStartPurpose(value);
  };

  const closeStartModal = () => {
    setIsOpen(false);
    setRfidStatus(null);
    setRfidLoading(false);
    setStartPassInternalId(null);
    setVisitor(null);
    setExclusiveOwner(null);
    setPollingEnabled(true);
  };

  const toggleAllowedStation = (id: number) => {
    setStartAllowedStationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const findPassOfflineByUid = (uid: string): VisitorPass | null => {
    if (!uid) return null;

    const normalizedUid = uid.trim().toUpperCase();

    const byExternalId = passes.find((p) => (p as any).visitorPassID === uid);

    const byPassNumber = passes.find((p) => {
      const num =
        ((p as any).passNumber ?? (p as any).pass_number ?? "")
          .toString()
          .toUpperCase();
      return num === normalizedUid;
    });

    const pass = byExternalId ?? byPassNumber ?? null;
    if (!pass) return null;

    if (locallyLockedPassIds.includes(pass.passID)) {
      return null;
    }

    const rawStatus = (pass as any).status as string | undefined;
    const status = rawStatus ? rawStatus.trim().toUpperCase() : "AVAILABLE";

    if (
      status === "IN_USE" ||
      status === "LOST" ||
      status === "INACTIVE" ||
      status === "RETIRED" ||
      status === "OVERSTAY_LOCKED"
    ) {
      return null;
    }

    return pass;
  };

  const handleReadRfid = async () => {
    setExclusiveOwner("startLog");
    setPollingEnabled(false);
    readSeqRef.current += 1;
    const seq = readSeqRef.current;

    setRfidStatus(null);
    setRfidLoading(true);

    try {
      const result = await readCardUID();
      if (!result.success || !result.uid) {
        setRfidStatus(
          result.message || "No card detected. Please tap a card again."
        );
        setStartPassInternalId(null);
        return;
      }

      const uid = result.uid;
      setRfidStatus(`Card detected (UID: ${uid}). Looking up pass...`);

      let pass: VisitorPass | null = null;

      try {
        pass = await getPassByUid(uid);
      } catch {
        pass = findPassOfflineByUid(uid);
      }

      if (!pass) {
        setRfidStatus(
          `No usable Visitor Pass is linked to UID ${uid}. ` +
          `It may be lost, inactive, retired, or not registered. ` +
          `Please register it first or enter a pass code manually.`
        );
        setStartPassInternalId(null);
        setStartPassId("");
        return;
      }

      const rawStatus = (pass as any).status as string | undefined;
      const status = rawStatus ? rawStatus.trim().toUpperCase() : "AVAILABLE";

      if (status !== "AVAILABLE") {
        if (status === "IN_USE") {
          setRfidStatus(
            `This pass is currently IN_USE by another visitor and cannot be assigned.\n` +
            `Ask them to check out or return the pass first.`
          );
        } else {
          setRfidStatus(
            `This pass cannot be assigned because its status is "${status}".`
          );
        }

        setStartPassInternalId(null);
        setStartPassId("");
        return;
      }

      setStartPassInternalId(pass.passID);

      const label =
        (pass as any).displayCode ??
        (pass as any).passNumber ??
        String(pass.passID);

      setStartPassId(label);
      setRfidStatus(`Linked to pass: ${label}`);
    } finally {
      setRfidLoading(false);
      window.setTimeout(() => {
        if (readSeqRef.current === seq) {
          setPollingEnabled(true);
          setExclusiveOwner(null);
        }
      }, 4000);
    }
  };

  const handleStartLog = async () => {
    if (!visitor) return;

    if (!startPurpose.trim()) {
      showToast("Please enter a purpose of visit.", { variant: "warning" });
      return;
    }

    let passInternalId: number | null = null;

    if (startPassInternalId != null) {
      passInternalId = startPassInternalId;
    } else if (startPassId.trim()) {
      const code = startPassId.trim();

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

      if (locallyLockedPassIds.includes(found.passID)) {
        showToast(
          `Pass "${code}" is already reserved in a pending offline log. Please use another pass or wait for sync.`,
          { variant: "warning" }
        );
        return;
      }

      passInternalId = found.passID;
    }

    if (currentStationId == null) {
      showToast(
        "This device is not linked to a gate station. Please log in again or start the helper app.",
        { variant: "error" }
      );
      return;
    }

    const effectiveAllowedStationIds = Array.from(
      new Set([currentStationId, ...startAllowedStationIds])
    );

    try {
      const result = await createVisitorLogResilient({
        visitorId: visitor.visitorID,
        passId: passInternalId,
        purposeOfVisit: startPurpose,
        allowedStationIds: effectiveAllowedStationIds,
        initialStationId: currentStationId ?? null,
        guardAccountId: currentUserId ?? null,
      });

      const wasQueued =
        typeof result === "object" &&
        result !== null &&
        "queued" in result &&
        (result as any).queued === true;

      if (wasQueued && passInternalId != null) {
        setLocallyLockedPassIds((prev) =>
          prev.includes(passInternalId) ? prev : [...prev, passInternalId]
        );
      }

      if (!wasQueued) {
        const [updatedActive, updatedEntries] = await Promise.all([
          getActiveLogs(),
          getAllLogEntries(),
        ]);
        setActiveLogs(updatedActive);
        setLogEntries(updatedEntries);
      }

      try {
        const key = `pendingAllowedLocations:${visitor.visitorID}`;
        sessionStorage.removeItem(key);
      } catch {
        // ignore
      }

      setIsOpen(false);
      setVisitor(null);
      setStartPurpose("");
      setStartPassId("");
      setStartPassInternalId(null);
      setStartAllowedStationIds([]);
      setRfidStatus(null);
      setRfidLoading(false);

      if (wasQueued) {
        showToast(
          "Network issue detected. Log has been queued and will sync when the connection is restored.",
          { variant: "warning" }
        );
      } else {
        showToast("Visitor log started successfully.", {
          variant: "success",
        });
      }
    } catch (err: any) {
      showToast(err?.message || "Failed to start log for visitor.", {
        variant: "error",
      });
    }
  };

  return {
    isOpen,
    visitor,
    startPurpose,
    startPassId,
    setStartPassId,
    startAllowedStationIds,
    toggleAllowedStation,
    rfidStatus,
    rfidLoading,
    openStartLog,
    closeStartModal,
    handleReadRfid,
    handleStartLog,
    isPurposeLocked,
    handleStartPurposeChange,
  };
}
