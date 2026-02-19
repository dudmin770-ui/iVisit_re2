package com.ivisit.backend.service;

import com.ivisit.backend.model.Visitor;
import com.ivisit.backend.model.VisitorLog;
import com.ivisit.backend.model.VisitorLogEntry;
import com.ivisit.backend.model.VisitorPass;
import com.ivisit.backend.repository.VisitorLogRepository;
import com.ivisit.backend.repository.VisitorLogEntryRepository;
import com.ivisit.backend.repository.VisitorPassRepository;
import com.ivisit.backend.repository.VisitorRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.util.List;

@Profile("dev")
@Service
public class DebugService {

    private final VisitorRepository visitorRepository;
    private final VisitorPassRepository visitorPassRepository;
    private final VisitorLogRepository visitorLogRepository;
    private final VisitorLogEntryRepository visitorLogEntryRepository;

    public DebugService(
            VisitorRepository visitorRepository,
            VisitorPassRepository visitorPassRepository,
            VisitorLogRepository visitorLogRepository,
            VisitorLogEntryRepository visitorLogEntryRepository
    ) {
        this.visitorRepository = visitorRepository;
        this.visitorPassRepository = visitorPassRepository;
        this.visitorLogRepository = visitorLogRepository;
        this.visitorLogEntryRepository = visitorLogEntryRepository;
    }

    @Transactional
    public VisitorLog createDebugOverstayLog(Long visitorId, Long passId, long hoursAgo) {
        if (hoursAgo <= 0) {
            throw new IllegalArgumentException("hoursAgo must be positive for debug overstay.");
        }

        Visitor visitor = visitorRepository.findById(visitorId)
                .orElseThrow(() -> new RuntimeException("Visitor not found"));

        VisitorPass pass = visitorPassRepository.findById(passId)
                .orElseThrow(() -> new RuntimeException("Pass not found"));

        // Visitor cannot have an active log
        List<VisitorLog> existingActive =
                visitorLogRepository.findByVisitorAndActiveEndIsNull(visitor);
        if (!existingActive.isEmpty()) {
            throw new RuntimeException("Visitor already has an active log.");
        }

        String passStatus = pass.getStatus() != null
                ? pass.getStatus().trim().toUpperCase()
                : "AVAILABLE";
        if (!"AVAILABLE".equals(passStatus)) {
            throw new RuntimeException("Pass is not AVAILABLE for debug overstay.");
        }

        Timestamp now = new Timestamp(System.currentTimeMillis());
        long millisAgo = hoursAgo * 60L * 60L * 1000L;
        Timestamp debugStart = new Timestamp(now.getTime() - millisAgo);

        VisitorLog log = new VisitorLog();
        log.setVisitor(visitor);
        log.setVisitorPass(pass);
        log.setActiveStart(debugStart);
        log.setActiveEnd(null);
        log.setStatus("ACTIVE");
        log.setPurposeOfVisit("DEBUG_OVERSTAY");
        log.setArchived(Boolean.FALSE);

        VisitorLog saved = visitorLogRepository.save(log);

        pass.setStatus("IN_USE");
        visitorPassRepository.save(pass);

        return saved;
    }

    @Transactional
    public VisitorLog createDebugEndedLogForArchive(Long visitorId, long daysAgoEnded) {
        if (daysAgoEnded <= 0) {
            throw new IllegalArgumentException("daysAgoEnded must be positive for debug archive.");
        }

        Visitor visitor = visitorRepository.findById(visitorId)
                .orElseThrow(() -> new RuntimeException("Visitor not found"));

        // 1. Compute timestamps
        Timestamp now = new Timestamp(System.currentTimeMillis());
        long millisAgo = daysAgoEnded * 24L * 60L * 60L * 1000L;

        Timestamp endTs = new Timestamp(now.getTime() - millisAgo);
        Timestamp startTs = new Timestamp(endTs.getTime() - 2L * 60L * 60L * 1000L); // 2-hour visit

        // 2. Create ended, unarchived log
        VisitorLog log = new VisitorLog();
        log.setVisitor(visitor);
        log.setVisitorPass(null);          // Not needed for archive tests
        log.setActiveStart(startTs);
        log.setActiveEnd(endTs);
        log.setStatus("ENDED");
        log.setPurposeOfVisit("DEBUG_ARCHIVE");
        log.setArchived(Boolean.FALSE);
        log.setArchivedAt(null);

        VisitorLog saved = visitorLogRepository.save(log);

        // 3. For archive logic: update visitor’s "last activity" timestamp
        Timestamp visitorCreatedAt = new Timestamp(endTs.getTime() - 1); // older than the last log
        visitor.setCreatedAt(visitorCreatedAt);
        visitorRepository.save(visitor);

        return saved;
    }
}
