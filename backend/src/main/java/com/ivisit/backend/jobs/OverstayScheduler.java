package com.ivisit.backend.jobs;

import com.ivisit.backend.service.OverstayEvaluationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class OverstayScheduler {

    @Autowired
    private OverstayEvaluationService overstayEvaluationService;

    // e.g. every 5 minutes; tweak as you like
    @Scheduled(fixedDelay = 300_000)
    public void archiveOverstays() {
        overstayEvaluationService.evaluateOverstays();
    }
}