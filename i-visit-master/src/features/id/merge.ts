// src/features/id/merge.ts
import type { ExtractedInfo } from "../../utils/idParsers";
import { isReasonableFullName, normalizeIdNumberGeneric } from "../../utils/_idParsers";
import { getIdDescriptor } from "./registry";

function isReasonableName(candidate: string | undefined | null): boolean {
    if (!candidate) return false;
    const trimmed = candidate.trim();
    if (!isReasonableFullName(trimmed)) return false;

    const tokens = trimmed.split(/\s+/);
    if (tokens.length > 6) return false;
    if (/\d/.test(trimmed)) return false;

    const shortTokens = tokens.filter(
        (t) => t.replace(/[^A-Za-z]/g, "").length <= 2
    );
    if (shortTokens.length / tokens.length > 0.5) return false;

    return true;
}

export interface RoiMergeInput {
    fullName: string;
    dob: string;
    idNumber: string;
}

export interface MergeResult {
    mergedFullName: string;
    mergedDob: string;
    mergedIdNumber: string;
}

export function mergeRoiAndFullResults(
    idType: string,
    roi: RoiMergeInput,
    fromFull: ExtractedInfo
): MergeResult {
    const roiNameCandidate = (roi.fullName || "").trim();
    const fullNameCandidate = (fromFull.fullName || "").trim();

    const roiIsGood = isReasonableName(roiNameCandidate);
    const fullIsGood = isReasonableName(fullNameCandidate);

    let mergedFullName: string;

if (idType === "National ID") {
  if (roiIsGood) {
    mergedFullName = roiNameCandidate;
  } else if (fullIsGood) {
    mergedFullName = fullNameCandidate;
  } else {
    // both fail sanity checks – still prefer full-block over ROI trash
    mergedFullName = fullNameCandidate || roiNameCandidate;
  }
} else {
  mergedFullName =
    (roiIsGood ? roiNameCandidate : fullNameCandidate) || "";
}

    const mergedDob = roi.dob || fromFull.dob || "";

    const descriptor = getIdDescriptor(idType || "Unknown");
    const validateId = descriptor.validateIdNumber;
    const roiNum = (roi.idNumber || "").trim();
    const fullNum = (fromFull.idNumber || "").trim();
    let mergedIdNumber = "";

    if (validateId) {
        const roiGood = validateId(roiNum);
        const fullGood = validateId(fullNum);

        if (roiGood && !fullGood) {
            mergedIdNumber = roiNum;
        } else if (!roiGood && fullGood) {
            mergedIdNumber = fullNum;
        } else if (roiGood && fullGood) {
            mergedIdNumber = roiNum.length >= fullNum.length ? roiNum : fullNum;
        } else {
            mergedIdNumber = roiNum || fullNum;
        }
    } else {
        mergedIdNumber = roiNum || fullNum;
    }
    mergedIdNumber = normalizeIdNumberGeneric(mergedIdNumber);

    console.log("[MERGE] roiNameCandidate =", roiNameCandidate);
console.log("[MERGE] fullNameCandidate =", fullNameCandidate);
console.log("[MERGE] roiIsGood =", roiIsGood, "fullIsGood =", fullIsGood);
console.log("[MERGE] mergedFullName =", mergedFullName);


    return {
        mergedFullName,
        mergedDob,
        mergedIdNumber,
    };
}
