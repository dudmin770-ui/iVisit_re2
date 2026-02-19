// src/utils/idParsers.ts

const NATIONAL_ID_HEADER_RE =
  /(REPUBLIKA\s+NG\s+PILIPINAS|PAMBANSANG\s+PAGKAKAKILANLAN|Philippine\s+Identification\s+Card)/i;

export interface ExtractedInfo {
  fullName: string;
  dob: string; // ISO yyyy-mm-dd when available
  idNumber: string;
  idType: string;
  address?: string;
  confidence?: {
    fullName: number;
    dob: number;
    idNumber: number;
    address?: number;
  };
}

export interface DetectedIdType {
  idType: string;
  confidence: number;
  matchedPatterns: string[];
}

/* =========================
   Detection
========================= */

export function detectIdType(text: string): DetectedIdType {
  if (!text) return { idType: "Other", confidence: 0, matchedPatterns: [] };

  const upper = text.toUpperCase();
  const matchedPatterns: string[] = [];

  // National ID
  const hasNationalIdNumber = /\d{4}-\d{4}-\d{4}-\d{4}/.test(text);
  const hasPhilSys =
    /PHILSYS/i.test(text) || /PHILIPPINE\s*NATIONAL\s*ID/i.test(text);
  if (hasNationalIdNumber) {
    matchedPatterns.push("ID: XXXX-XXXX-XXXX-XXXX");
    if (
      hasPhilSys ||
      /REPUBLIKA\s*NG\s*PILIPINAS/i.test(text) ||
      /REPUBLIC\s*OF\s*THE\s*PHILIPPINES/i.test(text)
    ) {
      matchedPatterns.push("PhilSys / National ID");
    }
    return { idType: "National ID", confidence: 0.95, matchedPatterns };
  }

  // UMID (before SSS)
  const hasCRN = /CRN[:\s\-]*\d{4}[\-\s]?\d{7}[\-\s]?\d/i.test(text);
  const hasUMIDExact = /\bUMID\b/i.test(text);
  const hasRepublicPhilippines =
    /REPUBLIC\s*OF\s*THE\s*PHILIPPINES/i.test(text) ||
    (upper.includes("REPUBLIC") && upper.includes("PHILIPPINES"));
  const hasMultiPurpose =
    /MULTI[-\s]?PURPOSE/i.test(text) ||
    (upper.includes("MULTI") && upper.includes("PURPOSE"));
  const hasUnified = /UNIFIED/i.test(text);

  if (hasCRN || hasUMIDExact || (hasRepublicPhilippines && (hasMultiPurpose || hasUnified))) {
    if (hasCRN) matchedPatterns.push("CRN-XXXX-XXXXXXX-X");
    if (hasUMIDExact) matchedPatterns.push("UMID text found");
    if (hasRepublicPhilippines) matchedPatterns.push("Republic of the Philippines");
    if (hasMultiPurpose || hasUnified) matchedPatterns.push("Multi-Purpose ID text");
    return { idType: "UMID", confidence: 0.95, matchedPatterns };
  }

  // Driver's License
  const hasLTOText =
    /LAND\s*TRANSPORTATION\s*OFFICE/i.test(text) ||
    /\bLTO\b/.test(upper) ||
    /DRIVER['']?S?\s*LICENSE/i.test(text) ||
    /LICENSE\s*NO/i.test(text);
  const hasLicenseNumber = /[A-Z]?\d{2,3}-\d{2}-\d{6}/.test(text);
  if (hasLTOText || hasLicenseNumber) {
    if (hasLTOText) matchedPatterns.push("LTO / Driver's License");
    if (hasLicenseNumber) matchedPatterns.push("ID: N##-##-######");
    return { idType: "Driver's License", confidence: 0.9, matchedPatterns };
  }

  // PhilHealth
  const hasPhilHealth =
    /PHILHEALTH/i.test(text) || /PHILIPPINE\s*HEALTH\s*INSURANCE/i.test(text);
  const hasPhilHealthNumber = /\d{2}-\d{9}-\d/.test(text);
  if (hasPhilHealth || hasPhilHealthNumber) {
    if (hasPhilHealth) matchedPatterns.push("PhilHealth");
    if (hasPhilHealthNumber) matchedPatterns.push("ID: ##-#########-#");
    return { idType: "PhilHealth ID", confidence: 0.9, matchedPatterns };
  }

  // SSS (after UMID & PhilHealth)
  const hasSSSText = /SOCIAL\s*SECURITY\s*SYSTEM/i.test(text);
  const hasSSSAbbrev =
    /\bSSS\b/.test(upper) && !/PHILSYS|UMID|MULTI.?PURPOSE/i.test(text);
  const hasSSSNumber = /\d{2}-\d{7}-\d/.test(text);
  if (hasSSSText || (hasSSSAbbrev && hasSSSNumber)) {
    if (hasSSSText) matchedPatterns.push("Social Security System");
    if (hasSSSNumber) matchedPatterns.push("ID: ##-#######-#");
    return { idType: "SSS ID", confidence: 0.85, matchedPatterns };
  }

  // Passport
  const hasPassport =
    /PASSPORT/i.test(text) ||
    /REPUBLIKA\s*NG\s*PILIPINAS/i.test(text) ||
    /DEPARTMENT\s*OF\s*FOREIGN\s*AFFAIRS/i.test(text) ||
    /\bDFA\b/.test(upper);
  const hasPassportNumber = /[A-Z]{1,2}\d{7}/.test(text);
  if (hasPassport || hasPassportNumber) {
    if (hasPassport) matchedPatterns.push("Philippine Passport");
    if (hasPassportNumber) matchedPatterns.push("Passport number format");
    return { idType: "Passport", confidence: 0.85, matchedPatterns };
  }

  // City / Barangay ID
  if (
    /QUEZON\s*CITY/i.test(text) ||
    /CITY\s*OF\s*MANILA/i.test(text) ||
    /CITY\s*ID/i.test(text) ||
    /BARANGAY\s*ID/i.test(text)
  ) {
    matchedPatterns.push("City/Barangay ID");
    return { idType: "City ID", confidence: 0.8, matchedPatterns };
  }

  // School ID
  if (
    /UNIVERSITY/i.test(text) ||
    /COLLEGE/i.test(text) ||
    /STUDENT\s*ID/i.test(text) ||
    /SCHOOL\s*ID/i.test(text)
  ) {
    matchedPatterns.push("School/University");
    return { idType: "School ID", confidence: 0.7, matchedPatterns };
  }

  return { idType: "Other", confidence: 0.3, matchedPatterns: ["No patterns matched"] };
}

