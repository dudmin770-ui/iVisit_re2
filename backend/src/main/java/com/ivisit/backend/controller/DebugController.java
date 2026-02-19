package com.ivisit.backend.controller;

import com.ivisit.backend.dto.DebugOverstayLogRequest;
import com.ivisit.backend.jobs.VisitorArchiveScheduler;
import com.ivisit.backend.model.VisitorLog;
import com.ivisit.backend.service.ArchiveService;
import com.ivisit.backend.service.DebugService;
import com.ivisit.backend.service.OverstayEvaluationService;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@Profile("dev")
@RestController
@RequestMapping("/api/debug")
public class DebugController {

    private final DebugService debugService;
    private final OverstayEvaluationService overstayEvaluationService;
    private final VisitorArchiveScheduler visitorArchiveScheduler;

    public DebugController(
            DebugService debugService,
            OverstayEvaluationService overstayEvaluationService,
            VisitorArchiveScheduler visitorArchiveScheduler
    ) {
        this.debugService = debugService;
        this.overstayEvaluationService = overstayEvaluationService;
        this.visitorArchiveScheduler = visitorArchiveScheduler;
    }

    @PostMapping("/overstay-log")
    public Map<String, Object> createOverstayDebugLog(@RequestBody DebugOverstayLogRequest req) {
        if (req.getVisitorId() == null || req.getPassId() == null) {
            throw new IllegalArgumentException("visitorId and passId are required.");
        }

        long hoursAgo = req.getHoursAgo() > 0 ? req.getHoursAgo() : 12L; // default hard overstay
        VisitorLog log = debugService.createDebugOverstayLog(
                req.getVisitorId(),
                req.getPassId(),
                hoursAgo
        );

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("logId", log.getVisitorLogID());
        payload.put("visitorId", log.getVisitor().getVisitorID());
        payload.put("passId", log.getVisitorPass() != null ? log.getVisitorPass().getPassID() : null);
        payload.put("status", log.getStatus());
        payload.put("activeStart", log.getActiveStart());
        payload.put("hoursAgo", hoursAgo);

        return payload;
    }

    @PostMapping("/run-overstay-evaluation")
    public ResponseEntity<Void> runOverstayEvaluation() {
        overstayEvaluationService.evaluateOverstays();
        return ResponseEntity.ok().build();
    }

    @PostMapping("/run-archive")
    public ResponseEntity<Void> runArchiveNow() {
        visitorArchiveScheduler.archiveOldVisitorsWithLogs();
        return ResponseEntity.ok().build();
    }
}

