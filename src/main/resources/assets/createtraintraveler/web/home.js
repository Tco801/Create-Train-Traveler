import {
    getTime,
    getStations,
    getTrains,
    getJourney,
    getCategoryInfo,
    minecraftTimeToClock,
    getStationTagName,
    extractSections
} from "./api.js";
import { initGlobalHeader } from "./header-search.js";

initGlobalHeader("home");

const stationsList = document.getElementById("stationList");
const activeTrainsList = document.getElementById("nextDepartures");

function isStationAllowed(st) {
    if (!st || typeof st !== "object") return Boolean(st);
    if (st.blacklisted === true || st.hidden === true || st.ignored === true) return false;
    if (st.usable === false || st.visible === false || st.public === false) return false;
    return true;
}

function renderStations(stations) {
    if (!stationsList) return;

    if (!stations || stations.length === 0) {
        stationsList.innerHTML = `<p style="color: #4b5563;">No stations found.</p>`;
        return;
    }

    stationsList.innerHTML = stations.map(st => {
        const name = getStationTagName(st);
        if (!name) return "";
        return `
            <a href="station.html?name=${encodeURIComponent(name)}" class="station-card">
                <span>${name}</span>
                <span class="arrow">&rarr;</span>
            </a>
        `;
    }).join("");
}

function getNextDepartureTicks(journey, currentWorldTicks) {
    const sections = extractSections(journey);
    const currentSecIdx = journey?.current_section_index ?? 0;
    const activeSection = sections.find(s => s.index === currentSecIdx) || sections[0];
    if (!activeSection || !Array.isArray(activeSection.stops) || activeSection.stops.length === 0) {
        return Number.MAX_SAFE_INTEGER;
    }

    const curStopIdx = Math.max(0, activeSection.currentStopIndex ?? 0);
    const stop = activeSection.stops[curStopIdx] || activeSection.stops[0];
    const dep = stop.realtime?.departure ?? stop.scheduled?.departure ?? stop.realtime?.arrival ?? stop.scheduled?.arrival;
    if (dep === undefined || dep === null) return Number.MAX_SAFE_INTEGER;

    if (typeof currentWorldTicks === "number" && currentWorldTicks > 0) {
        let diff = (dep - currentWorldTicks) % 24000;
        if (diff < 0) diff += 24000;
        return diff;
    }
    return Number(dep);
}

