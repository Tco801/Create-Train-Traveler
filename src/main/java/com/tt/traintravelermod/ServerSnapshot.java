package com.tt.traintravelermod;

import java.util.Collections;
import java.util.List;
import java.util.Map;

public class ServerSnapshot {
    public final List<Map<String, Object>> stations;
    public final List<Map<String, Object>> trains;
    public final List<Map<String, Object>> categories;
    public final List<Map<String, Object>> lines;
    public final long worldTime;

    public ServerSnapshot(
            List<Map<String, Object>> stations,
            List<Map<String, Object>> trains,
            List<Map<String, Object>> categories,
            List<Map<String, Object>> lines,
            long worldTime) {
        this.stations = Collections.unmodifiableList(stations);
        this.trains = Collections.unmodifiableList(trains);
        this.categories = Collections.unmodifiableList(categories);
        this.lines = Collections.unmodifiableList(lines);
        this.worldTime = worldTime;
    }

    public static ServerSnapshot empty() {
        return new ServerSnapshot(
                Collections.emptyList(),
                Collections.emptyList(),
                Collections.emptyList(),
                Collections.emptyList(),
                0L
        );
    }
}