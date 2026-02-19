// src/pages/LogVisitor/LogVisitorTable.tsx
import { Table, Thead, Tbody, Tr, Th } from "../../../components/common/Table";
import {
  type Visitor,
  type VisitorLogDTO,
} from "../../../api/Index";
import { LogVisitorTableRow } from "./MainTableRow";

interface LogVisitorTableProps {
  visitors: Visitor[];
  getActiveLogForVisitor: (visitorId: number) => VisitorLogDTO | undefined;
  isGateStation: boolean;
  onOpenProfile: (v: Visitor) => void;
  onOpenDetails: (v: Visitor, log: VisitorLogDTO) => void;
  onOpenStartLog: (v: Visitor) => void;
}

export function LogVisitorTable({
  visitors,
  getActiveLogForVisitor,
  isGateStation,
  onOpenProfile,
  onOpenDetails,
  onOpenStartLog,
}: LogVisitorTableProps) {
  return (
    <Table>
      <Thead>
        <Tr>
          <Th>ID #</Th>
          <Th>Full Name</Th>
          <Th>Visitor Type</Th>
          <Th>ID Type</Th>
          <Th>Status</Th>
          <Th>First Location</Th>
          <Th>Last Location</Th>
          <Th>Pass No</Th>
          <Th>Actions</Th>
        </Tr>
      </Thead>
      <Tbody>
        {visitors.map((visitor) => {
          const log = getActiveLogForVisitor(visitor.visitorID);
          return (
            <LogVisitorTableRow
              key={visitor.visitorID}
              visitor={visitor}
              log={log}
              isGateStation={isGateStation}
              onOpenProfile={onOpenProfile}
              onOpenDetails={onOpenDetails}
              onOpenStartLog={onOpenStartLog}
            />
          );
        })}
      </Tbody>
    </Table>
  );
}
