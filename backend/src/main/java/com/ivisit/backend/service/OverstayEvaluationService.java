package com.ivisit.backend.service;

import com.ivisit.backend.dto.VisitorPassIncidentRequest;
import com.ivisit.backend.model.VisitorLog;
import com.ivisit.backend.model.VisitorLogEntry;
import com.ivisit.backend.model.VisitorPass;
import com.ivisit.backend.repository.VisitorLogRepository;
import com.ivisit.backend.repository.VisitorPassRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;

@Service
public class OverstayEvaluationService {

    private static final Logger log = LoggerFactory.getLogger(OverstayEvaluationService.class);
    private static final long SOFT_OVERSTAY_HOURS = 8L;
    private static final long HARD_OVERSTAY_HOURS = 12L;

    @Autowired
    private VisitorLogRepository visitorLogRepository;

    @Autowired
    private VisitorPassRepository visitorPassRepository;

    @Autowired
    private VisitorPassIncidentService incidentService;

    @Transactional
    public void evaluateOverstays() {
        List<VisitorLog> activeLogs = visitorLogRepository.findActiveLogsWithEntries();
        Timestamp now = new Timestamp(System.currentTimeMillis());

        for (VisitorLog visitorLog : activeLogs) {
            try {
                String status = visitorLog.getStatus() != null
                        ? visitorLog.getStatus().trim().toUpperCase()
                        : "ACTIVE";

                // We only care about logs that are still logically active
                boolean isActiveLike =
                        "ACTIVE".equals(status) || "ACTIVE_OVERSTAY".equals(status);

                if (!isActiveLike) {
                    continue;
                }

                Timestamp reference = computeOverstayReference(visitorLog);
                if (reference == null) {
                    continue;
                }

                long hours = Duration.between(reference.toInstant(), now.toInstant()).toHours();

                if (hours >= HARD_OVERSTAY_HOURS) {
                    // Hard overstay: lock and end
                    markLogAsHardOverstay(visitorLog, now);
                } else if (hours >= SOFT_OVERSTAY_HOURS) {
                    // Soft overstay: mark as ACTIVE_OVERSTAY if not already
                    if ("ACTIVE".equals(status)) {
                        visitorLog.setStatus("ACTIVE_OVERSTAY");
                        visitorLogRepository.save(visitorLog);
                    }
                }
            } catch (Exception ex) {
                log.error(
                        "Overstay evaluation failed for VisitorLog ID {}: {}",
                        visitorLog.getVisitorLogID(),
                        ex.getMessage(),
                        ex
                );
            }
        }
    }

    private Timestamp computeOverstayReference(VisitorLog log) {
        Timestamp base = log.getActiveStart();

        List<VisitorLogEntry> entries = log.getVisitorLogEntries();
        if (entries != null && !entries.isEmpty()) {
            entries.sort(Comparator.comparing(VisitorLogEntry::getTimestamp));
            Timestamp firstTs = entries.get(0).getTimestamp();
            if (firstTs != null) {
                return firstTs;
            }
        }

        return base;
    }

    private void markLogAsHardOverstay(VisitorLog log, Timestamp now) {
        if (log.getActiveEnd() == null) {
            log.setActiveEnd(now);
        }
        log.setStatus("LOCKED_OVERSTAY");

        visitorLogRepository.save(log);

        VisitorPass pass = log.getVisitorPass();
        if (pass != null) {
            String currentStatus = pass.getStatus() != null
                    ? pass.getStatus().trim().toUpperCase()
                    : "";

            if (!"LOST".equals(currentStatus)
                    && !"INACTIVE".equals(currentStatus)
                    && !"RETIRED".equals(currentStatus)
                    && !"OVERSTAY_LOCKED".equals(currentStatus)) {
                pass.setStatus("OVERSTAY_LOCKED");
                visitorPassRepository.save(pass);
            }

            VisitorPassIncidentRequest req = new VisitorPassIncidentRequest();
            req.setPassId(pass.getPassID());
            if (log.getVisitor() != null) {
                req.setVisitorId(log.getVisitor().getVisitorID());
            }
            req.setVisitorLogId(log.getVisitorLogID());
            req.setIncidentType("OVERSTAY");
            req.setDescription("Visit exceeded " + HARD_OVERSTAY_HOURS + " hours and was auto-locked.");

            incidentService.createIncident(req);
        }
    }
}
