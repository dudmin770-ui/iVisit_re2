package com.ivisit.helper.controller;

import com.ivisit.helper.service.NameFinderService;
import com.ivisit.helper.utils.ImagePreprocessor;
import net.sourceforge.tess4j.ITessAPI;
import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.TesseractException;
import net.sourceforge.tess4j.Word;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.*;
// for debug
import java.io.ByteArrayOutputStream;


@RestController
@RequestMapping("/api/ocr")
public class OcrController {


    private final NameFinderService nameFinderService;
    private final String dataPath;


    public OcrController(@Value("${tesseract.datapath}") String dataPath, NameFinderService nameFinderService) {
        this.nameFinderService = nameFinderService;
        this.dataPath = dataPath;
    }

    private Tesseract newTesseract() {
        Tesseract t = new Tesseract();
        t.setDatapath(dataPath);
        t.setLanguage("eng");
        t.setOcrEngineMode(ITessAPI.TessOcrEngineMode.OEM_LSTM_ONLY);
        // Set DPI for better OCR (prevents "Invalid resolution 0 dpi" warning)
        t.setTessVariable("user_defined_dpi", "300");
        t.setTessVariable("tessedit_char_whitelist", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789- /,.");
        return t;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> extractText(
            @RequestParam("file") MultipartFile file,
            @RequestParam(name = "mode", required = false) String mode,
            @RequestParam(name = "profile", required = false) String profile
    ) {
        if (file.isEmpty()) {
            return error(HttpStatus.BAD_REQUEST, "Empty file");
        }

        BufferedImage original;
        try {
            original = ImageIO.read(file.getInputStream());
        } catch (IOException e) {
            return error(HttpStatus.BAD_REQUEST, "Unable to read image: " + e.getMessage());
        }

        if (original == null) {
            return error(HttpStatus.BAD_REQUEST, "Unsupported or corrupt image");
        }

        BufferedImage processed = ImagePreprocessor.preprocess(original);

        // Choose Page Segmentation Mode based on mode hint
        int psm = getPsm(mode);

        Tesseract t = newTesseract();

        t.setPageSegMode(psm);

        // Reset to a wide default whitelist every request
        t.setTessVariable("preserve_interword_spaces", "1");
        t.setTessVariable(
                "tessedit_char_whitelist",
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789- /"
        );
        // === Profile-specific tuning (Names / Numeric / DOB) ===
        if (profile != null) {
            switch (profile.toLowerCase()) {
                case "name":
                    // Name lines are always single-line uppercase
                    t.setPageSegMode(ITessAPI.TessPageSegMode.PSM_SINGLE_LINE);
                    t.setTessVariable("tessedit_char_whitelist", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -");
                    break;

                case "numeric":
                    // Numeric ID numbers, allow hyphens
                    t.setPageSegMode(ITessAPI.TessPageSegMode.PSM_SINGLE_LINE);
                    t.setTessVariable("tessedit_char_whitelist", "0123456789-");
                    break;

                case "dob":
                    // Dates with digits and separators
                    t.setPageSegMode(ITessAPI.TessPageSegMode.PSM_SINGLE_LINE);
                    t.setTessVariable("tessedit_char_whitelist", "0123456789/-");
                    break;

                default:
                    // fall back to your global whitelist
                    t.setTessVariable(
                            "tessedit_char_whitelist",
                            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789- /"
                    );
                    break;
            }
        }

        String result;
        java.util.List<String> personNames;
        try {
            result = t.doOCR(processed);
            personNames = nameFinderService.findPersonNames(result);
        } catch (TesseractException e) {
            return error(HttpStatus.INTERNAL_SERVER_ERROR, "OCR failed: " + e.getMessage());
        }

        //debug start
        String processedBase64 = null;
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(processed, "png", baos);
            processedBase64 = Base64.getEncoder().encodeToString(baos.toByteArray());
        } catch (IOException e) {
            System.err.println("Failed to encode processed image: " + e.getMessage());
        }
        //debug end

        int meanConfidence = 0; //-1;
        try {
            java.util.List<Word> words =
                    t.getWords(processed, ITessAPI.TessPageIteratorLevel.RIL_WORD);

            if (!words.isEmpty()) {
                int sum = 0;
                for (Word w : words) {
                    sum += w.getConfidence(); // 0–100 per word
                }
                meanConfidence = sum / words.size();
            }
        } catch (Exception e) {
            System.err.println("Failed to compute mean confidence: " + e.getMessage());
        }

        Map<String, Object> response = new HashMap<>();
        response.put("extractedText", result);
        response.put("personNames", personNames);
        if (processedBase64 != null) {
            response.put("processedImageBase64", processedBase64);
        }
        response.put("meanConfidence", meanConfidence);
        return ResponseEntity.ok(response);
    }

    private static int getPsm(String mode) {
        int psm;

        if ("line".equalsIgnoreCase(mode)) {
            // Single line – good for ID numbers / DOB fields
            psm = ITessAPI.TessPageSegMode.PSM_SINGLE_LINE;
        } else if ("block".equalsIgnoreCase(mode)) {
            // Single block of text – good for name blocks / full card
            psm = ITessAPI.TessPageSegMode.PSM_SINGLE_BLOCK;
        } else {
            // Default: automatic – or pick SINGLE_BLOCK as overall default
            psm = ITessAPI.TessPageSegMode.PSM_SINGLE_BLOCK;
        }
        return psm;
    }

    /**
     * Multi-pass OCR endpoint (Sprint 06)
     * Tries multiple preprocessing variants and returns the best result
     */
    @PostMapping("/multipass")
    public ResponseEntity<Map<String, Object>> extractTextMultipass(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return error(HttpStatus.BAD_REQUEST, "Empty file");
        }

        BufferedImage original;
        try {
            original = ImageIO.read(file.getInputStream());
        } catch (IOException e) {
            return error(HttpStatus.BAD_REQUEST, "Unable to read image: " + e.getMessage());
        }

        if (original == null) {
            return error(HttpStatus.BAD_REQUEST, "Unsupported or corrupt image");
        }

        List<OcrResult> results = new ArrayList<>();

        results.add(runOcr(ImagePreprocessor.preprocessStandard(original), "standard"));
        results.add(runOcr(ImagePreprocessor.preprocessHighContrast(original), "highContrast"));
        results.add(runOcr(ImagePreprocessor.preprocessInverted(original), "inverted"));
        results.add(runOcr(ImagePreprocessor.preprocessBinarized(original), "binarized"));
        results.add(runOcr(ImagePreprocessor.preprocessAdaptiveLocal(original), "adaptiveLocal"));

        OcrResult best = selectBest(results);

        Map<String, Object> response = new HashMap<>();
        response.put("extractedText", best.text);
        response.put("method", best.method);
        response.put("score", best.score);

        System.out.println("Helper OCR (multipass): tried " + results.size() + " methods");
        System.out.println("  - Best method: " + best.method + ", score: " + best.score);
        System.out.println("  - Text preview: "
                + (best.text.length() > 100 ? best.text.substring(0, 100) + "..." : best.text).replace("\n", " "));
        return ResponseEntity.ok(response);
    }

    private OcrResult runOcr(BufferedImage image, String method) {
        try {
            Tesseract t = newTesseract();
            String text = t.doOCR(image);
            int score = scoreResult(text);
            return new OcrResult(text, method, score);
        } catch (Exception e) {
            return new OcrResult("", method, 0);
        }
    }

    private int scoreResult(String text) {
        if (text == null || text.isEmpty())
            return 0;

        long alphaNum = text.chars().filter(Character::isLetterOrDigit).count();

        long garbage = text.chars()
                .filter(c -> !Character.isLetterOrDigit(c) && !Character.isWhitespace(c) && c != '-' && c != '/')
                .count();
        return (int) (alphaNum - garbage * 2);
    }

    private OcrResult selectBest(List<OcrResult> results) {
        return results.stream()
                .max(Comparator.comparingInt(r -> r.score))
                .orElse(results.get(0));
    }

    private ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        Map<String, Object> body = new HashMap<>();
        body.put("error", message);
        return ResponseEntity.status(status).body(body);
    }

    private static class OcrResult {
        final String text;
        final String method;
        final int score;

        OcrResult(String text, String method, int score) {
            this.text = text;
            this.method = method;
            this.score = score;
        }
    }
}
