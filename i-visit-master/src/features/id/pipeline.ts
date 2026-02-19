// src/features/id/pipeline.ts
import { extractText } from "../../api/OcrApi";
import { parseTextByIdType, type ExtractedInfo } from "../../utils/_idParsers";
import { validateExtractedFieldsForScan } from "./validation";

import {
    type IdFieldKey,
    getRoisForIdType,
    cropFieldsFromCard,
    ocrDataUrlViaHelper,
    //runWholeCardOcrAndParse,
    cleanRoiName,
    extractDobFromText,
    extractNationalIdNumber,
} from "../../utils/_ocrFieldHelpers";

import { mergeRoiAndFullResults } from "./merge";

export interface ScanCardImageResult {
    merged: ExtractedInfo;
    hasUsefulData: boolean;
    roiHasAnyData: boolean;
    roiImages: Partial<Record<IdFieldKey, string>>;
    fullCardText: string;
    fullCardConfidence?: number;
    roiConfidence?: {
        fullName?: number;
        dob?: number;
        idNumber?: number;
        lastName?: number;
        givenNames?: number;
        middleName?: number;
    };
    roiPersonNames?: Partial<Record<IdFieldKey, string[]>>;
    fullCardPersonNames?: string[];
}

function looksLikeName(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (trimmed.length < 5) return false;              // too short
  if (!/\s/.test(trimmed)) return false;             // need at least 2 tokens

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length > 6) return false;               // too many tokens

  // reject if >50% of tokens are 1–2 letters (typical garbage)
  const shortTokens = tokens.filter(
    (t) => t.replace(/[^A-Za-z]/g, "").length <= 2
  );
  if (shortTokens.length / tokens.length > 0.5) return false;

  // reject names with digits
  if (/\d/.test(trimmed)) return false;

  return true;
}

function looksLikeDob(raw: string | undefined | null): boolean {
  if (!raw) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw.trim());
}

function looksLikeIdNumber(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const digits = raw.replace(/\D/g, "").length;
  return digits >= 6; // ignore “123”, “4”, etc.
}



/**
 * High-level pipeline:
 * cropped card image (data URL) + idType
 * -> ROI OCR
 * -> whole-card OCR
 * -> merged ExtractedInfo + flags + ROI image map.
 */
