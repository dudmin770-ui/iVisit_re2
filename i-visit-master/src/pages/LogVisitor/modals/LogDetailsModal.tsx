// src/pages/LogVisitor/LogDetailsModal.tsx
import Modal from "../../../components/common/Modal";
import Button from "../../../components/common/Button";
import Input from "../../../components/common/Input";
import {
  type Visitor,
  type VisitorLogDTO,
  type VisitorLogEntryDTO,
} from "../../../api/Index";

interface LogDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;

  visitor: Visitor | null;
  log: VisitorLogDTO | null;
  entries: VisitorLogEntryDTO[];

  detailsLoading: boolean;

  // station context
  hasStationContext: boolean; // currentStationId && currentStation
  isGateStation: boolean;
  showBuildingPassControls: boolean; // buildings only (currentStation && !isGate)

  // pass / RFID state (buildings)
  detailsPassCode: string;
  detailsRfidStatus: string | null;
  detailsRfidLoading: boolean;

  // callbacks
  onChangePassCode: (value: string) => void;
  onReadRfidForDetails: () => void;
  onGrantPass: () => void;
  onRevokePass: () => void;
  onReportIncidentClick: () => void;
  onEndLog: () => void;
  onLogHere: () => void;
}

function formatDateTimeLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  const day = String(d.getDate()).padStart(2, "0");
  const monthShort = d.toLocaleString(undefined, { month: "short" }); // e.g., "Jan"
  const year = d.getFullYear();

  return `${hours}:${minutes} · ${day} ${monthShort} ${year}`;
}

