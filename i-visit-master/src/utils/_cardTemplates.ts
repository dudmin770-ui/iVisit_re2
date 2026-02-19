// src/utils/cardTemplates.ts

// These are the ID types you already use in ScanIdPage / idParsers
export type SupportedIdType =
  | "National ID"
  | "PhilHealth ID"
  | "UMID"
  | "Driver's License"
  | "Quezon City Citizen ID"
  | "PWD ID";

export type RoiKey =
  | "fullName"
  | "dob"
  | "idNumber"
  | "lastName"
  | "givenNames"
  | "middleName";

export interface RoiSpec {
  key: RoiKey;
  label: string;

  // Normalized coordinates *inside the card* (0..1)
  // (0,0) = top-left of the yellow card guide, (1,1) = bottom-right.
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CardTemplate {
  idType: SupportedIdType;
  displayName: string;
  rois: RoiSpec[];
}

/**
 * Rough templates based on typical layouts.
 * These don't have to be pixel-perfect; they are mainly
 * a visual guide for the guard *and* a shared config we
 * can later use for region-based OCR.
 */
const TEMPLATES: CardTemplate[] = [
  {
    idType: "National ID",
    displayName: "Philippine National ID",
    rois: [
    {
      key: "lastName",
      label: "Last Name line",
      x: 0.42,
      y: 0.36,
      width: 0.50,
      height: 0.10,
    },
    {
      key: "givenNames",
      label: "Given Names line",
      x: 0.42,
      y: 0.48,
      width: 0.50,
      height: 0.15,
    },
    {
      key: "middleName",
      label: "Middle Name line",
      x: 0.42,
      y: 0.635,
      width: 0.50,
      height: 0.1,
    },
      {
        key: "dob",
        label: "Date of Birth",
        // Lower-left area
        x: 0.42,
        y: 0.74,
        width: 0.425,
        height: 0.125,
      },
      {
        key: "idNumber",
        label: "ID Number",
        // Upper left
        x: 0,
        y: 0.26,
        width: 0.40,
        height: 0.13,
      },
    ],
  },
  {
    idType: "PhilHealth ID",
    displayName: "PhilHealth ID",
    rois: [
      {
        key: "fullName",
        label: "Full Name",
        x: 0.35,
        y: 0.4,
        width: 0.60,
        height: 0.10,
      },
      {
        key: "dob",
        label: "Date of Birth",
        x: 0.35,
        y: 0.48,
        width: 0.25,
        height: 0.07,
      },
      {
        key: "idNumber",
        label: "PhilHealth No.",
        x: 0.35,
        y: 0.33,
        width: 0.40,
        height: 0.10,
      },
    ],
  },
  {
    idType: "UMID",
    displayName: "UMID",
    rois: [
      {
      key: "lastName",
      label: "Last Name line",
      x: 0.38,
      y: 0.36,
      width: 0.62,
      height: 0.10,
    },
    {
      key: "givenNames",
      label: "Given Names line",
      x: 0.38,
      y: 0.46,
      width: 0.40,
      height: 0.16,
    },
    {
      key: "middleName",
      label: "Middle Name line",
      x: 0.38,
      y: 0.62,
      width: 0.50,
      height: 0.1,
    },
      {
        key: "dob",
        label: "Date of Birth",
        x: 0.62,
        y: 0.675,
        width: 0.235,
        height: 0.10,
      },
      {
        key: "idNumber",
        label: "CRN / ID No.",
        x: 0.55,
        y: 0.23,
        width: 0.45,
        height: 0.12,
      },
    ],
  },
    {
    idType: "Driver's License",
    displayName: "Driver's License",
    rois: [
      {
        key: "fullName",
        label: "Full Name",
        x: 0.32,
        y: 0.30,
        width: 0.65,
        height: 0.1,
      },
      {
        key: "dob",
        label: "Date of Birth",
        x: 0.55,
        y: 0.4,
        width: 0.18,
        height: 0.10,
      },
      {
        key: "idNumber",
        label: "License Number",
        x: 0.32,
        y: 0.62,
        width: 0.26,
        height: 0.1,
      },
    ],
  },
  {
    idType: "Quezon City Citizen ID",
    displayName: "Quezon City Citizen ID",
    rois: [
      {
        key: "fullName",
        label: "Full Name",
        x: 0.20,
        y: 0.28,
        width: 0.60,
        height: 0.14,
      },
      {
        key: "dob",
        label: "Date of Birth",
        x: 0.32,
        y: 0.40,
        width: 0.20,
        height: 0.10,
      },
      {
        key: "idNumber",
        label: "Card Number",
        x: 0.68,
        y: 0.40,
        width: 0.30,
        height: 0.12,
      },
    ],
  },
  {
    idType: "PWD ID",
    displayName: "PWD ID",
    rois: [
      {
        key: "fullName",
        label: "Full Name",
        x: 0.15,
        y: 0.30,
        width: 0.70,
        height: 0.15,
      },
      {
        key: "dob",
        label: "Date of Birth",
        x: 0.15,
        y: 0.48,
        width: 0.50,
        height: 0.12,
      },
      {
        key: "idNumber",
        label: "PWD ID Number",
        x: 0.15,
        y: 0.66,
        width: 0.55,
        height: 0.12,
      },
    ],
  },

  //end of types
];

/**
 * Get the template (if any) for the currently selected ID type.
 */
export function getTemplateForIdType(idType: string | null | undefined): CardTemplate | null {
  if (!idType) return null;
  const tpl = TEMPLATES.find((t) => t.idType === idType);
  return tpl || null;
}
