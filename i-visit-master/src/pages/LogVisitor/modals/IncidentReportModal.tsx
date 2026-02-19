// src/pages/LogVisitor/IncidentReportModal.tsx
import Modal from "../../../components/common/Modal";
import Button from "../../../components/common/Button";
import Select from "../../../components/common/Select";
import { type Visitor, type VisitorLogDTO } from "../../../api/Index";

interface IncidentReportModalProps {
  isOpen: boolean;
  onClose: () => void;

  visitor: Visitor | null;
  log: VisitorLogDTO | null;

  incidentType: string;
  incidentDescription: string;
  loading: boolean;

  onIncidentTypeChange: (value: string) => void;
  onIncidentDescriptionChange: (value: string) => void;
  onSubmit: () => void;
}

export function IncidentReportModal({
  isOpen,
  onClose,
  visitor,
  log,
  incidentType,
  incidentDescription,
  loading,
  onIncidentTypeChange,
  onIncidentDescriptionChange,
  onSubmit,
}: IncidentReportModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Report Pass Incident"
    >
      {visitor && log ? (
        <div className="flex flex-col gap-3 text-white">
          <p className="text-sm text-slate-300">
            Reporting incident for visitor{" "}
            <span className="font-semibold">
              {visitor.visitorName}
            </span>
            {log.passNo &&
              log.passNo !== "—" &&
              log.passNo !== "-" && (
                <>
                  {" "}
                  with pass{" "}
                  <span className="font-semibold">
                    {log.passNo}
                  </span>
                </>
              )}
            .
          </p>

<div className="bg-white/5 border border-white/10 rounded-md p-3">
  <p className="text-[11px] text-slate-300 uppercase tracking-wide mb-1">
    Incident Type
  </p>
  <Select
    id="incident-type"
    value={incidentType}
    onChange={onIncidentTypeChange}
    placeholder="Select incident type"
    options={[
      { label: "Lost", value: "LOST" },
      { label: "Damaged", value: "DAMAGED" },
      { label: "Not returned", value: "NOT_RETURNED" },
      { label: "Other", value: "OTHER" },
    ]}
  />
</div>

          <div className="bg-white/5 border border-white/10 rounded-md p-3">
  <p className="text-[11px] text-slate-300 uppercase tracking-wide mb-1">
    Details / Notes
  </p>
  <textarea
    className="w-full bg-transparent border border-white/20 rounded px-2 py-2 text-sm text-white resize-y min-h-[80px] focus:outline-none focus:ring-1 focus:ring-yellow-400"
    placeholder="Describe briefly what happened (where it was lost, how it was damaged, etc.)"
    value={incidentDescription}
    onChange={(e) => onIncidentDescriptionChange(e.target.value)}
  />
</div>

          <div className="flex justify-end gap-2 mt-3">
            <Button
              variation="secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              disabled={loading}
            >
              {loading ? "Reporting..." : "Report Incident"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-300">
          No active visitor / log selected. Close this dialog and try again.
        </p>
      )}
    </Modal>
  );
}
