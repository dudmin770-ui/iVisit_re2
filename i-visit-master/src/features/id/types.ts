// src/features/id/core/types.ts

import type { ExtractedInfo } from "../../utils/idParsers";

export type IdTypeKey = string;

export interface IdOcrProfile {
  usesSplitNameRois: boolean;
  roiKeys: string[];
}

export interface IdTypeDescriptor {
  idType: IdTypeKey;
  label: string;
  parser: (text: string) => ExtractedInfo;
  validateIdNumber?: (id: string) => boolean;
  validateFullName?: (name: string) => boolean;
  validateDob?: (dobIso: string) => boolean;
  roiProfile: IdOcrProfile;
  cardTemplateKey?: string;
  idNumberLabel?: string;
}
