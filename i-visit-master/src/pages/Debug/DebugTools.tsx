// src/pages/Debug/DebugTools.tsx
import { useState } from "react";
import { useCookies } from "react-cookie";
import DashboardLayout from "../../layouts/DashboardLayout";
import Meta from "../../utils/Meta";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import { useToast } from "../../contexts/ToastContext";
import {
  createDebugOverstayLog,
  createDebugArchiveLog,
} from "../../api/DebugApi";

export default function DebugTools() {
  Meta({ title: "Debug Tools - iVisit" });

  const [cookies] = useCookies(["role"]);
  const { showToast } = useToast();

  const role = cookies.role as "admin" | "guard" | "support" | undefined;
  const isAdmin = role === "admin";

  const [overstayVisitorId, setOverstayVisitorId] = useState("");
  const [overstayPassId, setOverstayPassId] = useState("");
  const [overstayHoursAgo, setOverstayHoursAgo] = useState("12");
  const [overstayLoading, setOverstayLoading] = useState(false);

  const [archiveVisitorId, setArchiveVisitorId] = useState("");
  const [archiveDaysAgo, setArchiveDaysAgo] = useState("366");
  const [archiveLoading, setArchiveLoading] = useState(false);

  const [overstayTickLoading, setOverstayTickLoading] = useState(false);
  const [archiveTickLoading, setArchiveTickLoading] = useState(false);

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <p className="text-center text-red-400 mt-8">
          You do not have permission to access this page.
        </p>
      </DashboardLayout>
    );
  }

  const handleCreateOverstay = async () => {
    const vId = Number(overstayVisitorId);
    const pId = Number(overstayPassId);
    const h = Number(overstayHoursAgo || "0");

    if (!vId || !pId || h <= 0) {
      showToast("Provide visitorId, passId, and hoursAgo > 0.", {
        variant: "warning",
      });
      return;
    }

    try {
      setOverstayLoading(true);
      const res = await createDebugOverstayLog({
        visitorId: vId,
        passId: pId,
        hoursAgo: h,
      });

      showToast(
        `Debug overstay log created (logId=${res.logId}, status=${res.status}).`,
        { variant: "success" }
      );
    } catch (err: any) {
      showToast(err?.message || "Failed to create debug overstay log.", {
        variant: "error",
      });
    } finally {
      setOverstayLoading(false);
    }
  };

  const handleCreateArchive = async () => {
    const vId = Number(archiveVisitorId);
    const d = Number(archiveDaysAgo || "0");

    if (!vId || d <= 0) {
      showToast("Provide visitorId and daysAgoEnded > 0.", {
        variant: "warning",
      });
      return;
    }

    try {
      setArchiveLoading(true);
      const res = await createDebugArchiveLog({
        visitorId: vId,
        daysAgoEnded: d,
      });

      showToast(
        `Debug archive log created (logId=${res.logId}, ended ~${d} days ago).`,
        { variant: "success" }
      );
    } catch (err: any) {
      showToast(err?.message || "Failed to create debug archive log.", {
        variant: "error",
      });
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleRunOverstayTick = async () => {
    try {
      setOverstayTickLoading(true);
      await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/debug/run-overstay-evaluation`, {
        method: "POST",
        credentials: "include",
      });
      showToast("Overstay evaluation executed.", { variant: "success" });
    } catch (err: any) {
      showToast(err?.message || "Failed to run overstay evaluation.", {
        variant: "error",
      });
    } finally {
      setOverstayTickLoading(false);
    }
  };

  const handleRunArchiveTick = async () => {
    try {
      setArchiveTickLoading(true);
      await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/debug/run-archive`, {
        method: "POST",
        credentials: "include",
      });
      showToast("Archive job executed.", { variant: "success" });
    } catch (err: any) {
      showToast(err?.message || "Failed to run archive job.", {
        variant: "error",
      });
    } finally {
      setArchiveTickLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto mt-8 text-white space-y-8">
        <h1 className="text-2xl font-semibold mb-4">Debug Tools</h1>

        <section className="border border-white/10 rounded-lg p-4 space-y-3">
          <h2 className="text-lg font-semibold">Overstay Testing</h2>
          <p className="text-xs text-slate-400">
            Creates an ACTIVE log in the past so the Overstay scheduler can
            mark it as ACTIVE_OVERSTAY or LOCKED_OVERSTAY.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <p className="text-xs mb-1">Visitor ID</p>
              <Input
                value={overstayVisitorId}
                onChange={(e) => setOverstayVisitorId(e.target.value)}
                placeholder="e.g. 123"
              />
            </div>
            <div>
              <p className="text-xs mb-1">Pass ID</p>
              <Input
                value={overstayPassId}
                onChange={(e) => setOverstayPassId(e.target.value)}
                placeholder="e.g. 45"
              />
            </div>
            <div>
              <p className="text-xs mb-1">Hours ago</p>
              <Input
                value={overstayHoursAgo}
                onChange={(e) => setOverstayHoursAgo(e.target.value)}
                placeholder="e.g. 8 or 12"
              />
            </div>
          </div>

          <div className="flex justify-end mt-3">
            <Button
              disabled={overstayLoading}
              onClick={handleCreateOverstay}
            >
              {overstayLoading ? "Creating..." : "Create debug overstay log"}
            </Button>
          </div>
          <div className="flex justify-end mt-3">
            <Button
              variation="secondary"
              disabled={overstayTickLoading}
              onClick={handleRunOverstayTick}
            >
              {overstayTickLoading ? "Running..." : "Run Overstay Evaluation Now"}
            </Button>
          </div>
        </section>

        <section className="border border-white/10 rounded-lg p-4 space-y-3">
          <h2 className="text-lg font-semibold">Archive Testing</h2>
          <p className="text-xs text-slate-400">
            Creates an ENDED, unarchived log that ended N days ago so the
            archive scheduler can pick it up once it is older than 1 year.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs mb-1">Visitor ID</p>
              <Input
                value={archiveVisitorId}
                onChange={(e) => setArchiveVisitorId(e.target.value)}
                placeholder="e.g. 123"
              />
            </div>
            <div>
              <p className="text-xs mb-1">Days ago ended</p>
              <Input
                value={archiveDaysAgo}
                onChange={(e) => setArchiveDaysAgo(e.target.value)}
                placeholder="e.g. 366"
              />
            </div>
          </div>

          <div className="flex justify-end mt-3">
            <Button
              disabled={archiveLoading}
              onClick={handleCreateArchive}
            >
              {archiveLoading ? "Creating..." : "Create debug archive log"}
            </Button>
          </div>
          <div className="flex justify-end mt-3">
            <Button
              variation="secondary"
              disabled={archiveTickLoading}
              onClick={handleRunArchiveTick}
            >
              {archiveTickLoading ? "Running..." : "Run Archive Job Now"}
            </Button>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
