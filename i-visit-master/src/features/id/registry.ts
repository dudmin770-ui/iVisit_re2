// src/features/id/registry.ts
import {
    parseNationalId,
    parsePhilHealthId,
    parseUMID,
    parseGeneric,
    parseDriversLicense,
    parseQcCitizenId,
    parsePwdId,
    isValidNationalIdNumber,
    isValidPhilHealthNumber,
    isValidUmidCrn,
    isValidDriversLicenseNumber,
    isValidQcCitizenNumber,
    isReasonableDob,
    isReasonableFullName,
} from "../../utils/_idParsers";
import type { IdTypeDescriptor } from "./types";

const DESCRIPTORS: Record<string, IdTypeDescriptor> = {
    "National ID": {
        idType: "National ID",
        label: "Philippine National ID",
        parser: parseNationalId,
        validateIdNumber: isValidNationalIdNumber,
        validateFullName: isReasonableFullName,
        validateDob: isReasonableDob,
        roiProfile: {
            usesSplitNameRois: true,
            roiKeys: ["lastName", "givenNames", "middleName", "dob", "idNumber"],
        },
        cardTemplateKey: "NATIONAL_ID",
        idNumberLabel: "National ID number",
    },
    "PhilHealth ID": {
        idType: "PhilHealth ID",
        label: "PhilHealth ID",
        parser: parsePhilHealthId,
        validateIdNumber: isValidPhilHealthNumber,
        validateFullName: isReasonableFullName,
        validateDob: isReasonableDob,
        roiProfile: {
            usesSplitNameRois: false,
            roiKeys: ["fullName", "dob", "idNumber"],
        },
        cardTemplateKey: "PHILHEALTH_ID",
        idNumberLabel: "PhilHealth ID number",
    },
    UMID: {
        idType: "UMID",
        label: "UMID",
        parser: parseUMID,
        validateIdNumber: isValidUmidCrn,
        validateFullName: isReasonableFullName,
        validateDob: isReasonableDob,
        roiProfile: {
            usesSplitNameRois: false,
            roiKeys: ["fullName", "dob", "idNumber"],
        },
        cardTemplateKey: "UMID",
        idNumberLabel: "UMID CRN",
    },
    "Driver's License": {
        idType: "Driver's License",
        label: "Driver's License",
        parser: parseDriversLicense,
        validateFullName: isReasonableFullName,
        validateDob: isReasonableDob,
        validateIdNumber: isValidDriversLicenseNumber,
        roiProfile: {
            usesSplitNameRois: false,
            roiKeys: ["fullName", "dob", "idNumber"],
        },
        cardTemplateKey: "Driver's License",
        idNumberLabel: "License Number",
    },

    "Quezon City Citizen ID": {
        idType: "Quezon City Citizen ID",
        label: "Quezon City Citizen ID",
        parser: parseQcCitizenId,
        validateFullName: isReasonableFullName,
        validateDob: isReasonableDob,
        validateIdNumber: isValidQcCitizenNumber,
        roiProfile: {
            usesSplitNameRois: false,
            roiKeys: ["fullName", "dob", "idNumber"],
        },
        cardTemplateKey: "Quezon City Citizen ID",
        idNumberLabel: "QCitizen Card Number",
    },

    "PWD ID": {
        idType: "PWD ID",
        label: "PWD ID",
        parser: parsePwdId,
        validateFullName: isReasonableFullName,
        validateDob: isReasonableDob,
        roiProfile: {
            usesSplitNameRois: false,
            roiKeys: ["fullName", "dob", "idNumber"],
        },
        cardTemplateKey: "PWD ID",
        idNumberLabel: "PWD ID Number",
    },

    Unknown: {
        idType: "Unknown",
        label: "Unknown ID",
        parser: parseGeneric,
        validateFullName: isReasonableFullName,
        validateDob: isReasonableDob,
        roiProfile: {
            usesSplitNameRois: false,
            roiKeys: ["fullName", "dob", "idNumber"],
        },
        idNumberLabel: "ID number",
    },
    Blank: {
        idType: "Blank",
        label: "Blank / Raw OCR",
        parser: parseGeneric,
        roiProfile: {
            usesSplitNameRois: false,
            roiKeys: [], // no ROIs used
        },
        idNumberLabel: "ID number",
    },
};

export const ID_DESCRIPTORS = DESCRIPTORS;

export function getIdDescriptor(idType: string): IdTypeDescriptor {
    return DESCRIPTORS[idType] ?? DESCRIPTORS.Unknown;
}

export function getIdTypeOptions(includeBlank = false) {
    return Object.values(DESCRIPTORS)
        .filter((d) => {
            if (d.idType === "Unknown") return false;
            if (!includeBlank && d.idType === "Blank") return false;
            return true;
        })
        .map((d) => ({
            value: d.idType,
            label: d.label,
        }));
}
