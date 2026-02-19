export const ID_TYPE_OPTIONS = [
  { label: "Select ID Type", value: "" },

  { label: "PhilSys National ID", value: "National ID" },
  { label: "PhilHealth ID", value: "PhilHealth ID" },
  { label: "UMID", value: "UMID" },

  { label: "Driver’s License", value: "Driver's License" },
  { label: "Quezon City Citizen ID", value: "Quezon City Citizen ID" },
  //{ label: "PWD ID", value: "PWD ID" },
  // currently has no ROI
  { label: "Philippine Passport", value: "Passport" },
  { label: "PRC ID", value: "PRC ID" },
  { label: "SSS ID", value: "SSS ID" },
  
  { label: "Other ID", value: "Other" },
];

export function normalizeIdType(raw: string | null | undefined): string {
  const val = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " "); // collapse NATIONAL_ID, national-id, etc.

  if (!val) return "";

  if (val.includes("national") || val.includes("philsys")) {
    return "National ID";
  }

  if (val.includes("philhealth")) {
    return "PhilHealth ID";
  }

  if (val.includes("umid")) {
    return "UMID";
  }

  if (val.includes("passport")) {
    return "Passport";
  }

  if (val.includes("driver")) {
    return "Driver's License";
  }

  if (val.includes("prc")) {
    return "PRC ID";
  }

  if (val.includes("sss")) {
    return "SSS ID";
  }

    if (val.includes("quezon") || val.includes("qcitizen") || val.includes("qc citizen")) {
    return "Quezon City Citizen ID";
  }

  if (val.includes("pwd") || val.includes("person with disability")) {
    return "PWD ID";
  }

  return "Other";
}
