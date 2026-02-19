package com.ivisit.backend.service;

import com.ivisit.backend.dto.VisitorLogEntryDTO;
import com.ivisit.backend.model.*;
import com.ivisit.backend.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class VisitorLogEntryService {

    @Autowired
    private VisitorLogEntryRepository visitorLogEntryRepository;

    @Autowired
    private VisitorLogRepository visitorLogRepository;

    @Autowired
    private StationRepository stationRepository;

    @Autowired
    private UserAccountRepository userAccountRepository;

    /**
     * Creates a new VisitorLogEntry when a visitor checks in or out at a station.
     */
    public VisitorLogEntry recordEntry(Long visitorLogId, Long stationId, Long accountId) {
        Optional<VisitorLog> logOpt = visitorLogRepository.findById(visitorLogId);
        Optional<Station> stationOpt = stationRepository.findById(stationId);
        Optional<UserAccount> userOpt = userAccountRepository.findById(accountId);

        if (!logOpt.isPresent() || !stationOpt.isPresent() || !userOpt.isPresent()) {
            throw new RuntimeException("Invalid reference: log, station, or user not found");
        }

        VisitorLog log = logOpt.get();
        Station station = stationOpt.get();
        UserAccount user = userOpt.get();

        String status = log.getStatus() != null
                ? log.getStatus().trim().toUpperCase()
                : "ACTIVE";

        boolean isActiveLike =
                "ACTIVE".equals(status) || "ACTIVE_OVERSTAY".equals(status);

        if (log.getActiveEnd() != null || !isActiveLike) {
            throw new RuntimeException("Cannot record movement on a non-active log.");
        }

        // Deduplicate "double entrance" calls (same station within a short window)
        visitorLogEntryRepository.findTopByVisitorLogOrderByTimestampDesc(log).ifPresent(latest -> {
            if (latest.getStation() != null
                    && latest.getStation().getId() != null
                    && latest.getStation().getId().equals(stationId)
                    && latest.getTimestamp() != null) {

                long nowMs = System.currentTimeMillis();
                long lastMs = latest.getTimestamp().getTime();

                // tune window if needed (e.g., 5–30 seconds)
                if (nowMs - lastMs >= 0 && nowMs - lastMs <= 15000) {
                    throw new RuntimeException("DUPLICATE_ENTRY_SUPPRESSED");
                }
            }
        });

        VisitorLogEntry entry = new VisitorLogEntry(
                log, station, user, new Timestamp(System.currentTimeMillis())
        );

        VisitorPass pass = log.getVisitorPass();
        if (pass != null) {
            String label = null;
            if (pass.getDisplayCode() != null && !pass.getDisplayCode().trim().isEmpty()) {
                label = pass.getDisplayCode().trim();
            } else if (pass.getPassNumber() != null && !pass.getPassNumber().trim().isEmpty()) {
                label = pass.getPassNumber().trim();
            }
            entry.setRecordedPassDisplayCode(label);
            entry.setRecordedPassOrigin(pass.getOriginLocation());
        }

        return visitorLogEntryRepository.save(entry);
    }

    public List<VisitorLogEntryDTO> getRecentEntries(int limit) {
        List<VisitorLogEntry> entries = visitorLogEntryRepository.findAll();

        // sort by timestamp DESC (most recent first)
        Collections.sort(entries, new Comparator<VisitorLogEntry>() {
            @Override
            public int compare(VisitorLogEntry e1, VisitorLogEntry e2) {
                Timestamp t1 = e1.getTimestamp();
                Timestamp t2 = e2.getTimestamp();
                if (t1 == null && t2 == null) return 0;
                if (t1 == null) return 1;
                if (t2 == null) return -1;
                return t2.compareTo(t1); // descending
            }
        });

        if (limit > 0 && entries.size() > limit) {
            entries = entries.subList(0, limit);
        }

        return entries.stream()
                .map(this::mapToDTO)
                .collect(Collectors.toList());
    }

    public List<VisitorLogEntryDTO> getArchivedEntries() {
        List<VisitorLogEntry> entries = visitorLogEntryRepository.findByArchivedTrue();
        return entries.stream()
                .map(this::mapToDTO)
                .collect(Collectors.toList());
    }

    private VisitorLogEntryDTO mapToDTO(VisitorLogEntry entry) {
        VisitorLogEntryDTO dto = new VisitorLogEntryDTO();

        dto.setEntryId(entry.getVisitorLogEntryID());

        VisitorLog log = entry.getVisitorLog();
        Visitor visitor = log != null ? log.getVisitor() : null;
        VisitorPass pass = log != null ? log.getVisitorPass() : null;
        Station station = entry.getStation();
        UserAccount guard = entry.getUserAccount();

        // link entry back to VisitorLog
        dto.setVisitorLogId(log != null ? log.getVisitorLogID() : null);

        // Visitor name & type
        dto.setVisitorName(visitor != null && visitor.getVisitorName() != null
                ? visitor.getVisitorName()
                : "Unknown visitor");
        dto.setVisitorType(visitor != null ? visitor.getVisitorType() : null);

        // Station name
        dto.setStationName(station != null && station.getName() != null
                ? station.getName()
                : "Unknown station");

        // Guard name
        dto.setGuardName(guard != null && guard.getUsername() != null
                ? guard.getUsername()
                : "System");

        // Pass number – now snapshot-first
        String passNo = entry.getRecordedPassDisplayCode();
        if (passNo == null || passNo.trim().isEmpty()) {
            if (pass != null) {
                if (pass.getDisplayCode() != null && !pass.getDisplayCode().trim().isEmpty()) {
                    passNo = pass.getDisplayCode().trim();
                } else if (pass.getPassNumber() != null && !pass.getPassNumber().trim().isEmpty()) {
                    passNo = pass.getPassNumber().trim();
                } else if (pass.getPassID() != null) {
                    passNo = "P-" + pass.getPassID();
                }
            }
        }
        dto.setPassNo(passNo);

        dto.setPassOrigin(entry.getRecordedPassOrigin());

        // Timestamp as ISO string
        Timestamp ts = entry.getTimestamp();
        String tsStr = ts != null ? ts.toInstant().toString() : null;
        dto.setTimestamp(tsStr);

        dto.setArchived(log.getArchived() != null ? log.getArchived() : false);
        dto.setArchivedAt(entry.getArchivedAt() != null ? entry.getArchivedAt().toString() : null);

        return dto;
    }
}
