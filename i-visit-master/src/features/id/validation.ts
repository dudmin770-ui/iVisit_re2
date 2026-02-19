// src/features/id/validation.ts
import {
  isReasonableDob,
  isReasonableFullName,
} from "../../utils/_idParsers";
import { getIdDescriptor } from "./registry";

export interface IdFieldValidationResult {
  ok: boolean;
  failedFields: string[];
}

export function validateExtractedFieldsForScan(
  idType: string | undefined,
  fullName: string,
  dob: string,
  idNumber: string
): IdFieldValidationResult {
  const descriptor = getIdDescriptor(idType ?? "Unknown");
  const failed: string[] = [];

  if (!isReasonableFullName(fullName)) {
    failed.push("full name");
  }

  if (!isReasonableDob(dob)) {
    failed.push("date of birth");
  }

  const trimmedId = idNumber.trim();
  const label = descriptor.idNumberLabel ?? "ID number";

  if (descriptor.validateIdNumber) {
    if (!descriptor.validateIdNumber(trimmedId)) {
      failed.push(label);
    }
  } else {
    if (trimmedId.length < 6 || !/\d/.test(trimmedId) || /\s/.test(trimmedId)) {
      failed.push(label);
    }
  }

  return {
    ok: failed.length === 0,
    failedFields: failed,
  };
}