/* =========================
   Normalizers / Validators
========================= */

export function normalizeIdNumberGeneric(raw: string): string {
  if (!raw) return "";
  return raw.replace(/\s+/g, "").trim();
}

export function normalizeDate(dateStr: string): string {
  if (!dateStr) return "";

  const monthNames = [
    "january","february","march","april","may","june",
    "july","august","september","october","november","december"
  ];

  const cleaned = dateStr.trim().replace(/[,]/g, "").toLowerCase();

  // e.g. "january 3 1999"
  for (let i = 0; i < monthNames.length; i++) {
    if (cleaned.includes(monthNames[i])) {
      const regex = new RegExp(`${monthNames[i]}\\s+(\\d{1,3})\\s+(\\d{4})`);
      const match = cleaned.match(regex);
      if (match) {
        const month = (i + 1).toString().padStart(2, "0");
        let dayNum = parseInt(match[1], 10);

        if (Number.isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
          if (match[1].length >= 2) {
            const candidate = parseInt(match[1].slice(0, 2), 10);
            if (candidate >= 1 && candidate <= 31) dayNum = candidate;
          }
        }
        if (Number.isNaN(dayNum) || dayNum < 1 || dayNum > 31) continue;

        const day = dayNum.toString().padStart(2, "0");
        return `${match[2]}-${month}-${day}`;
      }
    }
  }

  // ISO-like: 1987/10/04 or 1987-10-04
  const isoNumeric = cleaned.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoNumeric) {
    return `${isoNumeric[1]}-${isoNumeric[2].padStart(2, "0")}-${isoNumeric[3].padStart(2, "0")}`;
  }

  // 03/01/1999 or 3-1-1999
  const numeric = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (numeric) {
    let y = numeric[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${numeric[1].padStart(2, "0")}-${numeric[2].padStart(2, "0")}`;
  }

  return "";
}

export function isValidNationalIdNumber(id: string): boolean {
  return /^\d{4}-\d{4}-\d{4}-\d{4}$/.test(id.trim());
}

export function isValidPhilHealthNumber(id: string): boolean {
  return /^\d{2}-\d{9}-\d$/.test(id.trim());
}

export function isValidUmidCrn(id: string): boolean {
  return /^CRN-\d{4}-\d{7}-\d$/i.test(id.trim());
}

export function isValidDriversLicenseNumber(id: string): boolean {
  const trimmed = id.trim();
  if (!trimmed) return false;
  return /\b[A-Z]\d{2}-\d{2}-\d{6}\b/i.test(trimmed);
}

export function isValidQcCitizenNumber(id: string): boolean {
  const trimmed = id.trim();
  if (!trimmed) return false;
  return /^\d{3}-\d{8}$/.test(trimmed);
}

export function isReasonableDob(isoDate: string): boolean {
  if (!isoDate) return false;
  const [y, m, d] = isoDate.split("-");
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return false;
  }

  const now = new Date();
  const ageYears = (now.getTime() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears >= 10 && ageYears <= 110;
}

export function isReasonableFullName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (NATIONAL_ID_HEADER_RE.test(trimmed)) return false;
  if (trimmed.length < 5) return false;
  if (!/\s/.test(trimmed)) return false;

  const letters = trimmed.replace(/[^A-Za-z\s]/g, "").length;
  if (letters / Math.max(trimmed.length, 1) < 0.6) return false;

  if (/(non-?professional|professional|drivers?|license|lto|republic|philippines|department|transportation|office|signature)/i.test(trimmed)) {
    return false;
  }

  return true;
}

/* =========================
   Name cleaning
========================= */

const NAME_GARBAGE_TEST_RE =
  /\b(?:REPUBLIKA|REPUBLIC|PILIPINAS|PHILIPPINES|PAMBANS\w*|PAGKAKA\w*|PHILSYS|NATIONAL\s*ID|IDENTIFICATION|LAND\s*TRANSPORTATION|LTO|SOCIAL\s*SECURITY|SYSTEM|SSS|PHILHEALTH|PASSPORT|DFA|PROFESSIONAL\s*REGULATION|PRC|DRIVER'?S?\s*LICEN[CS]E|LICENSE\s*(?:NO|NUMBER)|LICENSE\s*REGISTRATION|DEPARTMENT|COMMISSION|GOVERNMENT|PAMBANSANG|PAGKAKAKILANLAN)\b/i;

const NAME_GARBAGE_REPLACE_RE =
  /\b(?:REPUBLIKA|REPUBLIC|PILIPINAS|PHILIPPINES|PAMBANS\w*|PAGKAKA\w*|PHILSYS|NATIONAL\s*ID|IDENTIFICATION|LAND\s*TRANSPORTATION|LTO|SOCIAL\s*SECURITY|SYSTEM|SSS|PHILHEALTH|PASSPORT|DFA|PROFESSIONAL\s*REGULATION|PRC|DRIVER'?S?\s*LICEN[CS]E|LICENSE\s*(?:NO|NUMBER)|LICENSE\s*REGISTRATION|DEPARTMENT|COMMISSION|GOVERNMENT|PAMBANSANG|PAGKAKAKILANLAN)\b/gi;

export function cleanNameCandidate(name: string): string {
  if (!name) return "";
  const cleaned = name
    .replace(NAME_GARBAGE_REPLACE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.split(/\s+/).length < 2) return "";
  return cleaned;
}

export function isGarbageNameCandidate(name: string): boolean {
  if (!name) return false;
  return NAME_GARBAGE_TEST_RE.test(name);
}

/* =========================
   Generic helpers
========================= */

function isLikelyNameLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 5) return false;

  if (NAME_GARBAGE_TEST_RE.test(trimmed)) return false;

  const words = trimmed.split(/\s+/);
  if (words.length < 2) return false;

  const letters = trimmed.replace(/[^A-Za-z\s]/g, "").length;
  if (letters / Math.max(trimmed.length, 1) < 0.6) return false;

  if (/name\b|surname\b|given\b|middle\b|birth\b|date\b|sex\b|gender\b/i.test(trimmed)) {
    return false;
  }

  if (!isReasonableFullName(trimmed)) return false;

  return true;
}

function pickBestNameLine(lines: string[]): string {
  const candidates = lines.filter(isLikelyNameLine);
  if (candidates.length === 0) return "";
  return candidates.sort((a, b) => b.length - a.length)[0].trim();
}

function pickBestDob(text: string): string {
  const joined = text.replace(/\s+/g, " ").trim();

  const isoMatch = joined.match(/\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/);
  if (isoMatch) {
    const normIso = normalizeDate(isoMatch[0]);
    if (normIso) return normIso;
  }

  const numericMatch = joined.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/);
  if (numericMatch) {
    const norm = normalizeDate(numericMatch[0]);
    if (norm) return norm;
  }

  const textMatch = joined.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,3},?\s+\d{4}\b/i
  );
  if (textMatch) {
    const norm = normalizeDate(textMatch[0]);
    if (norm) return norm;
  }

  return "";
}

function pickBestIdToken(text: string): string {
  const tokens = text.split(/\s+/);

  const candidates = tokens.filter((t) => {
    if (t.length < 6) return false;
    if (!/\d/.test(t)) return false;

    const cleaned = t.replace(/[^A-Za-z0-9\-]/g, "");
    if (cleaned.length / t.length < 0.7) return false;

    return true;
  });

  if (candidates.length === 0) return "";

  let best = candidates.sort((a, b) => b.length - a.length)[0];
  best = best.replace(/[.,]+$/, "");
  return best;
}

function extractSurnameToken(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  if (parts.length > 2) return null;

  const last = parts[parts.length - 1] || "";
  if (!/^[A-Z]{3,20}$/.test(last)) return null;
  if (/\d/.test(last)) return null;

  return last;
}

/* =========================
   Address extraction
========================= */

function extractAddress(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const addrIdx = lines.findIndex((l) => /^address/i.test(l) || /\baddress\s*:/i.test(l));
  if (addrIdx !== -1) {
    const addrLines = lines
      .slice(addrIdx + 1, addrIdx + 4)
      .filter((l) => !/(name|birth|sex|date|id|number|license|expiry)/i.test(l));
    if (addrLines.length > 0) {
      return addrLines.join(", ").replace(/\s+/g, " ").trim();
    }
  }

  const addrPattern = lines.find((l) =>
    /(brgy|barangay|street|st\.|ave|avenue|city|metro|manila|quezon)/i.test(l)
  );

  return addrPattern || "";
}

/* =========================
   Post-processing
========================= */

function postProcess(info: ExtractedInfo): ExtractedInfo {
  const out: ExtractedInfo = {
    ...info,
    fullName: (info.fullName || "").replace(/\s+/g, " ").trim(),
    dob: (info.dob || "").trim(),
    idNumber: normalizeIdNumberGeneric(info.idNumber || ""),
  };

  if (out.fullName) {
    const cleaned = cleanNameCandidate(out.fullName);
    out.fullName = cleaned || out.fullName;
    if (!isReasonableFullName(out.fullName)) {
      out.fullName = "";
      if (out.confidence) out.confidence.fullName = Math.min(out.confidence.fullName, 0.2);
    }
  }

  if (out.dob) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(out.dob)) {
      const norm = normalizeDate(out.dob);
      out.dob = norm || out.dob;
    }
    if (!isReasonableDob(out.dob)) {
      out.dob = "";
      if (out.confidence) out.confidence.dob = Math.min(out.confidence.dob, 0.2);
    }
  }

  // Per-type idNumber validation (soft-fail)
  const id = out.idNumber;
  const lowerType = (out.idType || "").toLowerCase();

  const softInvalidate = () => {
    out.idNumber = "";
    if (out.confidence) out.confidence.idNumber = Math.min(out.confidence.idNumber, 0.25);
  };

  if (id) {
    if (lowerType.includes("national")) {
      if (!isValidNationalIdNumber(id)) softInvalidate();
    } else if (lowerType.includes("philhealth")) {
      if (!isValidPhilHealthNumber(id)) softInvalidate();
    } else if (lowerType.includes("umid")) {
      if (!isValidUmidCrn(id)) softInvalidate();
    } else if (lowerType.includes("driver")) {
      // Your driver's license parser may normalize to N##-##-######. Validate that.
      if (!isValidDriversLicenseNumber(id)) {
        // allow older pattern without leading letter, but keep confidence lower
        const okAlt = /^\d{2,3}-\d{2}-\d{6}$/.test(id);
        if (!okAlt) softInvalidate();
        else if (out.confidence) out.confidence.idNumber = Math.min(out.confidence.idNumber, 0.6);
      }
    }
  }

  return out;
}

/* =========================
   Parsers
========================= */

export function parseNationalId(text: string): ExtractedInfo {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const joined = text.replace(/\s+/g, " ");

  const nameCandidateLines = lines.filter((line) => !NATIONAL_ID_HEADER_RE.test(line));

  const idMatch = joined.match(/\b\d{4}-\d{4}-\d{4}-\d{4}\b/);
  const idNumber = idMatch ? idMatch[0] : "";

  const getLineBelow = (keywordRegex: RegExp): string => {
    const idx = lines.findIndex((l) => keywordRegex.test(l));
    if (idx !== -1 && idx + 1 < lines.length) {
      const nextLine = lines[idx + 1].trim();
      if (!/Apelyido|Given|Petsa|Date|Kapanganakan|Birth|ID|Numero/i.test(nextLine)) {
        return nextLine;
      }
    }
    return "";
  };

  const headerLike =
    /(PILIP|PHILIPPINES?|REPUBLIKA|REPUBLIC|PAMBANSANG|PAGKAKAKILANLAN|IDENTIFICATION|CARD)/i;

  const lastName =
    getLineBelow(/Apelyido|Last\s*Name/i) ||
    pickBestNameLine(nameCandidateLines.filter((l) => /^[A-Z\s]{3,}$/.test(l) && !headerLike.test(l))) ||
    "";

  const givenNames = getLineBelow(/Mga\s*Pangalan|Given\s*Names/i) || "";
  const middleName = getLineBelow(/Gitnang\s*Apelyido|Middle\s*Name/i) || "";

  let anchor = givenNames || lastName;
  if (anchor && (/^\//.test(anchor) || /(CITY|CTY)/i.test(anchor))) {
    anchor = lastName;
  }

  let finalGivenNames = anchor;
  let finalLastName = "";

  if (anchor) {
    const anchorIdx = lines.indexOf(anchor);
    if (anchorIdx > 0) {
      for (let i = anchorIdx - 1; i >= 0 && i >= anchorIdx - 3; i--) {
        const tok = extractSurnameToken(lines[i]);
        if (tok) {
          finalLastName = tok;
          break;
        }
      }
    }
  }

  if (!finalLastName && lastName && lastName !== anchor) finalLastName = lastName;

  const dobMatch = joined.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,3}\s*\d{4}\b/i
  );
  const dobRaw = dobMatch ? dobMatch[0] : "";
  const dob = normalizeDate(dobRaw);

  const rawFullName = [finalGivenNames, middleName, finalLastName].filter(Boolean).join(" ").trim();
  const fullName = cleanNameCandidate(rawFullName) || rawFullName;

  return postProcess({
    fullName,
    dob,
    idNumber,
    idType: "National ID",
    confidence: {
      fullName: fullName ? 0.95 : 0.4,
      dob: dob ? 0.9 : 0.4,
      idNumber: idNumber ? 1.0 : 0.3,
    },
  });
}

export function parsePhilHealthId(text: string): ExtractedInfo {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const joined = text.replace(/\s+/g, " ").trim();

  const idMatch = joined.match(/\b\d{2}-\d{9}-\d\b/);
  const idNumber = idMatch ? idMatch[0] : "";

  let fullName = "";
  const nameLine = lines.find((l) => /^[A-Z][A-Za-z'\-]+,\s*[A-Za-z]/.test(l));
  if (nameLine) {
    const [lastPart, givenPartRaw] = nameLine.split(",", 2);
    const lastName = lastPart.trim();
    const givenPart = (givenPartRaw || "").trim();
    fullName = lastName && givenPart ? `${givenPart} ${lastName}`.replace(/\s+/g, " ").trim() : nameLine;
  }

  let dob = "";
  const dobMatch = joined.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),\s*(\d{4})\b/i
  );
  if (dobMatch) {
    const monthAbbr = dobMatch[1].toLowerCase();
    const day = dobMatch[2].padStart(2, "0");
    const year = dobMatch[3];

    const monthMap: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };

    const month = monthMap[monthAbbr] || "";
    if (month) dob = `${year}-${month}-${day}`;
  }

  return postProcess({
    fullName,
    dob,
    idNumber,
    idType: "PhilHealth ID",
    confidence: {
      fullName: fullName ? 0.85 : 0.3,
      dob: dob ? 0.85 : 0.3,
      idNumber: idNumber ? 0.98 : 0.4,
    },
  });
}

export function parseUMID(text: string): ExtractedInfo {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const joined = text.replace(/\s+/g, " ").trim();

  let idNumber = "";
  const crnMatch = joined.match(/CRN-?\s*(\d{4})-?\s*(\d{7})-?\s*(\d)/i);
  if (crnMatch) idNumber = `CRN-${crnMatch[1]}-${crnMatch[2]}-${crnMatch[3]}`;

  let lastName = "";
  let givenNames = "";
  let middleName = "";

  const surnameIdx = lines.findIndex((l) => /surname/i.test(l));
  const givenIdx = lines.findIndex((l) => /given\s+name/i.test(l));
  const middleIdx = lines.findIndex((l) => /middle\s+name/i.test(l));

  if (surnameIdx !== -1 && surnameIdx + 1 < lines.length) lastName = lines[surnameIdx + 1].trim();

  if (givenIdx !== -1) {
    const start = givenIdx + 1;
    const end = middleIdx !== -1 ? middleIdx : lines.length;
    const givenLines = lines
      .slice(start, end)
      .map((l) => l.trim())
      .filter((l) => l && !/middle\s+name/i.test(l));
    givenNames = givenLines.join(" ").replace(/\s+/g, " ").trim();
  }

  if (middleIdx !== -1 && middleIdx + 1 < lines.length) middleName = lines[middleIdx + 1].trim();

  const rawFullName = [givenNames, middleName, lastName].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const fullName = cleanNameCandidate(rawFullName) || rawFullName;

  let dob = "";
  const dobLabelIdx = lines.findIndex((l) => /date\s+of\s+birth/i.test(l));
  if (dobLabelIdx !== -1 && dobLabelIdx + 1 < lines.length) {
    const dobRaw = lines[dobLabelIdx + 1].trim();
    const m = dobRaw.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
    if (m) dob = `${m[1]}-${m[2]}-${m[3]}`;
  }

  return postProcess({
    fullName,
    dob,
    idNumber,
    idType: "UMID",
    confidence: {
      fullName: fullName ? 0.8 : 0.3,
      dob: dob ? 0.85 : 0.3,
      idNumber: idNumber ? 0.95 : 0.4,
    },
  });
}

export function parseGeneric(text: string): ExtractedInfo {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const joined = text.replace(/\s+/g, " ").trim();

  const rawName = pickBestNameLine(lines);
  const fullName = cleanNameCandidate(rawName) || rawName || "";
  const dob = pickBestDob(joined);
  const idNumber = pickBestIdToken(joined);

  return postProcess({
    fullName,
    dob,
    idNumber,
    idType: "Unknown",
    confidence: {
      fullName: fullName ? 0.7 : 0.3,
      dob: dob ? 0.6 : 0.2,
      idNumber: idNumber ? 0.6 : 0.2,
    },
  });
}

export function parseDriversLicense(text: string): ExtractedInfo {
  const joined = text.replace(/\s+/g, " ").trim();

  let idNumber = "";
  const idMatch = joined.match(/N?\d{2,3}[-\s]?\d{2}[-\s]?\d{5,6}/);
  if (idMatch) {
    const digits = idMatch[0].replace(/\D/g, "");
    if (digits.length >= 10) {
      idNumber = `N${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
    }
  }

  let fullName = "";

  const nameMatch = joined.match(/([A-Z]{2,}(?:\s+[A-Z]{2,})*),\s*([A-Z]{2,}(?:\s+[A-Z]{2,})*)/);
  if (nameMatch) {
    const lastName = nameMatch[1].trim();
    const firstName = nameMatch[2].trim();
    if (!/REPUBLIC|PHILIPPINES|TRANSPORTATION|LICENSE|PROFESSIONAL/i.test(lastName)) {
      fullName = `${firstName} ${lastName}`;
    }
  }

  if (!fullName) {
    const allCapsLines = joined.match(/\b([A-Z]{3,}(?:\s+[A-Z]{3,}){2,4})\b/g) || [];
    for (const candidate of allCapsLines) {
      if (/REPUBLIC|PHILIPPINES|TRANSPORTATION|LICENSE|DRIVER|PROFESSIONAL|DEPARTMENT|OFFICE|NON-PROFESSIONAL/i.test(candidate)) {
        continue;
      }
      fullName = candidate;
      break;
    }
  }

  if (!fullName) {
    const afterLabels = joined.match(
      /(?:Last|First|Middle)\s*(?:Name|Nome)[^A-Z]*([A-Z]{3,}(?:\s+[A-Z]{3,}){2,4})/i
    );
    if (afterLabels) fullName = afterLabels[1];
  }

  if (fullName) fullName = fullName.replace(/^[a-z]\s+/i, "").trim();

  let dob = "";
  const dobMatch1 = joined.match(/\b(\d{4})[\/\-](\d{2})[\/\-](\d{2})\b/);
  if (dobMatch1) dob = `${dobMatch1[1]}-${dobMatch1[2]}-${dobMatch1[3]}`;

  if (!dob) {
    const dobMatch2 = joined.match(/\b(\d{4})[\/\-](\d{4})\b/);
    if (dobMatch2) {
      const mmdd = dobMatch2[2];
      dob = `${dobMatch2[1]}-${mmdd.slice(0, 2)}-${mmdd.slice(2)}`;
    }
  }

  if (!dob) dob = pickBestDob(joined);

  const address = extractAddress(text);

  return postProcess({
    fullName: fullName.replace(/\s+/g, " ").trim(),
    dob,
    idNumber,
    idType: "Driver's License",
    address,
    confidence: {
      fullName: fullName ? 0.85 : 0.3,
      dob: dob ? 0.8 : 0.3,
      idNumber: idNumber ? 0.95 : 0.3,
      address: address ? 0.7 : 0.2,
    },
  });
}

