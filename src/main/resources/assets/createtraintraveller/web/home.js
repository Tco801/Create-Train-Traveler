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

const mcTimeSpan = document.getElementById("mcTime");
const serverStatusSpan = document.getElementById("serverStatus");
const dashboardStats = document.getElementById("dashboardStats");
const stationsList = document.getElementById("stationList");
const activeTrainsList = document.getElementById("nextDepartures");
const stationSearch = document.getElementById("stationSearch") || document.getElementById("search");

let allStations = [];

async function updateClock() {
    try {
        const timeData = await getTime();
        if (timeData && timeData.time !== undefined) {
            if (mcTimeSpan) {
                mcTimeSpan.textContent = `Minecraft time: ${minecraftTimeToClock(timeData.time)}`;
            }
            if (serverStatusSpan) {
                serverStatusSpan.textContent = "🟢 Server Online";
            }
        }
    } catch (err) {
        console.error("Error fetching time:", err);
        if (serverStatusSpan) {
            serverStatusSpan.textContent = "🔴 Server Offline";
        }
    }
}

function isStationAllowed(st) {
    if (!st || typeof st !== "object") return Boolean(st);
    if (st.blacklisted === true || st.hidden === true || st.ignored === true) return false;
    if (st.usable === false || st.visible === false || st.public === false) return false;
    return true;
}

function renderStats(stationsCount, trainsCount) {
    if (!dashboardStats) return;

    dashboardStats.innerHTML = `
        <div class="stat-card">
            <span class="stat-value">${stationsCount}</span>
            <span class="stat-label">Active Stations</span>
        </div>
        <div class="stat-card">
            <span class="stat-value">${trainsCount}</span>
            <span class="stat-label">Trains in Service</span>
        </div>
    `;
}

function renderStations(stations) {
    if (!stationsList) return;

    if (!stations || stations.length === 0) {
        stationsList.innerHTML = `<p style="padding: 15px; color: #64748b;">No stations found.</p>`;
        return;
    }

    stationsList.innerHTML = stations.map(st => {
        const name = getStationTagName(st);
        if (!name) return "";
        return `
            <a href="station.html?name=${encodeURIComponent(name)}" class="station-card">
                <span class="station-icon">🚉</span>
                <span class="station-name">${name}</span>
                <span class="arrow">→</span>
            </a>
        `;
    }).join("");
}

async function renderActiveTrains(enrichedTrains) {
    if (!activeTrainsList) return;

    if (!Array.isArray(enrichedTrains) || enrichedTrains.length === 0) {
        activeTrainsList.innerHTML = `<p style="padding: 15px; color: #64748b;">No trains currently in service.</p>`;
        return;
    }

    const cardsHtml = await Promise.all(enrichedTrains.map(async ({ train, journey }) => {
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
                : "#173252";
            categoryHtml = `<span class="category-pill" style="background-color: ${bgColor};">${catText}</span>`;
        }

        const routeTitle = activeSection
            ? `${activeSection.origin} → ${activeSection.destination}`
            : (getStationTagName(train.next_station) ? `To ${getStationTagName(train.next_station)}` : "In service");

        let stopsSummary = "";
        if (activeSection && activeSection.stops.length > 0) {
            const stopNames = activeSection.stops.map(s => getStationTagName(s)).filter(Boolean);
            stopsSummary = `<div class="train-stops-mini"><strong>Stops:</strong> ${stopNames.join(" • ")}</div>`;
        }

        return `
            <a href="train.html?id=${encodeURIComponent(trainIdParam)}" class="departure-card train-card">
                <div class="train-card-header">
                    <div>${categoryHtml}</div>
                    <strong class="train-number">${trainName}</strong>
                </div>
                <div class="train-card-route">
                    ${routeTitle}
                </div>
                ${stopsSummary}
            </a>
        `;
    }));

    activeTrainsList.innerHTML = cardsHtml.join("");
}

async function loadHome() {
    try {
        const [stationsData, trainsData] = await Promise.all([
            getStations(),
            getTrains()
        ]);

        const trainsArray = Array.isArray(trainsData) ? trainsData : (trainsData?.trains || []);
        const enrichedTrains = await Promise.all(trainsArray.map(async (train) => {
            const trainId = train.id ?? train.train_id ?? train.uuid ?? train.train_name;
            let journey = null;
            if (trainId !== undefined && trainId !== null) {
                try {
                    journey = await getJourney(trainId);
                } catch (e) {
                    console.warn(`Journey unavailable for ${trainId}:`, e);
                }
            }
            return { train, journey };
        }));

        // Raccoglie i nomi delle stazioni effettivamente servite da sezioni utilizzabili (esclude blacklist/depositi)
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

            // Se ci sono treni attivi, filtra via le stazioni blacklistate non presenti in nessuna sezione usabile
            if (servedStationNames.size > 0 && !servedStationNames.has(lowerName)) {
                continue;
            }

            if (!uniqueMap.has(lowerName)) {
                uniqueMap.set(lowerName, st);
            }
        }

        allStations = Array.from(uniqueMap.values()).sort((a, b) => {
            const nameA = getStationTagName(a) || "";
            const nameB = getStationTagName(b) || "";
            return nameA.localeCompare(nameB);
        });

        renderStats(allStations.length, trainsArray.length);
        renderStations(allStations);
        await renderActiveTrains(enrichedTrains);
    } catch (err) {
        console.error("Error loading Home:", err);
    }
}

if (stationSearch) {
    stationSearch.addEventListener("input", (e) => {
        const term = e.target.value.trim().toLowerCase();
        if (!term) {
            renderStations(allStations);
            return;
        }
        const filtered = allStations.filter(st => {
            const name = getStationTagName(st) || "";
            return name.toLowerCase().includes(term);
        });
        renderStations(filtered);
    });
}

updateClock();
loadHome();

setInterval(updateClock, 2000);
setInterval(loadHome, 15000);