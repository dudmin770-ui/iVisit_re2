// src/pages/.../Stations.tsx
import { useEffect, useState, useMemo } from "react";
import Button from "../../components/common/Button";
import Modal from "../../components/common/Modal";
import Input from "../../components/common/Input";
import CheckboxTile from "../../components/common/CheckboxTile";
import DashboardLayout from "../../layouts/DashboardLayout";
import Meta from "../../utils/Meta";
import {
  getAllStations,
  getStationGuards,
  updateStationGuards,
  updateStation,
  type Station,
  type AssignedUser as StationAssignedUser,
  getAllUsers,
  type UserAccount,
  createStation,
  setStationActive,
} from "../../api/Index";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDungeon } from '@fortawesome/free-solid-svg-icons';
import { faBuilding as farBuilding } from '@fortawesome/free-regular-svg-icons';

type StationWithUsers = Station & {
  assignedUsers?: StationAssignedUser[];
  active?: boolean | null;
};

export default function Stations() {
  Meta({ title: "Stations - iVisit" });

  const [currentType, setCurrentType] = useState<"gate" | "building">("gate");
  const [stations, setStations] = useState<StationWithUsers[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // guards-related state
  const [assignedUsers, setAssignedUsers] = useState<StationAssignedUser[]>([]);
  const [allGuards, setAllGuards] = useState<StationAssignedUser[]>([]);
  const [guardsLoading, setGuardsLoading] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedGuardIds, setSelectedGuardIds] = useState<number[]>([]);
  const [guardAssignments, setGuardAssignments] = useState<
    Record<number, number[]>
  >({});
  const [guardSearch, setGuardSearch] = useState("");
  const [originalAssignedGuardIds, setOriginalAssignedGuardIds] = useState<number[]>([]);

  // add/deactivate station state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<"gate" | "building">("gate");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // edit station state
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameType, setRenameType] = useState<"gate" | "building">("gate");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSubmitting, setRenameSubmitting] = useState(false);

  const selectedStation: StationWithUsers | null = selectedStationId
    ? stations.find((s) => s.id === selectedStationId) || null
    : null;

  // --------------------------------------------------
  // Initial load: stations + guards + guardAssignments
  // --------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const fetchStationsAndGuards = async () => {
      try {
        setLoading(true);
        const [stationsData, usersData] = await Promise.all([
          getAllStations(),
          getAllUsers(),
        ]);

        if (!cancelled) {
          const normalizedStations: StationWithUsers[] = stationsData.map(
            (s) => ({
              ...s,
              active: s.active ?? true,
              stationType: s.stationType ?? null,
            })
          );

          setStations(normalizedStations);

          const guards: StationAssignedUser[] = usersData
            .filter(
              (u: UserAccount) =>
                (u.accountType || "").toUpperCase() === "GUARD"
            )
            .map((u) => ({
              id: u.accountID,
              username: u.username,
              accountType: u.accountType,
            }));

          setAllGuards(guards);

          // build guard → assigned station IDs map from users
          const assignMap: Record<number, number[]> = {};
          usersData.forEach((u: UserAccount) => {
            if (
              (u.accountType || "").toUpperCase() === "GUARD" &&
              Array.isArray(u.assignedStationIds) &&
              u.assignedStationIds.length > 0
            ) {
              assignMap[u.accountID] = u.assignedStationIds;
            }
          });
          setGuardAssignments(assignMap);

          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error(err);
          setError(err?.message || "Failed to load stations or guards");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchStationsAndGuards();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------
  // When a station is selected, load its guards
  // ---------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const fetchGuardsForStation = async () => {
      if (selectedStationId == null) {
        setAssignedUsers([]);
        setSelectedGuardIds([]);
        return;
      }

      try {
        setGuardsLoading(true);
        const guards = await getStationGuards(selectedStationId);
        if (!cancelled) {
          setAssignedUsers(guards);
          setSelectedGuardIds(guards.map((g) => g.id));
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error(err);
          setError(err?.message || "Failed to load guards for station");
        }
      } finally {
        if (!cancelled) {
          setGuardsLoading(false);
        }
      }
    };

    fetchGuardsForStation();
    return () => {
      cancelled = true;
    };
  }, [selectedStationId]);

  // -----------------------------
  // Helper: label for "elsewhere"
  // -----------------------------
  const getGuardAssignedStationLabel = (guardId: number): string | null => {
    const ids = guardAssignments[guardId];
    if (!ids || ids.length === 0) return null;

    // Backend enforces at most 1, but be defensive:
    const firstId = ids[0];
    const st = stations.find((s) => s.id === firstId);
    return st?.name || `Station #${firstId}`;
  };

  // ----------------------------------
  // Derived lists for the Assign modal
  // ----------------------------------

  const filteredGuards = useMemo(() => {
    const q = guardSearch.trim().toLowerCase();
    if (!q) return allGuards;
    return allGuards.filter((g) =>
      (g.username || "").toLowerCase().includes(q)
    );
  }, [allGuards, guardSearch]);

  // Available = not assigned here, not assigned elsewhere
  const availableGuards = useMemo(() => {
    if (selectedStationId == null) return [];

    return filteredGuards.filter((g) => {
      const assignedIds = guardAssignments[g.id] || [];
      const isAssignedHereBackend = assignedIds.includes(selectedStationId);
      const isAssignedElsewhere =
        assignedIds.length > 0 && !isAssignedHereBackend;

      // Still hard-block guards assigned to some *other* station
      if (isAssignedElsewhere) return false;

      // Globally unassigned → always available
      if (!isAssignedHereBackend) {
        return true;
      }

      // Backend says "assigned here", but if we've *deselected* them
      // in this modal, treat them as available again (visually).
      const isSelectedHere = selectedGuardIds.includes(g.id);
      return !isSelectedHere;
    });
  }, [filteredGuards, guardAssignments, selectedStationId, selectedGuardIds]);

  const originalAssignedSet = useMemo(
    () => new Set(originalAssignedGuardIds),
    [originalAssignedGuardIds]
  );

  // Assigned here = currently checked in selectedGuardIds
  const assignedHereGuards = useMemo(() => {
    if (selectedStationId == null) return [];
    return filteredGuards.filter((g) => selectedGuardIds.includes(g.id));
  }, [filteredGuards, selectedStationId, selectedGuardIds]);

  // Guards assigned to other station(s) (read-only section)
  const guardsAssignedElsewhere = useMemo(() => {
    if (selectedStationId == null) return [];

    return filteredGuards.filter((g) => {
      const assignedIds = guardAssignments[g.id] || [];
      const isAssignedHere = assignedIds.includes(selectedStationId);
      const isAssignedElsewhere =
        assignedIds.length > 0 && !isAssignedHere;
      return isAssignedElsewhere;
    });
  }, [filteredGuards, guardAssignments, selectedStationId]);

  // ------------------------------------
  // Filter stations by type + active flag
  // ------------------------------------
  const filteredStations = stations.filter((s) => {
    const rawType = (s.stationType || "").toLowerCase();
    const name = (s.name || "").toLowerCase();

    let matchesType = false;

    if (rawType === "gate" || rawType === "building") {
      matchesType = rawType === currentType;
    } else {
      // Legacy / broken rows with no type – fall back to name or show them so you can fix
      if (!name) {
        matchesType = true; // show in both tabs to allow renaming
      } else if (currentType === "gate") {
        matchesType = name.includes("gate");
      } else {
        matchesType = !name.includes("gate");
      }
    }

    if (!matchesType) return false;

    if (!showInactive) {
      return s.active !== false;
    }

    return true;
  });

  const handleToggleStationActive = async (station: StationWithUsers) => {
    const newActive = station.active === false ? true : false;
    const actionLabel = newActive ? "reactivate" : "deactivate";

    const ok = window.confirm(
      `Are you sure you want to ${actionLabel} "${station.name || `station #${station.id}`
      }"?`
    );
    if (!ok) return;

    try {
      const updated = await setStationActive(station.id, newActive);

      setStations((prev) =>
        prev.map((s) => (s.id === station.id ? { ...s, ...updated } : s))
      );

      if (!updated.active && !showInactive && selectedStationId === station.id) {
        setSelectedStationId(null);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to update station status");
    }
  };

  const handleToggleGuardSelection = (guardId: number) => {
    setSelectedGuardIds((prev) =>
      prev.includes(guardId)
        ? prev.filter((id) => id !== guardId)
        : [...prev, guardId]
    );
  };

  const openAssignModal = () => {
    if (!selectedStationId) return;
    // snapshot current assigned guards as "original"
    const currentAssignedIds = assignedUsers.map((g) => g.id);
    setOriginalAssignedGuardIds(currentAssignedIds);
    // ensure selection reflects backend state when opening
    setSelectedGuardIds(currentAssignedIds);
    setAssignModalOpen(true);
  };

  const closeAssignModal = () => {
    // revert selection back to original (discard unsaved changes)
    setSelectedGuardIds(originalAssignedGuardIds);
    setAssignModalOpen(false);
  };

  const handleSaveAssignments = async () => {
    if (!selectedStationId) return;

    try {
      await updateStationGuards(selectedStationId, selectedGuardIds);

      // refresh guards for this station + global guardAssignments
      const [updatedGuards, usersData] = await Promise.all([
        getStationGuards(selectedStationId),
        getAllUsers(),
      ]);

      setAssignedUsers(updatedGuards);

      const assignMap: Record<number, number[]> = {};
      usersData.forEach((u: UserAccount) => {
        if (
          (u.accountType || "").toUpperCase() === "GUARD" &&
          Array.isArray(u.assignedStationIds) &&
          u.assignedStationIds.length > 0
        ) {
          assignMap[u.accountID] = u.assignedStationIds;
        }
      });
      setGuardAssignments(assignMap);

      setAssignModalOpen(false);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to update station guards");
    }
  };

  // ---------- Add Station ----------

  const openCreateModal = () => {
    setCreateName("");
    setCreateType(currentType);
    setCreateError(null);
    setCreateModalOpen(true);
  };

  const handleCreateStation = async () => {
    setCreateError(null);
    const rawName = createName.trim();

    if (!rawName) {
      setCreateError("Please enter a station name.");
      return;
    }

    const exists = stations.some(
      (s) => (s.name || "").toLowerCase() === rawName.toLowerCase()
    );
    if (exists) {
      setCreateError("A station with that name already exists.");
      return;
    }

    let finalName = rawName;
    if (createType === "gate" && !rawName.toLowerCase().includes("gate")) {
      finalName = `Gate ${rawName}`;
    }

    try {
      setCreateSubmitting(true);

      const created = await createStation({
        name: finalName,
        stationType: createType, // "gate" | "building"
        active: true,
      });

      const newStation: StationWithUsers = {
        ...created,
        active: created.active ?? true,
        stationType: created.stationType ?? createType,
      };

      setStations((prev) => [...prev, newStation]);
      setCreateModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setCreateError(err?.message || "Failed to create station.");
    } finally {
      setCreateSubmitting(false);
    }
  };

  // ---------- Edit Station ----------

  const openRenameModal = () => {
    if (!selectedStation) return;

    setRenameName(selectedStation.name || "");

    const rawType = (selectedStation.stationType || "").toLowerCase();
    if (rawType === "gate" || rawType === "building") {
      setRenameType(rawType as "gate" | "building");
    } else {
      setRenameType(currentType);
    }

    setRenameError(null);
    setRenameModalOpen(true);
  };

  const handleRenameStation = async () => {
    if (!selectedStation) return;

    const rawName = renameName.trim();
    if (!rawName) {
      setRenameError("Please enter a station name.");
      return;
    }

    let finalName = rawName;
    if (renameType === "gate" && !rawName.toLowerCase().includes("gate")) {
      finalName = `Gate ${rawName}`;
    }

    const stationTypeValue = renameType; // "gate" | "building"

    try {
      setRenameSubmitting(true);

      const updated = await updateStation({
        id: selectedStation.id,
        name: finalName,
        active: selectedStation.active,
        stationType: stationTypeValue,
      });

      setStations((prev) =>
        prev.map((s) =>
          s.id === selectedStation.id
            ? {
              ...s,
              ...updated,
              active: updated.active ?? s.active ?? true,
              stationType:
                updated.stationType ??
                stationTypeValue ??
                s.stationType ??
                null,
            }
            : s
        )
      );

      setRenameModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setRenameError(err?.message || "Failed to rename station.");
    } finally {
      setRenameSubmitting(false);
    }
  };

  // =======================
  // RENDER
  // =======================
  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-4 gap-4">
        <p className="text-xl font-semibold">Stations</p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="space-x-2">
            <Button
              className="text-white"
              onClick={() => setCurrentType("gate")}
              variation={currentType === "gate" ? "primary" : "secondary"}
            >
              Gates
            </Button>
            <Button
              className="text-white"
              onClick={() => setCurrentType("building")}
              variation={currentType === "building" ? "primary" : "secondary"}
            >
              Buildings
            </Button>
          </div>
          <CheckboxTile
            checked={showInactive}
            onChange={setShowInactive}
            label="Show deactivated"
            className="text-sm"
          />
          <Button
            type="button"
            variation="primary"
            className="whitespace-nowrap"
            onClick={openCreateModal}
          >
            Add Station
          </Button>
        </div>
      </div>

      <div className="flex gap-4 h-full min-h-0">
        {/* LEFT: Station list */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-2 overflow-y-auto custom-scrollbar">
          {loading && <p>Loading stations...</p>}

          {!loading && error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          {!loading && !error && filteredStations.length === 0 && (
            <p className="text-sm text-slate-500">
              No stations found for this category.
            </p>
          )}

          {!loading && !error && filteredStations.length > 0 && (
            <>
              {filteredStations.map((station) => {
                const isActive = station.active !== false;

                return (
                  <div
                    key={station.id}
                    className={`flex items-center justify-between w-full p-2 rounded border-2 ${selectedStationId === station.id
                      ? "bg-yellow-500 border-yellow-300"
                      : "bg-yellow-600 border-yellow-300/40"
                      }`}
                  >
                    <button
                      onClick={() => setSelectedStationId(station.id)}
                      className="flex-1 text-left text-lg"
                    >
                      <span className="inline-flex items-center gap-2">
                        {(() => {
                          const t = (station.stationType || "").toLowerCase();
                          const looksLikeGate = (station.name || "").toLowerCase().includes("gate");
                          const icon = t === "gate" || (!t && looksLikeGate) ? faDungeon : farBuilding;
                          return <FontAwesomeIcon icon={icon} fixedWidth />;
                        })()}
                        <span>{station.name || `Unnamed station #${station.id}`}</span>
                      </span>
                      {!isActive && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-500/80 text-white">
                          Inactive
                        </span>
                      )}
                    </button>

                    <Button
                      variation={isActive ? "secondary" : "primary"}
                      className="ml-2 text-xs px-2 py-1"
                      onClick={() => handleToggleStationActive(station)}
                    >
                      {isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* RIGHT: Station details */}
        <div className="flex-1 flex flex-col p-4 rounded-xl border border-white/20 bg-slate-900/50 overflow-y-auto custom-scrollbar">
          {selectedStation ? (
            <>
              {/* Header: name + type + active badge + actions */}
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-semibold">
                      <span className="inline-flex items-center gap-2">
                        {(() => {
                          const t = (selectedStation.stationType || "").toLowerCase();
                          const looksLikeGate = (selectedStation.name || "").toLowerCase().includes("gate");
                          const icon = t === "gate" || (!t && looksLikeGate) ? faDungeon : farBuilding;
                          return <FontAwesomeIcon icon={icon} fixedWidth />;
                        })()}
                        <span>{selectedStation.name || `Unnamed station #${selectedStation.id}`}</span>
                      </span>
                    </h1>
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/30 uppercase tracking-wide text-white/80">
                      {(selectedStation.stationType || currentType)
                        .toString()
                        .toUpperCase()}
                    </span>
                    {selectedStation.active !== false ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-600/80 text-white">
                        Active
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-600/80 text-white">
                        Inactive
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 max-w-xl">
                    Manage which guards are assigned to this station. Guards can
                    only belong to one station at a time for login and RFID
                    operations.
                  </p>
                </div>

                <div className="flex gap-2 items-center">
                  <Button
                    variation="secondary"
                    onClick={openAssignModal}
                    className="text-sm"
                  >
                    Assign guards
                  </Button>
                  <Button
                    variation="secondary"
                    onClick={openRenameModal}
                    className="text-sm"
                  >
                    Edit station
                  </Button>
                  <Button
                    onClick={() => setSelectedStationId(null)}
                    className="text-sm"
                  >
                    Close
                  </Button>
                </div>
              </div>

              {/* Guard summary */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-100">
                  Assigned guards
                </p>
                <p className="text-xs text-slate-300">
                  {guardsLoading
                    ? "Loading…"
                    : assignedUsers.length === 0
                      ? "0 guards assigned"
                      : `${assignedUsers.length} guard${assignedUsers.length > 1 ? "s" : ""
                      } assigned`}
                </p>
              </div>

              {/* Guard list */}
              {guardsLoading ? (
                <p className="text-sm text-slate-500">Loading guards...</p>
              ) : assignedUsers.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {assignedUsers.map((u) => {
                    return (
                      <div
                        key={u.id}
                        className="flex items-center gap-3 rounded-lg border border-white/15 bg-slate-800/60 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {u.username}
                          </p>
                          <p className="text-[11px] text-slate-300 uppercase tracking-wide">
                            {u.accountType}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-dashed border-slate-500/60 bg-slate-900/40 px-4 py-6 text-sm text-slate-300 flex flex-col items-start gap-2">
                  <p>No guards assigned to this station yet.</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              Select a station from the left to view its assigned guards and
              details.
            </div>
          )}
        </div>
      </div>

      {/* Assign Guards modal */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="Assign Guards"
      >
        <div className="flex flex-col gap-2">
          {/* Helper text */}
          <p className="text-[11px] text-slate-300 leading-tight">
            Assign guards to{" "}
            <span className="font-semibold">
              {selectedStation?.name ?? "this station"}
            </span>. A guard can only be assigned to one station at a time.
          </p>

          {/* Search */}
          <div className="flex items-center gap-2">
            <Input
              className="w-full text-dark-gray text-xs py-1.5"
              placeholder="Search guards..."
              value={guardSearch}
              onChange={(e) => setGuardSearch(e.target.value)}
            />
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
            {/* LEFT: Available guards */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-slate-200">
                  Available guards
                </p>
                <span className="text-[10px] text-slate-400">
                  {availableGuards.length} found
                </span>
              </div>

              <div className="flex flex-col gap-0.5 h-50 overflow-y-auto custom-scrollbar border border-white/10 rounded-md p-1 bg-slate-900/40">
                {availableGuards.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No unassigned guards match this search.
                  </p>
                ) : (
                  availableGuards.map((g) => {
                    const isChecked = selectedGuardIds.includes(g.id);

                    return (
                      <button
                        key={g.id}
                        type="button"
                        className={`w-full flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-left text-[11px] ${isChecked
                          ? "bg-yellow-600/60"
                          : "bg-slate-800/40 hover:bg-slate-700/70"
                          }`}
                        onClick={() => handleToggleGuardSelection(g.id)}
                      >
                        <span className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            className="h-3 w-3 rounded border-slate-400 bg-slate-900"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleGuardSelection(g.id);
                            }}
                          />
                          <span className="text-[11px] text-slate-50 truncate">
                            {g.username}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {guardsAssignedElsewhere.length > 0 && (
                <p className="mt-1 text-[10px] text-amber-300">
                  {guardsAssignedElsewhere.length} guard
                  {guardsAssignedElsewhere.length > 1 ? "s" : ""} already
                  assigned to another station.
                </p>
              )}
            </div>

            {/* RIGHT: Assigned here + elsewhere list */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-slate-200">
                  Assigned to this station
                </p>
                <span className="text-[10px] text-slate-400">
                  {assignedHereGuards.length} selected
                </span>
              </div>

              <div className="flex flex-col gap-0.5 h-35 overflow-y-auto custom-scrollbar border border-white/10 rounded-md p-1 bg-slate-900/40">
                {assignedHereGuards.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No guards currently assigned here.
                  </p>
                ) : (
                  assignedHereGuards.map((g) => {
                    const isOriginal = originalAssignedSet.has(g.id);

                    const bgClass = isOriginal
                      ? "bg-emerald-600/80" // already assigned (green-ish)
                      : "bg-yellow-500/80"; // newly selected (yellow)

                    const textLabel = isOriginal ? "Existing" : "New";

                    return (
                      <div
                        key={g.id}
                        className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] ${bgClass}`}
                      >
                        <span className="text-slate-50 truncate">
                          {g.username}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-900/90 bg-white/80 rounded px-1.5 py-0.5">
                            {textLabel}
                          </span>
                          <button
                            type="button"
                            className="text-[10px] text-slate-900 bg-white/90 rounded px-2 py-0.5 hover:bg-white"
                            onClick={() => handleToggleGuardSelection(g.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {guardsAssignedElsewhere.length > 0 && (
                <div className="mt-1 border border-amber-500/40 rounded-md px-2 py-1 bg-slate-900/60">
                  <p className="text-[10px] text-amber-300 font-semibold mb-1">
                    Assigned to other stations
                  </p>
                  <ul className="space-y-0.5 max-h-20 overflow-y-auto custom-scrollbar">
                    {guardsAssignedElsewhere.map((g) => (
                      <li
                        key={g.id}
                        className="text-[10px] text-slate-200 flex justify-between gap-2"
                      >
                        <span className="truncate">{g.username}</span>
                        <span className="truncate text-amber-300">
                          {getGuardAssignedStationLabel(g.id)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 mt-2">
            <Button
              variation="secondary"
              onClick={closeAssignModal}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveAssignments}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Create Station modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Add Station"
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="block mb-1 text-sm text-white/80">
              Station Type
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variation={createType === "gate" ? "primary" : "secondary"}
                onClick={() => setCreateType("gate")}
              >
                Gate
              </Button>
              <Button
                type="button"
                variation={createType === "building" ? "primary" : "secondary"}
                onClick={() => setCreateType("building")}
              >
                Building
              </Button>
            </div>
          </div>

          <div>
            <label className="block mb-1 text-sm text-white/80">
              Station Name
            </label>
            <Input
              className="w-full"
              placeholder={
                createType === "gate" ? "e.g. Gate 3" : "e.g. Main Lobby"
              }
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
            <p className="text-xs text-white/60 mt-1">
              For gates, names containing &quot;Gate&quot; will be treated as
              entry/exit points in the system.
            </p>
            {createError && (
              <p className="text-xs text-red-400 mt-1">{createError}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variation="secondary"
              type="button"
              onClick={() => setCreateModalOpen(false)}
              disabled={createSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateStation}
              disabled={createSubmitting}
            >
              {createSubmitting ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Station modal */}
      <Modal
        isOpen={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
        title="Edit Station"
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="block mb-1 text-sm text-white/80">
              Station Type
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variation={renameType === "gate" ? "primary" : "secondary"}
                onClick={() => setRenameType("gate")}
              >
                Gate
              </Button>
              <Button
                type="button"
                variation={renameType === "building" ? "primary" : "secondary"}
                onClick={() => setRenameType("building")}
              >
                Building
              </Button>
            </div>
          </div>

          <div>
            <label className="block mb-1 text-sm text-white/80">
              Station Name
            </label>
            <Input
              className="w-full"
              placeholder={
                renameType === "gate" ? "e.g. Gate 1" : "e.g. Main Lobby"
              }
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
            />
            <p className="text-xs text-white/60 mt-1">
              For gates, names containing &quot;Gate&quot; will be treated as
              entry/exit points in the system.
            </p>
            {renameError && (
              <p className="text-xs text-red-400 mt-1">{renameError}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variation="secondary"
              type="button"
              onClick={() => setRenameModalOpen(false)}
              disabled={renameSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleRenameStation}
              disabled={renameSubmitting}
            >
              {renameSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