export function parseSSSId(text: string): ExtractedInfo {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const joined = text.replace(/\s+/g, " ").trim();

  let idNumber = "";
  const idMatch = joined.match(/\d{2}-\d{7}-\d/);
  if (idMatch) {
    idNumber = idMatch[0];
  } else {
    const digitMatch = joined.match(/\b(\d{9,10})\b/);
    if (digitMatch) {
      const digits = digitMatch[1];
      if (digits.length === 10) idNumber = `${digits.slice(0, 2)}-${digits.slice(2, 9)}-${digits.slice(9)}`;
      else if (digits.length === 9) idNumber = `0${digits.slice(0, 1)}-${digits.slice(1, 8)}-${digits.slice(8)}`;
    }
  }

  let fullName = "";

  const commaMatch = joined.match(/([A-Z][A-Z']+),\s*([A-Z][A-Z'\s.]+)/);
  if (commaMatch) fullName = `${commaMatch[2].trim()} ${commaMatch[1].trim()}`;

  if (!fullName) {
    const namePattern = joined.match(/\b([A-Z]{3,})\s+([A-Z]{3,})(?:\s+([A-Z]{3,}))?\b/);
    if (namePattern) {
      const candidate = namePattern[0];
      if (!/REPUBLIC|PHILIPPINES|SOCIAL|SECURITY|SYSTEM|PROUD|FILIPINO|PRESIDENT/i.test(candidate)) {
        fullName = candidate;
      }
    }
  }

  if (!fullName) {
    const excludePatterns = [
      /REPUBLIC/i,/PHILIPPINES/i,/SOCIAL/i,/SECURITY/i,/SYSTEM/i,
      /PRESIDENT/i,/PROUD/i,/FILIPINO/i,/SSS/i
    ];

    for (const line of lines) {
      const cleanedWords = line
        .split(/\s+/)
        .map((w) => w.replace(/[^A-Z]/gi, ""))
        .filter((w) => w.length >= 3 && /^[A-Z]+$/i.test(w));

      if (cleanedWords.length >= 2 && cleanedWords.length <= 4) {
        const isAllCaps = cleanedWords.every((w) => w === w.toUpperCase());
        const candidateLine = cleanedWords.join(" ");
        const isLabel = excludePatterns.some((p) => p.test(candidateLine));
        if (isAllCaps && !isLabel) {
          fullName = candidateLine;
          break;
        }
      }
    }
  }

  if (!fullName && idMatch) {
    const beforeId = joined.substring(0, joined.indexOf(idMatch[0]));
    const nameCandidate = beforeId.match(/([A-Z]{2,}\s+[A-Z]{2,}(?:\s+[A-Z]{2,})?)\s*$/);
    if (nameCandidate) fullName = nameCandidate[1];
  }

  if (fullName) {
    const words = fullName.split(/\s+/);
    while (words.length > 2 && words[0].length <= 2) words.shift();
    while (words.length > 2 && words[words.length - 1].length <= 2) words.pop();
    fullName = words.join(" ");
  }

  const dob = pickBestDob(joined);

  return postProcess({
    fullName: fullName.replace(/\s+/g, " ").trim(),
    dob,
    idNumber,
    idType: "SSS ID",
    confidence: {
      fullName: fullName ? 0.85 : 0.3,
      dob: dob ? 0.8 : 0.3,
      idNumber: idNumber ? 0.95 : 0.3,
    },
  });
}