async function renderNextDepartures(enrichedTrains) {
    if (!activeTrainsList) return;

    if (!Array.isArray(enrichedTrains) || enrichedTrains.length === 0) {
        activeTrainsList.innerHTML = `<p style="color: #4b5563;">No trains found.</p>`;
        return;
    }

    // Limita ai prossimi 3 treni a partire
    const topThree = enrichedTrains.slice(0, 3);

    const cardsHtml = await Promise.all(topThree.map(async ({ train, journey }) => {
        const trainName = train.train_name || train.name || train.id || "Train";
        const trainIdParam = train.id ?? train.train_id ?? train.uuid ?? trainName;

        const sections = extractSections(journey);
        const currentSecIdx = journey?.current_section_index ?? 0;
        const activeSection = sections.find(s => s.index === currentSecIdx) || sections[0] || null;

        const rawCategory = activeSection?.category || train.category;
        const categoryInfo = await getCategoryInfo(rawCategory);

        let categoryHtml = "";
        if (categoryInfo && categoryInfo.logo) {
            categoryHtml = `<img src="${categoryInfo.logo}" class="operator-logo" alt="${categoryInfo.name || 'Category'}">`;
        } else {
            const catText = typeof rawCategory === "object" && rawCategory !== null
                ? (rawCategory.name || rawCategory.code || "Train")
                : (rawCategory || "Train");
            const bgColor = (typeof rawCategory === "object" && rawCategory?.color && rawCategory.color !== "#00000000")
                ? rawCategory.color
                : "#b91c1c";
            categoryHtml = `<span class="category-pill" style="background-color: ${bgColor};">${catText}</span>`;
        }

        const originName = activeSection?.origin || "Origine";
        const destName = activeSection?.destination || getStationTagName(train.next_station) || "Destinazione";

        const curStopIdx = Math.max(0, activeSection?.currentStopIndex ?? 0);
        const nextStopObj = activeSection?.stops?.[curStopIdx] || activeSection?.stops?.[0];
        const nextDepRaw = nextStopObj?.realtime?.departure ?? nextStopObj?.scheduled?.departure;
        const depBadge = nextDepRaw !== undefined ? minecraftTimeToClock(nextDepRaw) : "In course";

        let intermediateHtml = "";
        if (activeSection && activeSection.stops.length > 2) {
            const mids = activeSection.stops
                .slice(1, -1)
                .map(s => getStationTagName(s))
                .filter(Boolean);
            if (mids.length > 0) {
                intermediateHtml = `<div class="departure-stops-line"><strong>Intermediate stops:</strong> ${mids.join(" - ")}</div>`;
            }
        }

        return `
            <a href="train.html?id=${encodeURIComponent(trainIdParam)}" class="departure-card">
                <div class="departure-card-top">
                    <div class="departure-train-identity">
                        ${categoryHtml}
                        <span class="departure-train-name">${trainName}</span>
                    </div>
                    <span class="departure-time-badge">${depBadge}</span>
                </div>
                <div class="departure-route-line">
                    ${originName} &rarr; ${destName}
                </div>
                ${intermediateHtml}
            </a>
        `;
    }));

    activeTrainsList.innerHTML = cardsHtml.join("");
}

async function loadHome() {
    try {
        const [stationsData, trainsData, timeData] = await Promise.all([
            getStations(),
            getTrains(),
            getTime().catch(() => null)
        ]);

        const currentWorldTicks = timeData?.time ?? 0;
        const trainsArray = Array.isArray(trainsData) ? trainsData : (trainsData?.trains || []);

        const enrichedTrains = await Promise.all(trainsArray.map(async (train) => {
            const trainId = train.id ?? train.train_id ?? train.uuid ?? train.train_name;
            let journey = null;
            if (trainId !== undefined && trainId !== null) {
                try {
                    journey = await getJourney(trainId);
                } catch {}
            }
            return {
                train,
                journey,
                sortDelta: getNextDepartureTicks(journey, currentWorldTicks)
            };
        }));

        enrichedTrains.sort((a, b) => a.sortDelta - b.sortDelta);

        // Stazioni pubbliche (usando i station tag di CRN ed escludendo quelle in blacklist)
        const servedStationNames = new Set();
        for (const { journey } of enrichedTrains) {
            const sections = extractSections(journey);
            for (const sec of sections) {
                if (!sec.usable) continue;
                sec.stops.forEach(stop => {
                    const name = getStationTagName(stop);
                    if (name) servedStationNames.add(name.trim().toLowerCase());
                });
            }
        }

        const rawStations = Array.isArray(stationsData) ? stationsData : (stationsData?.stations || []);
        const uniqueMap = new Map();

        for (const st of rawStations) {
            if (!isStationAllowed(st)) continue;
            const name = getStationTagName(st);
            if (!name) continue;
            const lowerName = name.trim().toLowerCase();

            if (servedStationNames.size > 0 && !servedStationNames.has(lowerName)) {
                continue;
            }

            if (!uniqueMap.has(lowerName)) {
                uniqueMap.set(lowerName, st);
            }
        }

        const sortedStations = Array.from(uniqueMap.values()).sort((a, b) => {
            const nameA = getStationTagName(a) || "";
            const nameB = getStationTagName(b) || "";
            return nameA.localeCompare(nameB);
        });

        renderStations(sortedStations);
        await renderNextDepartures(enrichedTrains);
    } catch (err) {
        console.error("Error loading Home:", err);
    }
}

loadHome();
setInterval(loadHome, 15000);