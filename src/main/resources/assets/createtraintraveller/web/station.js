import {
    getTrains,
    getJourney,
    getCategoryInfo,
    getTime,
    minecraftTimeToClock,
    getStationTagName,
    extractPlatform,
    extractSections
} from "./api.js";

const params = new URLSearchParams(window.location.search);
const stationName = params.get("name");

const board = document.getElementById("board") || document.querySelector("tbody");
const mcTimeSpan = document.getElementById("mcTime");
const serverStatusSpan = document.getElementById("serverStatus");
const titleEl = document.getElementById("stationTitle") || document.querySelector("h1");

if (titleEl) {
    titleEl.textContent = stationName
        ? `${stationName} Station`
        : "Station not specified";
}

async function updateClock() {
    try {
        const timeData = await getTime();
        if (timeData && timeData.time !== undefined) {
            if (mcTimeSpan) mcTimeSpan.textContent = `Minecraft time: ${minecraftTimeToClock(timeData.time)}`;
            if (serverStatusSpan) serverStatusSpan.textContent = "🟢 Server Online";
        }
    } catch (err) {
        console.error("Error fetching time:", err);
        if (serverStatusSpan) serverStatusSpan.textContent = "🔴 Server Offline";
    }
}

async function loadBoard() {
    if (!board) return;

    if (!stationName) {
        board.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 20px;">
                    No station selected in URL (e.g. <code>?name=StationName</code>).
                </td>
            </tr>`;
        return;
    }

    try {
        const trainsData = await getTrains();
        const trains = Array.isArray(trainsData) ? trainsData : (trainsData?.trains || []);

        if (trains.length === 0) {
            board.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 20px;">
                        No active trains at the moment.
                    </td>
                </tr>`;
            return;
        }

        const journeyPromises = trains.map(train => {
            const journeyId = train.id ?? train.train_id ?? train.uuid ?? train.train_name;
            if (journeyId === undefined || journeyId === null) return Promise.resolve(null);
            return getJourney(journeyId)
                .then(journey => ({ train, journey }))
                .catch(() => null);
        });

        const results = await Promise.all(journeyPromises);
        const departures = [];
        const targetStationClean = stationName.trim().toLowerCase();

        for (const res of results) {
            if (!res || !res.journey) continue;

            const { train, journey } = res;
            const sections = extractSections(journey);

            for (const section of sections) {
                if (!section.usable || !Array.isArray(section.stops) || section.stops.length === 0) {
                    continue;
                }

                const stops = section.stops;
                const stopIndex = stops.findIndex(s => {
                    const name = getStationTagName(s);
                    return typeof name === "string" && name.trim().toLowerCase() === targetStationClean;
                });

                if (stopIndex === -1 || stopIndex === stops.length - 1) {
                    continue;
                }

                const currentStop = stops[stopIndex];
                const destName = section.destination;

                const nextStops = stops
                    .slice(stopIndex + 1)
                    .map(s => getStationTagName(s))
                    .filter(Boolean);

                const platform = extractPlatform(currentStop, train.next_station);

                const rawTime = currentStop.realtime?.departure
                    ?? currentStop.scheduled?.departure
                    ?? currentStop.realtime?.arrival
                    ?? currentStop.scheduled?.arrival
                    ?? 0;

                departures.push({
                    train,
                    section,
                    destination: destName,
                    nextStops,
                    platform,
                    arrivalTime: rawTime
                });
            }
        }

        departures.sort((a, b) => (Number(a.arrivalTime) || 0) - (Number(b.arrivalTime) || 0));

        if (departures.length === 0) {
            board.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 20px;">
                        No scheduled departures for <strong>${stationName}</strong>.
                    </td>
                </tr>`;
            return;
        }

        const rowsHtml = await Promise.all(departures.map(async (dep) => {
            const trainName = dep.train.train_name || dep.train.name || dep.train.id || "Train";
            const trainIdParam = dep.train.id ?? dep.train.train_id ?? dep.train.uuid ?? trainName;

            const rawCategory = dep.section.category || dep.train.category;
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

            return `
                <tr>
                    <td>${categoryHtml}</td>
                    <td>
                        <a href="train.html?id=${encodeURIComponent(trainIdParam)}&section=${dep.section.index}" style="color: #173252; font-weight: bold; text-decoration: underline;">
                            ${trainName}
                        </a>
                    </td>
                    <td><strong>${dep.destination}</strong></td>
                    <td>${minecraftTimeToClock(dep.arrivalTime)}</td>
                    <td class="stops-preview">${dep.nextStops.join(", ")}</td>
                    <td><strong>${dep.platform}</strong></td>
                </tr>
            `;
        }));

        board.innerHTML = rowsHtml.join("");

    } catch (err) {
        console.error("Error loading board:", err);
        board.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: #dc2626; padding: 20px;">
                    Error fetching data from server.
                </td>
            </tr>`;
    }
}

updateClock();
loadBoard();

setInterval(updateClock, 2000);
setInterval(loadBoard, 10000);