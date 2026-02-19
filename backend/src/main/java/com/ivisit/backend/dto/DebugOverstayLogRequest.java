package com.ivisit.backend.dto;

public class DebugOverstayLogRequest {
    private Long visitorId;
    private Long passId;
    private long hoursAgo;

    public Long getVisitorId() { return visitorId; }
    public void setVisitorId(Long visitorId) { this.visitorId = visitorId; }

    public Long getPassId() { return passId; }
    public void setPassId(Long passId) { this.passId = passId; }

    public long getHoursAgo() { return hoursAgo; }
    public void setHoursAgo(long hoursAgo) { this.hoursAgo = hoursAgo; }
}