export function LogDetailsModal({
  isOpen,
  onClose,
  visitor,
  log,
  entries,
  detailsLoading,
  hasStationContext,
  isGateStation,
  showBuildingPassControls,
  detailsPassCode,
  detailsRfidStatus,
  detailsRfidLoading,
  onChangePassCode,
  onReadRfidForDetails,
  onGrantPass,
  onRevokePass,
  onReportIncidentClick,
  onEndLog,
  onLogHere,
}: LogDetailsModalProps) {
  const rawStatus = log?.status?.toUpperCase();

  const isSoftOverstay = rawStatus === "ACTIVE_OVERSTAY";

  let statusLabel = "No log";
  let statusClass = "text-slate-400";
  let isActiveLike = false;

  if (log && rawStatus) {
    switch (rawStatus) {
      case "ACTIVE_OVERSTAY":
        statusLabel = "Active (Overstay)";
        statusClass = "text-orange-400";
        isActiveLike = true;
        break;
      case "ACTIVE":
        statusLabel = "Active";
        statusClass = "text-green-400";
        isActiveLike = true;
        break;
      case "LOCKED_OVERSTAY":
        statusLabel = "Locked (Overstay)";
        statusClass = "text-red-400";
        break;
      case "ENDED_OVERSTAY":
        statusLabel = "Ended (Overstay)";
        statusClass = "text-orange-400";
        break;
      case "ENDED_FORCED":
        statusLabel = "Ended (Forced)";
        statusClass = "text-yellow-300";
        break;
      case "ENDED":
        statusLabel = "Ended";
        statusClass = "text-red-400";
        break;
      default:
        statusLabel = rawStatus;
        statusClass = "text-slate-400";
        break;
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Visitor Log Details">
      {visitor && log ? (
        <div className="flex flex-col gap-3 text-white">
          {/* Header info */}
          <div>
            <p className="text-lg font-semibold">{visitor.visitorName}</p>
            <p className="text-sm text-slate-300">
              Purpose: {log.purposeOfVisit ?? "N/A"}
            </p>
            <p className="text-sm text-slate-300">
              Current Location: {log.location ?? "N/A"}
            </p>
            <p className="text-sm text-slate-300">
              Pass No: {log.passNo ?? "—"}
            </p>
            <p className="text-sm text-slate-300 mt-1">
              Allowed Stations:{" "}
              {log.allowedStations && log.allowedStations.length > 0
                ? log.allowedStations.join(", ")
                : "N/A"}
            </p>

            <div className="mt-2">
              <span className={`text-xs font-semibold ${statusClass}`}>
                {statusLabel}
              </span>
            </div>

            {/* Overstay info */}
            {isSoftOverstay && (
              <div className="mt-2 rounded-md bg-orange-900/40 border border-orange-500/60 px-3 py-2 text-xs text-orange-100">
                This visit has exceeded the normal duration but is still active.
                Please prioritize closing this log when appropriate.
              </div>
            )}

            {rawStatus === "LOCKED_OVERSTAY" && (
              <div className="mt-2 rounded-md bg-red-900/40 border border-red-500/60 px-3 py-2 text-xs text-red-100">
                This visit was automatically locked for overstay. No further
                movements can be recorded on this log. If an RFID pass was used
                for this visit, it may have been locked for overstay; check
                Manage Passes and any related incidents before reusing that pass.
              </div>
            )}
          </div>

          {/* Building-only pass controls (grant/revoke) – only for active logs */}
          {showBuildingPassControls && isActiveLike && (
            <div className="mt-3 border-t border-white/10 pt-3">
              {log.passNo && log.passNo !== "—" && log.passNo !== "-" ? (
                // Visitor currently HAS a pass
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-300">
                    This visitor currently has pass:{" "}
                    <span className="font-semibold">{log.passNo}</span>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variation="secondary"
                      onClick={onRevokePass}
                      disabled={detailsLoading}
                      className="text-xs px-3 py-1"
                    >
                      Revoke Pass
                    </Button>
                  </div>
                </div>
              ) : (
                // Visitor currently has NO pass
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-slate-300">
                    This visitor has no assigned RFID pass for this session.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Enter pass code (e.g. 001)"
                      value={detailsPassCode}
                      onChange={(e) => onChangePassCode(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variation="secondary"
                      className="whitespace-nowrap text-xs px-3 py-1"
                      disabled={detailsRfidLoading}
                      onClick={onReadRfidForDetails}
                    >
                      {detailsRfidLoading ? "Reading..." : "Tap card"}
                    </Button>
                    <Button
                      onClick={onGrantPass}
                      disabled={detailsLoading}
                      className="text-xs px-3 py-1"
                    >
                      Grant Pass
                    </Button>
                  </div>
                  {detailsRfidStatus && (
                    <p className="text-xs text-slate-300 mt-1">
                      {detailsRfidStatus}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Visited stations list */}
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <p className="font-semibold text-sm">Visited Stations</p>
              {entries.length > 0 && (
                <p className="text-[11px] text-slate-400">
                  {entries.length} movement{entries.length > 1 ? "s" : ""}
                </p>
              )}
            </div>

            {entries.length === 0 ? (
              <p className="text-xs text-slate-400">
                No movement recorded yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {entries
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(a.timestamp).getTime() -
                      new Date(b.timestamp).getTime()
                  )
                  .map((e) => (
                    <div
                      key={e.entryId}
                      className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs text-slate-100"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{e.stationName}</p>
                          <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                            {formatDateTimeLabel(e.timestamp)}
                          </p>
                        </div>

                        {/* optional: keep right side reserved for something later; for now it's empty */}
                      </div>
                      <div className="mt-1 flex justify-between gap-2">
                        <span className="text-[11px] text-slate-300">
                          Guard: <span className="font-medium">{e.guardName}</span>
                        </span>
                        <span className="text-[11px] text-slate-300">
                          Pass:{" "}
                          <span className="font-medium">
                            {(() => {
                              const passLabel =
                                e.recordedPassDisplayCode ?? e.passNo;
                              const origin =
                                e.recordedPassOrigin ?? (e as any).passOrigin;

                              if (!passLabel) return "—";
                              if (!origin) return passLabel;
                              return `${passLabel} (${origin})`;
                            })()}
                          </span>
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Incident button (for any station, as long as there is a pass) */}
          {log.passNo && log.passNo !== "—" && log.passNo !== "-" && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="text-sm text-slate-300 mb-2">
                If this visitor&apos;s RFID pass was lost, damaged, or not
                returned, you can record an incident for it.
              </p>
              <Button
                variation="outlined"
                className="text-xs px-3 py-1 border-red-500 text-red-300"
                disabled={detailsLoading}
                onClick={onReportIncidentClick}
              >
                Report Lost / Damaged Pass
              </Button>
            </div>
          )}

          {/* Footer buttons: Close + End Log / Log Here (only for active logs) */}
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variation="secondary"
              onClick={onClose}
              disabled={detailsLoading}
            >
              Close
            </Button>

            {isActiveLike && (
              <>
                {hasStationContext ? (
                  isGateStation ? (
                    // Gates: end the campus-level log
                    <Button onClick={onEndLog} disabled={detailsLoading}>
                      {detailsLoading ? "Ending..." : "End Log"}
                    </Button>
                  ) : (
                    // Buildings: record movement here
                    <Button onClick={onLogHere} disabled={detailsLoading}>
                      {detailsLoading ? "Logging..." : "Log Here"}
                    </Button>
                  )
                ) : (
                  // Fallback: no station in context -> End Log
                  <Button onClick={onEndLog} disabled={detailsLoading}>
                    {detailsLoading ? "Ending..." : "End Log"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-300">
          No active visitor log selected. Close this dialog and try again.
        </p>
      )}
    </Modal>
  );
}
