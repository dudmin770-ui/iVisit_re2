// src/api/OcrApi.tsx
const HELPER_BASE_URL = import.meta.env.VITE_HELPER_BASE_URL

import { recognizeImage } from "../utils/ocrClient";

export interface ExtractTextResponse {
  extractedText: string;
  meanConfidence?: number; // 0–100
  processedImageBase64?: string;
  personNames?: string[];
}

export type OcrMode = "block" | "line";
export type OcrProfile = "name" | "numeric" | "dob";

export async function extractText(
  file: File,
  options?: { mode?: OcrMode; profile?: OcrProfile }
): Promise<ExtractTextResponse> {
  const formData = new FormData();
  formData.append("file", file);

  if (options?.mode) formData.append("mode", options.mode);
  if (options?.profile) formData.append("profile", options.profile);

 // Use multipass OCR for best accuracy (tries multiple preprocessing methods)
  const res = await fetch(`${HELPER_BASE_URL}/api/ocr/multipass`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`OCR failed: ${res.status}`);
  }

  return res.json();
}

// Client-side OCR using Tesseract.js, unused due to relying on Helper App
export async function extractTextJs(file: File): Promise<ExtractTextResponse> {
  try {
    const text = await recognizeImage(file);
    return { extractedText: text || "" };
  } catch (err) {
    console.error("Tesseract.js OCR failed:", err);
    throw new Error("OCR request failed on client-side.");
  }
}