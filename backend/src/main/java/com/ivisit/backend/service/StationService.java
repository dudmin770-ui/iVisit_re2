package com.ivisit.backend.service;

import com.ivisit.backend.model.Station;
import com.ivisit.backend.repository.StationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.Comparator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class StationService {

    @Autowired
    private StationRepository stationRepository;

    public List<Station> getAllStations() {
        return stationRepository.findAll();
    }

    public Optional<Station> getStationById(Long id) {
        return stationRepository.findById(id);
    }

    public Station getStationByName(String name) {
        return stationRepository.findByStationName(name);
    }

    public Station createStation(Station station) {
        String rawName = station.getName();
        if (rawName == null || rawName.trim().isEmpty()) {
            throw new RuntimeException("Station name is required.");
        }

        String name = rawName.trim();

        if (stationRepository.existsByStationNameIgnoreCase(name)) {
            throw new RuntimeException("A station with that name already exists.");
        }

        station.setName(name);
        station.setActive(true);
        return stationRepository.save(station);
    }

    public Station updateStation(Long id, Station updatedStation) {
        Optional<Station> existingOpt = stationRepository.findById(id);
        if (!existingOpt.isPresent()) {
            throw new RuntimeException("Station not found");
        }

        Station existing = existingOpt.get();

        if (updatedStation.getName() != null &&
                !updatedStation.getName().trim().isEmpty()) {

            String newName = updatedStation.getName().trim();

            // Only check if the name is actually changing
            if (!newName.equalsIgnoreCase(existing.getName())) {
                if (stationRepository.existsByStationNameIgnoreCase(newName)) {
                    throw new RuntimeException("A station with that name already exists.");
                }
            }

            existing.setName(newName);
        }

        if (updatedStation.getType() != null) {
            // normalize
            String t = updatedStation.getType().toLowerCase();
            if (!"gate".equals(t) && !"building".equals(t)) {
                t = null; // or throw if you want to be strict
            }
            existing.setType(t);
        }

        if (updatedStation.getActive() != null) {
            existing.setActive(updatedStation.getActive());
        }

        return stationRepository.save(existing);
    }

    // ideally, we won't be using this one
    public void deleteStation(Long id) {
        if (!stationRepository.existsById(id)) {
            throw new RuntimeException("Station not found");
        }
        stationRepository.deleteById(id);
    }

    public Station setStationActive(Long id, boolean active) {
        Station station = stationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Station not found"));
        station.setActive(active);
        return stationRepository.save(station);
    }


    // Gate and Alphabetical Ordering
    private static final Pattern GATE_PATTERN =
            Pattern.compile("(?i)\\bgate\\b\\s*([0-9]+)?\\s*([a-z])?");

    private static int typeRank(Station s) {
        String t = s.getType();
        if (t == null) return 2;
        t = t.trim().toLowerCase();
        if ("gate".equals(t)) return 0;
        if ("building".equals(t)) return 1;
        return 2;
    }

    private static int gateNumberOrMax(String name) {
        if (name == null) return Integer.MAX_VALUE;
        Matcher m = GATE_PATTERN.matcher(name);
        if (!m.find()) return Integer.MAX_VALUE;

        String num = m.group(1);
        if (num == null || num.trim().isEmpty()) return Integer.MAX_VALUE;

        try {
            return Integer.parseInt(num);
        } catch (NumberFormatException e) {
            return Integer.MAX_VALUE;
        }
    }

    private static String gateSuffix(String name) {
        if (name == null) return "";
        Matcher m = GATE_PATTERN.matcher(name);
        if (!m.find()) return "";
        String suffix = m.group(2);
        return suffix == null ? "" : suffix.toUpperCase();
    }

    private static final Comparator<Station> STATION_SORT = (a, b) -> {
        int ra = typeRank(a);
        int rb = typeRank(b);
        if (ra != rb) return Integer.compare(ra, rb);

        String an = a.getName() == null ? "" : a.getName().trim();
        String bn = b.getName() == null ? "" : b.getName().trim();

        // Gates: numeric then letter then name
        if (ra == 0) {
            int na = gateNumberOrMax(an);
            int nb = gateNumberOrMax(bn);
            if (na != nb) return Integer.compare(na, nb);

            String sa = gateSuffix(an);
            String sb = gateSuffix(bn);
            int sc = sa.compareTo(sb);
            if (sc != 0) return sc;

            return an.compareToIgnoreCase(bn);
        }

        // Fallback: alphabetical
        return an.compareToIgnoreCase(bn);
    };

    public List<Station> getAllStationsSorted() {
        List<Station> stations = stationRepository.findAll();
        stations.sort(STATION_SORT);
        return stations;
    }

    public List<Station> getStationsByTypeSorted(String type) {
        if (type == null) return java.util.Collections.emptyList();
        List<Station> stations = stationRepository.findAllByStationTypeIgnoreCase(type.trim());
        stations.sort(STATION_SORT);
        return stations;
    }

    public List<Station> getGateStationsSorted() {
        return getStationsByTypeSorted("gate");
    }

    public List<Station> getBuildingStationsSorted() {
        return getStationsByTypeSorted("building");
    }

}
