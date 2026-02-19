import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useCookies } from "react-cookie";
import Select from "../../components/common/Select";
import DashboardLayout from "../../layouts/DashboardLayout";
import Modal from "../../components/common/Modal";
import Button from "../../components/common/Button";
import Meta from "../../utils/Meta";
import { useToast } from "../../contexts/ToastContext";

import { useCamera } from "../../hooks/useCamera";
import { registerVisitor, getStationById, type Station } from "../../api/Index";

import {
  type ExtractedInfo,
  cropIdCardFromDataUrl,
  ID_TYPE_OPTIONS,
  scanCardImage,
  validateExtractedFieldsForScan,
} from "../../features/id";

import type { CropResult } from "../../utils/cardCropper";

import { PURPOSE_OPTIONS } from "../../constants/purposeOptions";
import {
  VISITOR_TYPE_OPTIONS,
  normalizeVisitorType,
} from "../../constants/visitorTypes";
import { GENDER_OPTIONS } from "../../constants/genderOptions";

interface ExtendedExtractedInfo extends ExtractedInfo {
  purposeOfVisit: string;
  visitorType?: string;
  gender?: string;
}

interface ManualData {
  fullName: string;
  dob: string;
  idNumber: string;
}

function clampDobInput(raw: string): string {
  if (!raw) return "";

  // Expect full ISO-like value: YYYY-MM-DD
  if (raw.length !== 10) return raw;

  const [yearStr, month, day] = raw.split("-");
  let year = Number(yearStr);
  if (Number.isNaN(year)) return raw;

  const currentYear = new Date().getFullYear();
  const MIN_YEAR = 1900;

  if (year < MIN_YEAR) year = MIN_YEAR;
  if (year > currentYear) year = currentYear;

  return `${String(year).padStart(4, "0")}-${month}-${day}`;
}

function DataPrivacyNotice() {
  return (
    <div className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-300 leading-snug">
      This system collects personal information from IDs for visitor logging and campus security.
      Captured data may include name, date of birth, ID number, ID type, purpose of visit, and a photo (if taken).
      Please scan only with the visitor&apos;s consent and follow your organization&apos;s data privacy policy.
    </div>
  );
}