export async function scanCardImage(
    cardDataUrl: string,
    idType: string
): Promise<ScanCardImageResult> {
    // 1) Crop ROIs for this ID type
    const rois = getRoisForIdType(idType);
    const fieldImages = await cropFieldsFromCard(cardDataUrl, rois);

    let roiFullName = "";
    let roiFullNameConfidence: number | undefined;
    let roiDob = "";
    let roiDobConfidence: number | undefined;
    let roiIdNumber = "";
    let roiIdNumberConfidence: number | undefined;
    let roiLastName = "";
    let roiLastNameConfidence: number | undefined;
    let roiGivenNames = "";
    let roiGivenNamesConfidence: number | undefined;
    let roiMiddleName = "";
    let roiMiddleNameConfidence: number | undefined;

    const roiPersonNames: Partial<Record<IdFieldKey, string[]>> = {};


    // 2) OCR the ROIs
    if (idType === "National ID") {
        if (fieldImages.lastName) {
            const { text, confidence, personNames } = await ocrDataUrlViaHelper(
                fieldImages.lastName,
                "line",
                "name"
            );
            roiLastName = cleanRoiName(text);
            roiLastNameConfidence = confidence;
            if (personNames && personNames.length) {
                roiPersonNames.lastName = personNames;
            }
        }

        if (fieldImages.givenNames) {
            const { text, confidence, personNames } = await ocrDataUrlViaHelper(
                fieldImages.givenNames,
                "line",
                "name"
            );
            roiGivenNames = cleanRoiName(text);
            roiGivenNamesConfidence = confidence;
            if (personNames && personNames.length) {
                roiPersonNames.givenNames = personNames;
            }
        }

        if (fieldImages.middleName) {
            const { text, confidence, personNames } = await ocrDataUrlViaHelper(
                fieldImages.middleName,
                "line",
                "name"
            );
            roiMiddleName = cleanRoiName(text);
            roiMiddleNameConfidence = confidence;
            if (personNames && personNames.length) {
                roiPersonNames.middleName = personNames;
            }
        }

        const nameParts = [roiGivenNames, roiMiddleName, roiLastName].filter(
            (p) => p && p.trim().length > 0
        );
        roiFullName = nameParts.join(" ");
        console.log("[ROI] lastName =", roiLastName);
console.log("[ROI] givenNames =", roiGivenNames);
console.log("[ROI] middleName =", roiMiddleName);
console.log("[ROI] fullName =", roiFullName);

    } else if (fieldImages.fullName) {
        const { text, confidence, personNames } = await ocrDataUrlViaHelper(fieldImages.fullName, "line");
        roiFullName = cleanRoiName(text);
        roiFullNameConfidence = confidence;
        if (personNames && personNames.length) {
                roiPersonNames.fullName = personNames;
        }
    }

    if (fieldImages.dob) {
        const { text, confidence } = await ocrDataUrlViaHelper(fieldImages.dob, "line");
        roiDob = extractDobFromText(text);
        roiDobConfidence = confidence;
    }

    if (fieldImages.idNumber) {
        const { text, confidence } = await ocrDataUrlViaHelper(fieldImages.idNumber, "line");
        if (idType === "National ID") {
            roiIdNumber = extractNationalIdNumber(text) || text.trim();
            roiIdNumberConfidence = confidence;
        } else {
            roiIdNumber = text.trim();
            roiIdNumberConfidence = confidence;
        }
    }

    const roiConfidence = {
        lastName: roiLastNameConfidence,
        givenNames: roiGivenNamesConfidence,
        middleName: roiMiddleNameConfidence,
        fullName: roiFullNameConfidence,
        dob: roiDobConfidence,
        idNumber: roiIdNumberConfidence,
    };

const roiNameCombined = [
  roiFullName,
  roiLastName,
  roiGivenNames,
  roiMiddleName,
]
  .filter((p) => !!p && String(p).trim().length > 0)
  .join(" ")
  .trim();

const roiHasName = looksLikeName(roiNameCombined);
const roiHasDob = looksLikeDob(roiDob);
const roiHasId = looksLikeIdNumber(roiIdNumber);

const roiHasAnyData = roiHasName || roiHasDob || roiHasId;

    // 3) Whole-card OCR + parsing
    //const parsedFromFull = await runWholeCardOcrAndParse(cardDataUrl, idType);

    //   const fromFull: ExtractedInfo = parsedFromFull ?? {
    //     fullName: "",
    //     dob: "",
    //     idNumber: "",
    //     idType: idType || "Unknown",
    //   };

    // 3) Whole-card OCR + parsing, keeping raw text
    let fullCardText = "";
    let fullCardConfidence: number | undefined;
    let fullCardPersonNames: string[] | undefined;
    let fromFull: ExtractedInfo;


    try {
        const blob = await (await fetch(cardDataUrl)).blob();
        const file = new File([blob], "card.png", { type: "image/png" });

        const { extractedText, meanConfidence, personNames } =
            await extractText(file, { mode: "block" });
        fullCardText = extractedText || "";
        fullCardConfidence =
            typeof meanConfidence === "number" ? meanConfidence : undefined;
        fullCardPersonNames = Array.isArray(personNames) ? personNames : undefined;

        fromFull = parseTextByIdType(fullCardText, idType);

    } catch {
        fullCardText = "";
        fullCardConfidence = undefined;
        fromFull = {
            fullName: "",
            dob: "",
            idNumber: "",
            idType: idType || "Unknown",
        };
        fullCardPersonNames = undefined;

    }

    // 4) Merge ROI + full-card results (per-idType rules)
    const { mergedFullName, mergedDob, mergedIdNumber } =
        mergeRoiAndFullResults(
            idType,
            {
                fullName: roiFullName,
                dob: roiDob,
                idNumber: roiIdNumber,
            },
            fromFull
        );

    const mergedIdType = fromFull.idType || idType || "Unknown";

    const { ok: isValid } = validateExtractedFieldsForScan(
        idType || "Unknown",
        mergedFullName,
        mergedDob,
        mergedIdNumber
    );

    const hasUsefulData = isValid;

    return {
        merged: {
            fullName: mergedFullName,
            dob: mergedDob,
            idNumber: mergedIdNumber,
            idType: mergedIdType,
            confidence: fromFull.confidence,
        },
        hasUsefulData,
        roiHasAnyData,
        roiImages: fieldImages,
        fullCardText,
        fullCardConfidence,
        roiConfidence,
        fullCardPersonNames,
    };

}