export function parseCityId(text: string): ExtractedInfo {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const joined = text.replace(/\s+/g, " ").trim();

  let idNumber = "";
  const qcMatch = joined.match(/QC-?\s*\d{6,}/i);
  if (qcMatch) {
    idNumber = qcMatch[0].replace(/\s/g, "");
  } else {
    const digitMatch = joined.match(/\b\d{8,}\b/);
    if (digitMatch) idNumber = digitMatch[0];
  }

  let fullName = "";
  const nameMatch = joined.match(/([A-Z][A-Z']+),\s*([A-Z][A-Z'\s.]+)/);
  if (nameMatch) fullName = `${nameMatch[2].trim()} ${nameMatch[1].trim()}`;
  else fullName = pickBestNameLine(lines);

  const dob = pickBestDob(joined);
  const address = extractAddress(text);

  return postProcess({
    fullName: fullName.replace(/\s+/g, " ").trim(),
    dob,
    idNumber,
    idType: "City ID",
    address,
    confidence: {
      fullName: fullName ? 0.75 : 0.3,
      dob: dob ? 0.7 : 0.3,
      idNumber: idNumber ? 0.8 : 0.3,
      address: address ? 0.7 : 0.2,
    },
  });
}

/* =========================
   Router
========================= */

export function parseTextByIdType(text: string, idType: string): ExtractedInfo {
  switch (idType) {
    case "National ID":
      return parseNationalId(text);
    case "PhilHealth ID":
      return parsePhilHealthId(text);
    case "UMID":
      return parseUMID(text);
    case "Driver's License":
      return parseDriversLicense(text);
    case "SSS ID":
      return parseSSSId(text);
    case "City ID":
      return parseCityId(text);
    case "QC ID":
    case "Other":
    default:
      return parseGeneric(text);
  }
}