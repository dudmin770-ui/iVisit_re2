import { useState, useEffect } from "react";
import DashboardLayout from "../../layouts/DashboardLayout";
import Modal from "../../components/common/Modal";
import Button from "../../components/common/Button";
import { useToast } from "../../contexts/ToastContext";
import { useCamera } from "../../hooks/useCamera";

import {
    cropIdCardFromDataUrl,
    scanCardImage,
    type ScanCardImageResult,
    getIdTypeOptions,
} from "../../features/id";
import type { CropResult } from "../../utils/cardCropper";

const HELPER_BASE_URL = import.meta.env.VITE_HELPER_BASE_URL || "http://localhost:8765";

interface OcrResult {
  engine: "tess" | "vision" | "ocrspace";
  text: string;
  error?: string;
  meanConfidence?: number; // tess only
  personNames?: string[];  // tess only
  fields?: Record<string, string>; // vision/ocrspace usually
  meta?: Record<string, any>;      // optional debug extras
}

export default function OcrDebugPage() {
    const { showToast } = useToast();

    const {
        videoRef,
        startCamera,
        stopCamera,
        captureFrame,
        error: cameraError,
    } = useCamera();

    const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
    const [isFrozen, setIsFrozen] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanPreview, setScanPreview] = useState<string | null>(null);

    const [results, setResults] = useState<OcrResult[]>([]);
    const [cropInfo, setCropInfo] = useState<{
        usedCrop: boolean;
        sharpness?: number;
        reason?: string;
    } | null>(null);

    const [idType, setIdType] = useState("National ID");
    const [pipelineResult, setPipelineResult] = useState<ScanCardImageResult | null>(null);

    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [helperProcessedImage, setHelperProcessedImage] = useState<string | null>(null);

    const idTypeOptions = getIdTypeOptions(true);



    // Start/stop camera with modal
    useEffect(() => {
        if (isCameraModalOpen) {
            startCamera();
        } else {
            stopCamera();
        }
    }, [isCameraModalOpen, startCamera, stopCamera]);

    const handleOpenCamera = () => {
        setResults([]);
        setIsCameraModalOpen(true);
    };

    const handleScanClick = async () => {
        if (scanning) return;

        setScanning(true);
        setResults([]);
        setPipelineResult(null);

        // Short delay so the card can be steadied
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

            if (i < 2) {
                await new Promise((resolve) => setTimeout(resolve, 150));
            }
        }

        console.log("OCR debug attempts:", attempts);

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

        const usedCrop = !!(bestCrop && bestCrop.success && bestCrop.dataUrl);

        setCropInfo({
            usedCrop,
            sharpness: bestCrop?.sharpness ?? undefined,
            reason: bestCrop?.reason,
        });

        const MIN_SHARPNESS = 4;

        if (bestCrop && bestCrop.success && bestCrop.dataUrl) {
            // Use the cropped card
            finalDataUrl = bestCrop.dataUrl;

            if (bestCrop.sharpness != null && bestCrop.sharpness < MIN_SHARPNESS) {
                showToast("Image too blurry, move card closer and hold steady.", {
                    variant: "warning",
                });
            }
        } else if (bestCrop && bestCrop.reason) {
            // No usable crop, keep original frame
            showToast(bestCrop.reason, { variant: "warning" });
        }

        // Freeze frame in the modal (what both engines will see)
        setScanPreview(finalDataUrl);
        setIsFrozen(true);
        stopCamera();

        setIsCameraModalOpen(false);

        // Optional sharpness gate
        /* if (bestCrop && bestCrop.success && bestCrop.sharpness != null) {
            const MIN_SHARPNESS = 20;
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
        } */

        if (bestCrop && bestCrop.success && bestCrop.sharpness != null) {
            console.log("Best crop sharpness:", bestCrop.sharpness);
        }

        try {
            const pipeline = await scanCardImage(finalDataUrl, idType);
            setPipelineResult(pipeline);
            await runBothEngines(finalDataUrl);

        } catch (err: any) {
            console.error(err);
            showToast(
                err?.message || "OCR debug scan failed. Check helper servers.",
                { variant: "error" }
            );
            setIsFrozen(false);
            setScanPreview(null);
            startCamera();
        } finally {
            setScanning(false);
            setIsCameraModalOpen(false);
            setIsFrozen(false);
            //setScanPreview(null);
        }
    };

    const handleCloseModal = () => {
        setIsCameraModalOpen(false);
        setIsFrozen(false);
        stopCamera();
    };

    const runBothEngines = async (cardDataUrl: string) => {
  const blob = await (await fetch(cardDataUrl)).blob();
  const file = new File([blob], "debug_card.png", { type: "image/png" });

  setHelperProcessedImage(null);
  setResults([]);

  const buildForm = () => {
    const fd = new FormData();
    fd.append("file", file);
    return fd;
  };

  const tessPromise: Promise<OcrResult> = fetch(`${HELPER_BASE_URL}/api/ocr`, {
    method: "POST",
    body: buildForm(),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Tess status ${res.status}`);
      const json = await res.json();

      if (json.processedImageBase64) {
        setHelperProcessedImage(`data:image/png;base64,${json.processedImageBase64}`);
      }

      return {
        engine: "tess" as const,
        text: String(json.extractedText || json.error || ""),
        meanConfidence: typeof json.meanConfidence === "number" ? json.meanConfidence : undefined,
        personNames: Array.isArray(json.personNames) ? (json.personNames as string[]) : undefined,
      };
    })
    .catch((err: any) => ({
      engine: "tess",
      text: "",
      error: err?.message ?? String(err),
    }));

  const visionPromise: Promise<OcrResult> = fetch(`${HELPER_BASE_URL}/api/ocr/vision`, {
    method: "POST",
    body: buildForm(),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Vision status ${res.status}`);
      const json = await res.json();

      const fields: Record<string, string> | undefined =
        json && typeof json === "object" && json.fields && typeof json.fields === "object"
          ? (json.fields as Record<string, string>)
          : undefined;

      const textFromFields = fields
        ? Object.entries(fields)
            .map(([k, v]) => `${k}: ${v ?? ""}`)
            .join("\n")
        : "";

      return {
        engine: "vision" as const,
        text: textFromFields || "",
        fields,
        error: json?.error ? String(json.error) : undefined,
        meta: {
          model: json?.model,
          method: json?.method,
        },
      };
    })
    .catch((err: any) => ({
      engine: "vision",
      text: "",
      error: err?.message ?? String(err),
    }));

  const ocrSpacePromise: Promise<OcrResult> = fetch(`${HELPER_BASE_URL}/api/ocr/ocrspace`, {
    method: "POST",
    body: buildForm(),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`OCR.space status ${res.status}`);
      const json = await res.json();

      const fields: Record<string, string> | undefined =
        json && typeof json === "object" && json.fields && typeof json.fields === "object"
          ? (json.fields as Record<string, string>)
          : undefined;

      const text = String(json.extractedText || "");

      const textFromFields = fields
        ? Object.entries(fields)
            .map(([k, v]) => `${k}: ${v ?? ""}`)
            .join("\n")
        : "";

      return {
        engine: "ocrspace" as const,
        text: textFromFields || text || "",
        fields,
        error: json?.error ? String(json.error) : undefined,
        meta: {
          method: json?.method,
          success: json?.success,
        },
      };
    })
    .catch((err: any) => ({
      engine: "ocrspace",
      text: "",
      error: err?.message ?? String(err),
    }));

  const [tessResult, visionResult, ocrSpaceResult] = await Promise.all([
    tessPromise,
    visionPromise,
    ocrSpacePromise,
  ]);

  setResults([tessResult, visionResult, ocrSpaceResult]);
};

    return (
        <DashboardLayout>
            <div className="p-4 space-y-4">
                <h1 className="text-xl font-semibold">OCR Debug – Camera Flow</h1>
                <p className="text-sm text-gray-400">
                    Uses the same camera + OpenCV card cropping as Scan ID, then sends the
                    cropped card to both engines (Tess4J helper and EasyOCR helper).
                </p>

                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-300">ID type:</span>
                        <select
                            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                            value={idType}
                            onChange={(e) => setIdType(e.target.value)}
                        >
                            {idTypeOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => {
                                    const dataUrl = reader.result as string;
                                    setUploadedImage(dataUrl);
                                    setScanPreview(dataUrl);
                                    setPipelineResult(null);
                                    setResults([]);
                                    setHelperProcessedImage(null);
                                    setCropInfo(null);
                                };
                                reader.readAsDataURL(file);
                            }}
                        />
                        {uploadedImage && (
                            <Button
                                onClick={async () => {
                                    if (!uploadedImage || scanning) return;
                                    try {
                                        setScanning(true);
                                        setPipelineResult(null);
                                        setHelperProcessedImage(null);
                                        const pipeline = await scanCardImage(uploadedImage, idType);
                                        setPipelineResult(pipeline);
                                        await runBothEngines(uploadedImage);
                                    } catch (err: any) {
                                        console.error(err);
                                        showToast(
                                            err?.message || "OCR debug scan failed. Check helper servers.",
                                            { variant: "error" }
                                        );
                                    } finally {
                                        setScanning(false);
                                    }
                                }}
                            >
                                Run on Upload
                            </Button>
                        )}
                    </div>

                    <Button onClick={handleOpenCamera}>Open Camera Debug</Button>
                </div>

                {scanPreview && (
                    <div className="mt-4">
                        <p className="text-sm text-gray-300 mb-1">
                            Image sent to both engines:
                        </p>
                        {cropInfo && (
                            <p className="text-xs text-gray-400 mt-1">
                                {cropInfo.usedCrop
                                    ? `Used warped crop (sharpness ${cropInfo.sharpness ?? "n/a"})`
                                    : `Used original frame${cropInfo.reason ? ` – ${cropInfo.reason}` : ""}`}
                            </p>
                        )}
                        <img
                            src={scanPreview}
                            alt="Cropped card preview"
                            className="max-h-64 rounded border border-white/10"
                        />
                    </div>
                )}

                {helperProcessedImage && (
                    <div className="mt-4">
                        <p className="text-sm text-gray-300 mb-1">
                            Processed image from helper (after ImagePreprocessor):
                        </p>
                        <img
                            src={helperProcessedImage}
                            alt="Processed card preview"
                            className="max-h-64 rounded border border-white/10"
                        />
                    </div>
                )}

                {pipelineResult && (
                    <div className="mt-6 space-y-4">
                        <h2 className="text-lg font-semibold">ID pipeline result</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-black/30 border border-white/10 rounded p-3 space-y-2">
                                <p className="font-semibold text-sm mb-1">Merged fields</p>
                                <dl className="text-sm space-y-1">
                                    <div>
                                        <dt className="font-medium text-gray-300">Full name</dt>
                                        <dd className="text-gray-100">
                                            {pipelineResult.merged.fullName || <span className="text-gray-500">(empty)</span>}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="font-medium text-gray-300">Date of birth</dt>
                                        <dd className="text-gray-100">
                                            {pipelineResult.merged.dob || <span className="text-gray-500">(empty)</span>}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="font-medium text-gray-300">ID number</dt>
                                        <dd className="text-gray-100">
                                            {pipelineResult.merged.idNumber || <span className="text-gray-500">(empty)</span>}
                                        </dd>
                                    </div>
                                    {pipelineResult.fullCardPersonNames &&
                                        pipelineResult.fullCardPersonNames.length > 0 && (
                                            <div>
                                                <dt className="font-medium text-gray-300">
                                                    Full-card NER names
                                                </dt>
                                                <dd className="text-gray-100 text-xs">
                                                    {pipelineResult.fullCardPersonNames.join(", ")}
                                                </dd>
                                            </div>
                                        )}

                                    <div>
                                        <dt className="font-medium text-gray-300">Flags</dt>
                                        <dd className="text-gray-100 text-xs">
                                            hasUsefulData: {pipelineResult.hasUsefulData ? "true" : "false"},{" "}
                                            roiHasAnyData: {pipelineResult.roiHasAnyData ? "true" : "false"}
                                        </dd>
                                    </div>
                                    {typeof pipelineResult.fullCardConfidence === "number" && (
                                        <div>
                                            <dt className="font-medium text-gray-300">Full-card OCR confidence</dt>
                                            <dd className="text-gray-100 text-sm">
                                                {pipelineResult.fullCardConfidence.toFixed(1)}%
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            </div>

                            <div className="bg-black/30 border border-white/10 rounded p-3">
                                <p className="font-semibold text-sm mb-2">ROI previews</p>
                                {Object.entries(pipelineResult.roiImages).length === 0 ? (
                                    <p className="text-xs text-gray-400">(no ROIs defined for this ID type)</p>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {Object.entries(pipelineResult.roiImages).map(
                                            ([key, url]) =>
                                                url && (
                                                    <div key={key} className="text-center space-y-1">
                                                        <p className="text-xs text-gray-300">{key}</p>
                                                        <img
                                                            src={url}
                                                            alt={key}
                                                            className="border border-white/10 rounded max-h-32 mx-auto"
                                                        />
                                                        {pipelineResult.roiConfidence &&
                                                            typeof (pipelineResult.roiConfidence as any)[key] === "number" && (
                                                                <p className="text-[10px] text-gray-400">
                                                                    conf: {(pipelineResult.roiConfidence as any)[key].toFixed(1)}%
                                                                </p>
                                                            )}
                                                        {pipelineResult.roiPersonNames &&
                                                            Array.isArray(
                                                                (pipelineResult.roiPersonNames as any)[key]
                                                            ) &&
                                                            (pipelineResult.roiPersonNames as any)[key].length > 0 && (
                                                                <p className="text-[10px] text-gray-400">
                                                                    NER:{" "}
                                                                    {(pipelineResult.roiPersonNames as any)[key].join(
                                                                        ", "
                                                                    )}
                                                                </p>
                                                            )}

                                                    </div>
                                                )
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {pipelineResult && pipelineResult.fullCardText && (
                    <div className="mt-6">
                        <h2 className="text-lg font-semibold">
                            Pipeline raw OCR (Tess4J via extractText)
                        </h2>
                        <div className="bg-black/30 border border-white/10 rounded p-3 mt-2">
                            <pre className="whitespace-pre-wrap text-sm text-gray-100 max-h-72 overflow-y-auto">
                                {pipelineResult.fullCardText}
                            </pre>
                        </div>
                    </div>
                )}


                {results.length > 0 && (
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {results.map((r) => (
                            <div
                                key={r.engine}
                                className="bg-black/30 border border-white/10 rounded p-3"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold">
                                            {r.engine === "tess"
  ? "Tess4J (Helper)"
  : r.engine === "vision"
    ? "Vision (OpenRouter via Helper)"
    : "OCR.space (via Helper)"}
                                        </p>
                                        {typeof r.meanConfidence === "number" && (
                                            <span className="text-xs text-gray-400">
                                                conf: {r.meanConfidence.toFixed(1)}%
                                            </span>
                                        )}
                                    </div>
                                    {r.error && (
                                        <span className="text-xs text-red-400">
                                            Error: {r.error}
                                        </span>
                                    )}
                                </div>
                                {r.engine === "tess" &&
                                    r.personNames &&
                                    r.personNames.length > 0 && (
                                        <p className="text-xs text-gray-400 mb-1">
                                            NER names: {r.personNames.join(", ")}
                                        </p>
                                    )}
{r.fields && Object.keys(r.fields).length > 0 && (
  <div className="text-xs text-gray-300 mb-2 space-y-1">
    {Object.entries(r.fields).map(([k, v]) => (
      <div key={k} className="flex justify-between gap-3">
        <span className="text-gray-400">{k}</span>
        <span className="text-gray-100 break-all">{v || "(empty)"}</span>
      </div>
    ))}
  </div>
)}
                                <pre className="whitespace-pre-wrap text-sm text-gray-100 max-h-72 overflow-y-auto">
                                    {r.text || (r.error ? "" : "(no text)")}
                                </pre>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Modal
                isOpen={isCameraModalOpen}
                onClose={handleCloseModal}
                title="OCR Debug Camera"
            >
                <div className="flex flex-col items-center gap-3 w-full">
                    {cameraError ? (
                        <p className="text-red-500">{cameraError}</p>
                    ) : isFrozen && scanPreview ? (
                        <img
                            src={scanPreview}
                            alt="Captured frame"
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

                    <Button
                        onClick={handleScanClick}
                        disabled={scanning}
                        className={scanning ? "opacity-60 cursor-not-allowed" : ""}
                    >
                        {scanning ? "Scanning..." : "Scan and Compare"}
                    </Button>
                </div>
            </Modal>
        </DashboardLayout>
    );
}
