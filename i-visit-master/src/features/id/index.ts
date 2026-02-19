// src/features/id/index.ts
export type { ExtractedInfo } from "../../utils/idParsers";

export {
  parseTextByIdType,
  parseNationalId,
  parsePhilHealthId,
  parseUMID,
  parseGeneric,
  isValidNationalIdNumber,
  isValidPhilHealthNumber,
  isValidUmidCrn,
  isReasonableDob,
  isReasonableFullName,
} from "../../utils/_idParsers";

export { cropIdCardFromDataUrl } from "../../utils/cardCropper";

export {
  getRoisForIdType,
  cropFieldsFromCard,
  ocrDataUrlViaHelper,
  runWholeCardOcrAndParse,
  cleanRoiName,
  extractDobFromText,
  extractNationalIdNumber,
} from "../../utils/ocrFieldHelpers";

export { ID_TYPE_OPTIONS } from "../../constants/idTypes";

export * from "./types";
export * from "./registry";
export * from "./validation";
export * from "./merge";
export * from "./pipeline";