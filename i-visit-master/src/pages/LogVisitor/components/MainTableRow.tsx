// src/pages/LogVisitor/LogVisitorTableRow.tsx
import Button from "../../../components/common/Button";
import { Tr, Td } from "../../../components/common/Table";
import { normalizeVisitorType } from "../../../constants/visitorTypes";
import {
  type Visitor,
  type VisitorLogDTO,
} from "../../../api/Index";

interface LogVisitorTableRowProps {
  visitor: Visitor;
  log: VisitorLogDTO | undefined;
  isGateStation: boolean;
  onOpenProfile: (v: Visitor) => void;
  onOpenDetails: (v: Visitor, log: VisitorLogDTO) => void;
  onOpenStartLog: (v: Visitor) => void;
}

export function LogVisitorTableRow({
  visitor,
  log,
  isGateStation,
  onOpenProfile,
  onOpenDetails,
  onOpenStartLog,
}: LogVisitorTableRowProps) {
  const rawStatus = log?.status?.toUpperCase();
  let statusLabel = log ? "Active" : "Inactive";
  let statusClass = log ? "text-green-400" : "text-red-400";

  if (log && rawStatus) {
    switch (rawStatus) {
      case "ACTIVE_OVERSTAY":
        statusLabel = "Active (Overstay)";
        statusClass = "text-orange-400";
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

      case "ACTIVE":
      default:
        statusLabel = "Active";
        statusClass = "text-green-400";
        break;
    }
  }

  const isActionableActive =
    !!log &&
    rawStatus !== "LOCKED_OVERSTAY" &&
    rawStatus !== "ENDED" &&
    rawStatus !== "ENDED_OVERSTAY" &&
    rawStatus !== "ENDED_FORCED";

  const firstLocation = log?.firstLocation ?? "—";
  const lastLocation = log?.location ?? "—";
  const passNo = log?.passNo ?? "—";
  const normalizedVisitorType = normalizeVisitorType(visitor.visitorType);

  return (
    <Tr key={visitor.visitorID}>
      <Td>{visitor.idNumber}</Td>
      <Td>{visitor.visitorName}</Td>
      <Td>{normalizedVisitorType || "N/A"}</Td>
      <Td>{visitor.idType}</Td>
      <Td>
        <span className={statusClass}>{statusLabel}</span>
      </Td>
      <Td>{firstLocation}</Td>
      <Td>{lastLocation}</Td>
      <Td>{passNo}</Td>
      <Td className="py-2">
        <div className="flex gap-2">
          <Button
            variation="secondary"
            className="text-xs px-2 py-1"
            onClick={() => onOpenProfile(visitor)}
          >
            Profile
          </Button>

          {isActionableActive ? (
            <Button
              className="text-xs px-2 py-1"
              onClick={() => onOpenDetails(visitor, log!)}
            >
              Check Log
            </Button>
          ) : isGateStation ? (
            <Button
              className="text-xs px-2 py-1"
              onClick={() => onOpenStartLog(visitor)}
            >
              Start Log
            </Button>
          ) : null}
        </div>
      </Td>
    </Tr>
  );
}