export default function ScanIdPage() {
  Meta({ title: "Scan Visitor ID - iVisit" });

  const navigate = useNavigate();
  const [cookies] = useCookies(["role", "stationId"]);
  const role = cookies.role as "admin" | "guard" | "support" | undefined;
  const rawStationId = cookies.stationId;
  const { showToast } = useToast();
  const todayIso = new Date().toISOString().slice(0, 10);

  const [isGateStation, setIsGateStation] = useState<boolean | null>(null);

  const [roiPreviews, setRoiPreviews] = useState<{
    lastName?: string;
    givenNames?: string;
    middleName?: string;
  } | null>(null);

  useEffect(() => {
    if (role !== "guard") {
      setIsGateStation(null); // not relevant
      return;
    }

    if (rawStationId == null) {
      setIsGateStation(false);
      return;
    }

    const parsed =
      typeof rawStationId === "number"
        ? rawStationId
        : Number.parseInt(String(rawStationId), 10);

    if (Number.isNaN(parsed)) {
      setIsGateStation(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const station: Station = await getStationById(parsed);
        if (cancelled) return;

        const type = ((station as any).stationType || "").toUpperCase();
        const isGateExplicit = type === "GATE";

        const name = (station.name || "").toLowerCase();
        const looksLikeGateByName = name.includes("gate");

        setIsGateStation(isGateExplicit || looksLikeGateByName);
      } catch {
        if (!cancelled) setIsGateStation(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [role, rawStationId]);

  // If a guard at a non-gate tries to open ScanId, punt them to Log Visitor
  if (role === "guard" && isGateStation === false) {
    return <Navigate to="/dashboard/log-visitor" replace />;
  }

  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);

  // Single source-of-truth dropdown states
  const [selectedVisitorType, setSelectedVisitorType] = useState<string>("");
  const [selectedIdType, setSelectedIdType] = useState<string>("");
  const [selectedPurpose, setSelectedPurpose] = useState<string>("");
  const [selectedGender, setSelectedGender] = useState<string>("");

  const [extractedInfo, setExtractedInfo] =
    useState<ExtendedExtractedInfo | null>(null);

  // Debug / feedback preview of what OCR actually saw
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);

  // Manual only keeps identity fields; classification is via selected* states
  const [manualData, setManualData] = useState<ManualData>({
    fullName: "",
    dob: "",
    idNumber: "",
  });

  const [capturedVisitorPhoto, setCapturedVisitorPhoto] =
    useState<string | null>(null);
  const [isVisitorCameraOpen, setIsVisitorCameraOpen] =
    useState<boolean>(false);

  // For the live scan modal
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [isFrozen, setIsFrozen] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Camera hook for ID/OCR
  const {
    videoRef,
    startCamera,
    stopCamera,
    captureFrame,
    error: cameraError,
    resolution: idCameraResolution,
  } = useCamera();

  // Camera hook for visitor photo
  const {
    videoRef: visitorVideoRef,
    startCamera: startVisitorCamera,
    stopCamera: stopVisitorCamera,
    captureFrame: captureVisitorFrame,
    error: visitorCameraError,
    resolution: visitorCameraResolution,
  } = useCamera();

  // Start/stop ID camera when modal opens/closes
  useEffect(() => {
    if (isCameraModalOpen) {
      startCamera();
    } else {
      stopCamera();
      // Also reset frozen state when modal is closed
      setIsFrozen(false);
      setScanPreview(null);
    }
  }, [isCameraModalOpen, startCamera, stopCamera]);

  // Start/stop visitor camera when modal opens/closes
  useEffect(() => {
    if (isVisitorCameraOpen) {
      setCapturedVisitorPhoto(null);
      startVisitorCamera();
    } else {
      stopVisitorCamera();
    }
  }, [isVisitorCameraOpen, startVisitorCamera, stopVisitorCamera]);

  const debug = false;
  const MIN_SHARPNESS = 6.5; // tune as needed

  // ID scan + OCR + parsing (ROI + whole-card fallback)
  const handleScanClick = async () => {
    if (scanning) return;

    if (!selectedIdType) {
      showToast("Please select an ID type before scanning.", {
        variant: "warning",
      });
      return;
    }

    setScanning(true);

    // Short delay so the guard can steady the card
    await new Promise((resolve) => setTimeout(resolve, 700));

    // Collect a few frames, each with its own crop attempt
    const attempts: { dataUrl: string; crop?: CropResult }[] = [];

    for (let i = 0; i < 3; i++) {
      const frame = captureFrame();
      if (frame) {
        try {
          const crop = await cropIdCardFromDataUrl(frame);
          attempts.push({ dataUrl: frame, crop });
        } catch {
          attempts.push({ dataUrl: frame });
        }
      }

      // Small spacing between frames (except after the last)
      if (i < 2) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    if (attempts.length === 0) {
      showToast("Unable to capture image from camera.", { variant: "error" });
      setScanning(false);
      return;
    }

    // Choose the best attempt based on crop success + sharpness
    let best = attempts[0];

    for (const a of attempts) {
      const c = a.crop;
      const b = best.crop;

      if (c && c.success && c.sharpness != null) {
        if (!b || !b.success || b.sharpness == null || c.sharpness > b.sharpness) {
          best = a;
        }
      }
    }

    let finalDataUrl = best.dataUrl;
    const bestCrop = best.crop;

    if (bestCrop && bestCrop.success && bestCrop.dataUrl) {
      finalDataUrl = bestCrop.dataUrl;
    } else if (bestCrop && bestCrop.reason) {
      showToast(bestCrop.reason, { variant: "warning" });
    }

    // Freeze current frame in the modal (what OCR will actually see)
    setScanPreview(finalDataUrl);
    setIsFrozen(true);
    stopCamera();

    // Optional sharpness gate: if we have a crop and it's very blurry, force rescan
    if (bestCrop && bestCrop.success && bestCrop.sharpness != null) {
      if (bestCrop.sharpness < MIN_SHARPNESS) {
        showToast(
          "Image too blurry. Please hold the ID steady and move it closer, then try again.",
          { variant: "warning" }
        );
        setIsFrozen(false);
        setScanPreview(null);
        startCamera();
        setScanning(false);
        return;
      }
    }
    if (bestCrop && bestCrop.success && bestCrop.sharpness != null) {
      console.log("Best crop sharpness:", bestCrop.sharpness);
    }


    try {
      // Show what OCR will actually see in the debug preview
      setCroppedPreview(finalDataUrl);

      const {
        merged,
        hasUsefulData,
        roiHasAnyData,
        roiImages,
      } = await scanCardImage(finalDataUrl, selectedIdType);

      // ROI preview debug — keep this UI behavior here
      if (selectedIdType === "National ID") {
        setRoiPreviews({
          lastName: roiImages.lastName || undefined,
          givenNames: roiImages.givenNames || undefined,
          middleName: roiImages.middleName || undefined,
        });
      } else {
        setRoiPreviews(null);
      }

      const mergedFullName = merged.fullName;
      const mergedDob = merged.dob;
      const mergedIdNumber = merged.idNumber;
      const mergedIdType = merged.idType;

      const trimmedFullName = (mergedFullName || "").trim();
      const trimmedDob = (mergedDob || "").trim();
      const trimmedIdNumber = (mergedIdNumber || "").trim();

      // Did we get anything at all?
      const hasAnyCoreField =
        !!trimmedFullName || !!trimmedDob || !!trimmedIdNumber;

      // Hard-fail only if literally nothing was read from either ROI or full-card
      if (!hasAnyCoreField && !roiHasAnyData) {
        showToast(
          "Scan failed: could not read any details. Adjust lighting/position, retry, or use Manual Entry.",
          { variant: "error" }
        );

        setIsFrozen(false);
        setScanPreview(null);
        startCamera();
        return;
      }

      // If the pipeline says the data isn't fully reliable, just warn
      if (!hasUsefulData) {
        showToast(
          "OCR results may be incomplete or noisy. Please review and correct before submitting.",
          { variant: "warning" }
        );
      }

      const extended: ExtendedExtractedInfo = {
        fullName: mergedFullName,
        dob: mergedDob,
        idNumber: mergedIdNumber,
        idType: mergedIdType,
        purposeOfVisit: selectedPurpose || "Others",
        visitorType: selectedVisitorType || "Guest / Visitor",
        gender: selectedGender || "",
      };

      setExtractedInfo(extended);
      setManualData({
        fullName: mergedFullName,
        dob: mergedDob,
        idNumber: mergedIdNumber,
      });

      // Close modal, unfreeze and keep camera stopped
      setIsCameraModalOpen(false);
      setIsFrozen(false);
      setScanPreview(null);
      stopCamera();
    } catch (err: any) {
      console.error(err);
      showToast(
        err?.message || "OCR failed — check helper connection and try again.",
        { variant: "error" }
      );
      setIsFrozen(false);
      setScanPreview(null);
      startCamera();
    } finally {
      setScanning(false);
    }
  };

  // Manual save -> fill extractedInfo with manualData + current dropdowns
  const handleManualSave = () => {
    const extended: ExtendedExtractedInfo = {
      fullName: manualData.fullName,
      dob: manualData.dob,
      idNumber: manualData.idNumber,
      idType: selectedIdType || extractedInfo?.idType || "Unknown",
      purposeOfVisit:
        selectedPurpose ||
        extractedInfo?.purposeOfVisit ||
        "General Visit",
      visitorType:
        selectedVisitorType ||
        extractedInfo?.visitorType ||
        "Guest / Visitor",
      gender:
        selectedGender || extractedInfo?.gender || "Unspecified",
    };

    setExtractedInfo(extended);
    setIsManualModalOpen(false);
  };

  // Visitor photo capture
  const handleCaptureVisitorPhoto = () => {
    const dataUrl = captureVisitorFrame();
    if (!dataUrl) {
      showToast("Unable to capture visitor photo", { variant: "error" });
      return;
    }
    stopVisitorCamera();
    setCapturedVisitorPhoto(dataUrl);
    setIsVisitorCameraOpen(false);
  };

  // Submit visitor to backend and redirect to LogVisitor
  const handleSubmitVisitor = async () => {
    if (!extractedInfo) {
      showToast("No visitor data available to submit.", {
        variant: "warning",
      });
      return;
    }
    if (submitting) return;
    setSubmitting(true);

    try {
      const fullName = (extractedInfo.fullName || "").trim();
      const dob = (extractedInfo.dob || "").trim();
      const idNumber = (extractedInfo.idNumber || "").trim();

      const effectiveIdType =
        selectedIdType ||
        extractedInfo.idType ||
        "";

      const effectiveVisitorType =
        normalizeVisitorType(
          selectedVisitorType || extractedInfo.visitorType || ""
        ) || "";

      const effectiveGender =
        selectedGender ||
        extractedInfo.gender ||
        "";

      const effectivePurpose =
        selectedPurpose ||
        extractedInfo.purposeOfVisit ||
        "";

      // FRONTEND REQUIRED-FIELD CHECK
      if (!fullName) {
        showToast("Full name is required.", { variant: "warning" });
        setSubmitting(false);
        return;
      }
      if (!dob) {
        showToast("Date of birth is required.", { variant: "warning" });
        setSubmitting(false);
        return;
      }
      if (!idNumber) {
        showToast("ID number is required.", { variant: "warning" });
        setSubmitting(false);
        return;
      }
      if (!effectiveIdType) {
        showToast("ID type is required.", { variant: "warning" });
        setSubmitting(false);
        return;
      }
      if (!effectiveVisitorType) {
        showToast("Visitor type is required.", { variant: "warning" });
        setSubmitting(false);
        return;
      }
      if (!effectiveGender) {
        showToast("Gender is required.", { variant: "warning" });
        setSubmitting(false);
        return;
      }
      if (!effectivePurpose) {
        showToast("Purpose of visit is required.", { variant: "warning" });
        setSubmitting(false);
        return;
      }
      // Field-quality validation (no digits in name, valid DOB, ID format, etc.)
      const validation = validateExtractedFieldsForScan(
        effectiveIdType,
        fullName,
        dob,
        idNumber
      );

      if (!validation.ok) {
        const joined = validation.failedFields.join(", ");
        showToast(
          `Please double-check the following field(s): ${joined}.`,
          { variant: "warning" }
        );
        setSubmitting(false);
        return;
      }

      const visitorData = {
        fullName,
        dob,
        idNumber,
        idType: effectiveIdType,
        visitorType: effectiveVisitorType,
        gender: effectiveGender,
      };

      let visitorPhotoFile: File | undefined;
      if (capturedVisitorPhoto) {
        const blob = await (await fetch(capturedVisitorPhoto)).blob();
        visitorPhotoFile = new File([blob], "visitor_photo.png", {
          type: "image/png",
        });
      }

      const savedVisitor = await registerVisitor({
        ...visitorData,
        personPhoto: visitorPhotoFile,
      });

      const purposeToCarry =
        selectedPurpose ||
        extractedInfo.purposeOfVisit ||
        "General Visit";

      const params = new URLSearchParams();
      params.set("focus", String(savedVisitor.visitorId));
      if (purposeToCarry) {
        params.set("purpose", purposeToCarry);
      }

      showToast(`Visitor registered: ${visitorData.fullName}`, {
        variant: "success",
      });

      navigate(`/dashboard/log-visitor?${params.toString()}`);
    } catch (error: any) {
      console.error("Failed to submit visitor:", error);
      showToast(error?.message || "Failed to register visitor.", {
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDiscard = () => {
    setExtractedInfo(null);
    setManualData({
      fullName: "",
      dob: "",
      idNumber: "",
    });
    setSelectedIdType("");
    setSelectedPurpose("");
    setSelectedVisitorType("");
    setSelectedGender("");
    setCapturedVisitorPhoto(null);
    setCroppedPreview(null);
    setScanPreview(null);
    setIsFrozen(false);
    stopCamera();
    stopVisitorCamera();
  };

  return (
    <DashboardLayout>
      {/* Header + controls */}
      <div className="mb-4">
        <div className="bg-white/5 p-4 rounded-lg shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xl font-semibold">Scan ID</p>
              <p className="text-sm text-gray-400">
                Take a clear photo of the ID; the system will handle the rest.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <Button
                variation="secondary"
                onClick={() => setIsManualModalOpen(true)}
              >
                Manual Entry
              </Button>
              <Button
                variation="primary"
                onClick={() => {
                  if (!selectedIdType) {
                    showToast("Please select an ID type first.", {
                      variant: "warning",
                    });
                    return;
                  }
                  setIsCameraModalOpen(true);
                }}
              >
                Open Camera
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <Select
              id="id-type"
              value={selectedIdType}
              options={ID_TYPE_OPTIONS}
              placeholder="Select ID type"
              onChange={setSelectedIdType}
            />
          </div>

          <div className="mt-4 flex md:hidden gap-3">
            <Button
              variation="primary"
              onClick={() => {
                if (!selectedIdType) {
                  showToast("Please select an ID type first.", {
                    variant: "warning",
                  });
                  return;
                }
                setIsCameraModalOpen(true);
              }}
            >
              Open Camera
            </Button>
            <Button
              variation="secondary"
              onClick={() => setIsManualModalOpen(true)}
            >
              Manual Entry
            </Button>
          </div>
        </div>

        <div className="bg-white/5 p-4 rounded-lg shadow-sm mt-4 space-y-2">
          <Select
            id="purpose"
            value={selectedPurpose}
            options={PURPOSE_OPTIONS}
            placeholder="Select purpose of visit"
            onChange={(value) => setSelectedPurpose(value)}
            className="scanid-compact-select"
          />
          <Select
            id="visitor-type"
            value={selectedVisitorType}
            options={VISITOR_TYPE_OPTIONS}
            placeholder="Visitor type"
            onChange={setSelectedVisitorType}
            className="scanid-compact-select"
          />
          <Select
            id="gender"
            value={selectedGender}
            options={GENDER_OPTIONS}
            placeholder="gender"
            onChange={setSelectedGender}
            className="scanid-compact-select"
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex mt-4 gap-6">
        {/* Extracted Info */}
        <div className="bg-white/4 p-4 rounded w-1/2 shadow-inner">
          <p className="text-lg font-semibold mb-3">Extracted Info</p>
          {extractedInfo ? (
            <div className="space-y-3">
              <div className="flex justify-between items-start border-b border-white/10 pb-2">
                <span className="text-sm text-gray-300">Full Name</span>
                <span className="font-medium">
                  {extractedInfo.fullName}
                </span>
              </div>

              <div className="flex justify-between items-start border-b border-white/10 pb-2">
                <span className="text-sm text-gray-300">
                  Date of Birth
                </span>
                <span className="font-medium">
                  {extractedInfo.dob}
                </span>
              </div>

              <div className="flex justify-between items-start border-b border-white/10 pb-2">
                <span className="text-sm text-gray-300">ID Number</span>
                <span className="font-medium">
                  {extractedInfo.idNumber}
                </span>
              </div>

              <div className="flex justify-between items-start border-b border-white/10 pb-2">
                <span className="text-sm text-gray-300">ID Type</span>
                <span className="font-medium">
                  {selectedIdType || extractedInfo.idType}
                </span>
              </div>

              <div className="flex justify-between items-start border-b border-white/10 pb-2">
                <span className="text-sm text-gray-300">Purpose</span>
                <span className="font-medium">
                  {selectedPurpose ||
                    extractedInfo.purposeOfVisit ||
                    "Others"}
                </span>
              </div>

              <div className="flex justify-between items-start border-b border-white/10 pb-2">
                <span className="text-sm text-gray-300">
                  Visitor Type
                </span>
                <span className="font-medium">
                  {selectedVisitorType ||
                    extractedInfo.visitorType ||
                    "Guest / Visitor"}
                </span>
              </div>

              <div className="flex justify-between items-start border-b border-white/10 pb-2">
                <span className="text-sm text-gray-300">Gender</span>
                <span className="font-medium">
                  {selectedGender ||
                    extractedInfo.gender ||
                    "Unspecified"}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No data extracted yet.</p>
          )}

          {debug && croppedPreview && (
            <div className="mt-3 border border-white/10 rounded p-2">
              <p className="text-xs text-gray-400 mb-1">
                Debug preview – this is the image used for OCR:
              </p>
              <img
                src={croppedPreview}
                alt="Cropped ID preview"
                className="max-h-40 object-contain mx-auto rounded"
              />
            </div>
          )}
          {debug && roiPreviews && (
            <div className="mt-4">
              <h3>ROI Previews (Name Lines)</h3>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {roiPreviews.lastName && (
                  <div>
                    <p>Last Name ROI</p>
                    <img
                      src={roiPreviews.lastName}
                      alt="Last Name ROI"
                      className="border"
                      style={{ maxWidth: "200px" }}
                    />
                  </div>
                )}
                {roiPreviews.givenNames && (
                  <div>
                    <p>Given Names ROI</p>
                    <img
                      src={roiPreviews.givenNames}
                      alt="Given Names ROI"
                      className="border"
                      style={{ maxWidth: "200px" }}
                    />
                  </div>
                )}
                {roiPreviews.middleName && (
                  <div>
                    <p>Middle Name ROI</p>
                    <img
                      src={roiPreviews.middleName}
                      alt="Middle Name ROI"
                      className="border"
                      style={{ maxWidth: "200px" }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Visitor Photo Section */}
        <div className="border p-4 rounded w-1/2 flex flex-col items-center justify-center gap-3">
          {capturedVisitorPhoto ? (
            <img
              src={capturedVisitorPhoto}
              alt="Visitor Photo"
              className="w-32 h-32 rounded-full object-cover border"
            />
          ) : (
            <div className="w-32 h-32 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-500 text-sm">
              No photo
            </div>
          )}
          <Button onClick={() => setIsVisitorCameraOpen(true)}>
            {capturedVisitorPhoto ? "Retake Photo" : "Take Photo"}
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex gap-4">
        <Button
          variation="primary"
          className="flex-1"
          onClick={handleSubmitVisitor}
          disabled={submitting}
        >
          {submitting ? "Submitting..." : "Submit Visitor"}
        </Button>
        <Button
          variation="outlined"
          className="flex-1"
          onClick={handleDiscard}
        >
          Discard
        </Button>
      </div>

      {/* ID Scan Modal */}
      <Modal
        isOpen={isCameraModalOpen}
        onClose={() => {
          setIsCameraModalOpen(false);
          setIsFrozen(false);
          setScanPreview(null);
          stopCamera();
        }}
        title="Scan ID"
      >
        <div className="flex gap-4 flex-col items-center w-full">
          {cameraError ? (
            <p className="text-red-500">{cameraError}</p>
          ) : isFrozen && scanPreview ? (
            <img
              src={scanPreview}
              alt="Captured ID frame"
              className="w-full max-w-md rounded-lg"
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full max-w-md rounded-lg"
            />
          )}

          {!cameraError && !isFrozen && idCameraResolution && (
            <p className="text-[11px] text-slate-400">
              Camera resolution: {idCameraResolution.width}×{idCameraResolution.height}
            </p>
          )}

          <p className="text-xs text-gray-400 text-center">
            Take a clear photo of the ID. You don&apos;t need to align it
            perfectly; the system will detect and process the card.
          </p>

          <Button
            variation="primary"
            onClick={handleScanClick}
            disabled={scanning}
            className={scanning ? "opacity-60 cursor-not-allowed" : ""}
          >
            {scanning ? "Scanning..." : "Scan"}
          </Button>

          <DataPrivacyNotice />
        </div>
      </Modal>

      {/* Visitor Photo Modal */}
      <Modal
        isOpen={isVisitorCameraOpen}
        onClose={() => {
          stopVisitorCamera();
          setIsVisitorCameraOpen(false);
        }}
        title="Take Visitor Photo"
      >
        <div className="flex gap-4 flex-col items-center">
          {visitorCameraError ? (
            <p className="text-red-500">{visitorCameraError}</p>
          ) : (
            <video
              ref={visitorVideoRef}
              autoPlay
              playsInline
              style={{ width: "100%", borderRadius: "8px" }}
            />
          )}

          {!cameraError && !isFrozen && visitorCameraResolution && (
            <p className="text-[11px] text-slate-400">
              Camera resolution: {visitorCameraResolution.width}×{visitorCameraResolution.height}
            </p>
          )}

          <div className="flex gap-2 mt-3">
            <Button onClick={handleCaptureVisitorPhoto}>Capture</Button>
            <Button
              className="bg-gray-500 text-white"
              onClick={() => {
                stopVisitorCamera();
                setIsVisitorCameraOpen(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Manual Entry Modal */}
      <Modal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        title="Manual Data Entry"
      >
        <div className="flex flex-col gap-4">
          <DataPrivacyNotice />

          {/* Dropdowns share the same state as the main page */}
          <Select
            id="manual-id-type"
            value={selectedIdType}
            options={ID_TYPE_OPTIONS}
            placeholder="Select ID type"
            onChange={setSelectedIdType}
          />
          <Select
            id="manual-purpose"
            value={selectedPurpose}
            options={PURPOSE_OPTIONS}
            placeholder="Select purpose of visit"
            onChange={setSelectedPurpose}
          />
          <Select
            id="manual-visitor-type"
            value={selectedVisitorType}
            options={VISITOR_TYPE_OPTIONS}
            placeholder="Visitor type"
            onChange={setSelectedVisitorType}
          />
          <Select
            id="manual-gender"
            value={selectedGender}
            options={GENDER_OPTIONS}
            placeholder="gender"
            onChange={setSelectedGender}
          />
          <input
            type="text"
            placeholder="Full Name"
            className="border rounded px-3 py-2"
            value={manualData.fullName}
            onChange={(e) =>
              setManualData((prev) => ({
                ...prev,
                fullName: e.target.value,
              }))
            }
          />
          <input
            type="date"
            placeholder="Date of Birth"
            className="border rounded px-3 py-2"
            value={manualData.dob}
            min="1900-01-01"
            max={todayIso}
            onChange={(e) =>
              setManualData((prev) => ({
                ...prev,
                dob: e.target.value,          // raw while typing
              }))
            }
            onBlur={(e) =>
              setManualData((prev) => ({
                ...prev,
                dob: clampDobInput(e.target.value),  // clamp when leaving field
              }))
            }
          />
          <input
            type="text"
            placeholder="ID Number"
            className="border rounded px-3 py-2"
            value={manualData.idNumber}
            onChange={(e) =>
              setManualData((prev) => ({
                ...prev,
                idNumber: e.target.value,
              }))
            }
          />
          <div className="flex justify-end">
            <Button onClick={handleManualSave}>Save</Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
