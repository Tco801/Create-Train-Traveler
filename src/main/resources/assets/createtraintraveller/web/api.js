const API_BASE = `${window.location.origin}/crn/api/v1`;

export async function apiFetch(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) {
        throw new Error(`Errore HTTP ${res.status} su ${endpoint}`);
    }
    return await res.json();
}

export function getTime() {
    return apiFetch("/time");
}

export function getStations() {
    return apiFetch("/stations");
}

export function getTrains() {
    return apiFetch("/trains");
}

export function getJourney(trainId) {
    return apiFetch(`/train/${encodeURIComponent(trainId)}/journey`);
}

let cachedCategories = null;

export async function getCategoryInfo(categoryInput) {
    if (!cachedCategories) {
        try {
            const res = await fetch("categories.json");
            if (res.ok) {
                cachedCategories = await res.json();
            } else {
                cachedCategories = {};
            }
        } catch (e) {
            console.warn("Impossibile caricare categories.json:", e);
            cachedCategories = {};
        }
    }

    if (!categoryInput) return null;

    const searchKey = typeof categoryInput === "object"
        ? (categoryInput.name || categoryInput.id || categoryInput.code || "")
        : String(categoryInput);

    if (!searchKey) return null;

    if (cachedCategories[searchKey]) {
        return cachedCategories[searchKey];
    }

    const lowerKey = searchKey.trim().toLowerCase();
    for (const [key, val] of Object.entries(cachedCategories)) {
        if (key.toLowerCase() === lowerKey || (val.name && val.name.toLowerCase() === lowerKey)) {
            return val;
        }
    }

    return null;
}

export function minecraftTimeToClock(time) {
    if (time === undefined || time === null) return "--:--";

    if (typeof time === "string" && time.includes(":")) {
        return time;
    }

    let numTime = Number(time);
    if (isNaN(numTime)) return "--:--";

    if (numTime < 0) {
        numTime = (numTime % 24000 + 24000) % 24000;
    }

    let totalMinutes = Math.floor(numTime * 0.06);
    totalMinutes = (totalMinutes % 1440 + 1440) % 1440;

    let hours = (Math.floor(totalMinutes / 60) + 6) % 24;
    const minutes = totalMinutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getStationTagName(stationObj) {
    if (!stationObj) return null;
    if (typeof stationObj === "string") return stationObj;
    return stationObj.tag_name
        || stationObj.name
        || stationObj.scheduled_station?.tag_name
        || stationObj.scheduled_station?.name
        || stationObj.station?.tag_name
        || stationObj.station?.name
        || null;
}

export function extractPlatform(stopObj, fallbackObj = null) {
    if (stopObj) {
        if (stopObj.info?.platform) return stopObj.info.platform;
        if (stopObj.platform) return stopObj.platform;
        if (stopObj.scheduled_station?.info?.platform) return stopObj.scheduled_station.info.platform;
        if (stopObj.station?.info?.platform) return stopObj.station.info.platform;
        if (stopObj.station?.platform) return stopObj.station.platform;
    }
    if (fallbackObj) {
        if (fallbackObj.info?.platform) return fallbackObj.info.platform;
        if (fallbackObj.platform) return fallbackObj.platform;
    }
    return "-";
}

export function extractSections(journey) {
    if (!journey) return [];

    if (Array.isArray(journey.sections) && journey.sections.length > 0) {
        return journey.sections.map((sec, idx) => {
            const stops = Array.isArray(sec.stops) ? sec.stops : [];
            const origin = getStationTagName(sec.origin) || (stops.length > 0 ? getStationTagName(stops[0]) : "Origine");
            const destination = getStationTagName(sec.destination) || (stops.length > 0 ? getStationTagName(stops[stops.length - 1]) : "Destinazione");

            return {
                index: sec.index ?? idx,
                category: sec.category || null,
                line: sec.line || null,
                origin,
                destination,
                stops,
                currentStopIndex: sec.current_stop_index ?? -1,
                usable: sec.usable !== false
            };
        });
    }

    const fallbackStops = Array.isArray(journey) ? journey : (journey.stops || []);
    if (fallbackStops.length === 0) return [];

    return [{
        index: 0,
        category: journey.category || null,
        line: journey.line || null,
        origin: getStationTagName(fallbackStops[0]) || "Origine",
        destination: getStationTagName(fallbackStops[fallbackStops.length - 1]) || "Destinazione",
        stops: fallbackStops,
        currentStopIndex: journey.current_stop_index ?? -1,
        usable: true
    }];
}