import { extractText } from "../api/OcrApi";
import { getTemplateForIdType } from "./cardTemplates";
import type { OcrMode, OcrProfile } from "../api/OcrApi";

import {
  parseTextByIdType,
  type ExtractedInfo as BaseExtractedInfo,
  normalizeDate,
} from "./idParsers";

export type IdFieldKey =
  | "fullName"
  | "dob"
  | "idNumber"
  | "lastName"
  | "givenNames"
  | "middleName";

export interface FieldRoi {
  key: IdFieldKey;
  x: number;   // 0–1, relative to card width
  y: number;   // 0–1, relative to card height
  width: number;  // 0–1
  height: number; // 0–1
}

export async function cropFieldsFromCard(
  cardDataUrl: string,
  rois: FieldRoi[]
): Promise<Partial<Record<IdFieldKey, string>>> {
  if (!rois.length) return {};

  const img = new Image();
  img.src = cardDataUrl;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
  });

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = img.width || 640;
  baseCanvas.height = img.height || 480;
  const baseCtx = baseCanvas.getContext("2d");
  if (!baseCtx) throw new Error("Failed to get 2D context");

  baseCtx.drawImage(img, 0, 0, baseCanvas.width, baseCanvas.height);

  const result: Partial<Record<IdFieldKey, string>> = {};

  for (const roi of rois) {
    const pad = 0.02;

    const sx = Math.max(0, (roi.x - pad) * baseCanvas.width);
    const sy = Math.max(0, (roi.y - pad) * baseCanvas.height);
    const sw = Math.max(8, Math.round((roi.width + 2 * pad) * baseCanvas.width));
    const sh = Math.max(8, Math.round((roi.height + 2 * pad) * baseCanvas.height));

    const fieldCanvas = document.createElement("canvas");
    fieldCanvas.width = sw;
    fieldCanvas.height = sh;
    const fieldCtx = fieldCanvas.getContext("2d");
    if (!fieldCtx) continue;

    fieldCtx.drawImage(
      baseCanvas,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      sw,
      sh
    );

    const imageData = fieldCtx.getImageData(0, 0, fieldCanvas.width, fieldCanvas.height);
const data = imageData.data;

// First pass: find min/max brightness
let minV = 255, maxV = 0;
for (let i = 0; i < data.length; i += 4) {
  const v = (data[i] + data[i+1] + data[i+2]) / 3;
  if (v < minV) minV = v;
  if (v > maxV) maxV = v;
}

const range = maxV - minV || 1; // avoid divide by zero

// Now stretch
for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];

  const v = (r + g + b) / 3;

  // Normalize → enhance → denormalize
  let nv = ((v - minV) / range) * 255;

  data[i] = nv;
  data[i + 1] = nv;
  data[i + 2] = nv;
}

fieldCtx.putImageData(imageData, 0, 0);

    const fieldDataUrl = fieldCanvas.toDataURL("image/png");
    result[roi.key] = fieldDataUrl;
  }

  return result;
}

export function extractNationalIdNumber(text: string): string {
  if (!text) return "";

  // Normalize some common OCR mistakes and whitespace
  let cleaned = text
    .replace(/O/g, "0")
    .replace(/[Il]/g, "1")
    .replace(/\s+/g, " ")
    .trim();

  // Look for a pattern like 1234-5678-9012-3456 (allow spaces around dashes)
  const match = cleaned.match(
    /\b\d{4}\s*-\s*\d{4}\s*-\s*\d{4}\s*-\s*\d{4}\b/
  );
  if (!match) return "";

  // Strip non-digits and ensure we really have 16 digits
  const digits = match[0].replace(/\D+/g, "");
  if (digits.length !== 16) return "";

  // Return canonical format
  return [
    digits.slice(0, 4),
    digits.slice(4, 8),
    digits.slice(8, 12),
    digits.slice(12),
  ].join("-");
}

export function extractDobFromText(text: string): string {
  if (!text) return "";
  const norm = normalizeDate(text);
  return norm || "";
}

export function cleanNationalIdName(raw: string): string {
  if (!raw) return "";

  // First apply the generic cleaner to strip labels/dates, collapse spaces
  let cleaned = cleanRoiName(raw);

  const tokens = cleaned.split(/\s+/);

  const goodTokens = tokens.filter((t) => {
    const lettersOnly = t.replace(/[^A-Za-z]/g, "");
    if (lettersOnly.length < 2) return false;

    const upperCount = lettersOnly.replace(/[^A-Z]/g, "").length;
    const ratio = upperCount / lettersOnly.length;

    // Keep tokens that are mostly uppercase letters
    return ratio >= 0.8;
  });

  // If this nuked everything, fall back to the generic cleaned string
  if (goodTokens.length >= 2) {
    return goodTokens.join(" ");
  }

  return cleaned;
}

export function cleanRoiName(text: string): string {
  if (!text) return "";

  // Drop line breaks & compress spaces
  let cleaned = text.replace(/\s+/g, " ").trim();

  // Remove obvious label words that your cards use
  cleaned = cleaned.replace(
    /(Apelyido|Last\s*Name|Mga\s*Pangalan|Given\s*Names|Gitnang\s*Apelyido|Middle\s*Name|Petsa\s*ng\s*Kapanganakan|Date\s*of\s*Birth)/gi,
    " "
  );

  // Remove obvious date-like fragments that leaked into the name ROI
  cleaned = cleaned.replace(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s+\d{4}/gi,
    " "
  );

  // Compress spaces again
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

export async function runWholeCardOcrAndParse(
  cardDataUrl: string,
  idType: string
): Promise<BaseExtractedInfo> {
  const blob = await (await fetch(cardDataUrl)).blob();
  const file = new File([blob], "full_card.png", { type: "image/png" });
  const json = await extractText(file, { mode: "block" });
  const extractedText: string = json.extractedText || "";
  return parseTextByIdType(extractedText, idType);
}

export interface OcrFieldResult {
  text: string;
  confidence?: number; // 0–100 from helper
  personNames?: string[];
}

export async function ocrDataUrlViaHelper(
  dataUrl: string,
  mode: OcrMode = "line",
  profile?: OcrProfile
): Promise<OcrFieldResult> {
  const responseBlob = await (await fetch(dataUrl)).blob();
  const file = new File([responseBlob], "field.png", { type: "image/png" });
  const json = await extractText(file, { mode, profile });

  return {
    text: json.extractedText || "",
    confidence:
      typeof json.meanConfidence === "number" ? json.meanConfidence : undefined,
    personNames: Array.isArray(json.personNames) ? json.personNames : undefined,
  };
}

export function getRoisForIdType(idType: string): FieldRoi[] {
  const tpl = getTemplateForIdType(idType);
  if (!tpl || !tpl.rois || tpl.rois.length === 0) return [];

  // Adapt RoiSpec to FieldRoi (they're effectively the same shape)
  return tpl.rois.map((r) => ({
    key: r.key as IdFieldKey,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
  }));
}
