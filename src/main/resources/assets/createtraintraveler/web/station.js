import {
    getTrains,
    getJourney,
    getCategoryInfo,
    minecraftTimeToClock,
    getStationTagName,
    extractPlatform,
    extractSections
} from "./api.js";
import { initGlobalHeader } from "./header-search.js";

initGlobalHeader("station");

const params = new URLSearchParams(window.location.search);
const stationName = params.get("name");

const board = document.getElementById("board");
const titleEl = document.getElementById("stationTitle");

if (titleEl) {
    titleEl.textContent = stationName ? stationName.toUpperCase() : "STATION NOT SPECIFIED";
}

function formatDelayMinutes(scheduledTick, realtimeTick) {
    if (scheduledTick === undefined || scheduledTick === null || realtimeTick === undefined || realtimeTick === null) {
        return { text: "-", isDelayed: false };
    }
    const diffTicks = Number(realtimeTick) - Number(scheduledTick);
    const delayMins = Math.round(diffTicks * 0.06);
    if (delayMins <= 0) {
        return { text: "-", isDelayed: false };
    }
    return { text: `+${delayMins} min`, isDelayed: true };
}

async function loadBoard() {
    if (!board) return;

    if (!stationName) {
        board.innerHTML = `<tr><td colspan="8" style="text-align: center;">No station selected.</td></tr>`;
        return;
    }

    try {
        const trainsData = await getTrains();
        const trains = Array.isArray(trainsData) ? trainsData : (trainsData?.trains || []);

        if (trains.length === 0) {
            board.innerHTML = `<tr><td colspan="8" style="text-align: center;">No active trains at the moment.</td></tr>`;
            return;
        }

        const results = await Promise.all(
            trains.map(train => {
                const journeyId = train.id ?? train.train_id ?? train.uuid ?? train.train_name;
                if (!journeyId) return Promise.resolve(null);
                return getJourney(journeyId).then(journey => ({ train, journey })).catch(() => null);
            })
        );

        const entries = [];
        const targetClean = stationName.trim().toLowerCase();

        for (const res of results) {
            if (!res || !res.journey) continue;
            const { train, journey } = res;
            const sections = extractSections(journey);

            for (const section of sections) {
                if (!section.usable || !Array.isArray(section.stops) || section.stops.length === 0) continue;

                const stops = section.stops;
                const stopIndex = stops.findIndex(s => {
                    const name = getStationTagName(s);
                    return typeof name === "string" && name.trim().toLowerCase() === targetClean;
                });

                if (stopIndex === -1) continue;

                const currentStop = stops[stopIndex];
                const isOrigin = stopIndex === 0;
                const isTerminus = stopIndex === stops.length - 1;

                const schedArr = currentStop.scheduled?.arrival;
                const realArr = currentStop.realtime?.arrival ?? schedArr;
                const schedDep = currentStop.scheduled?.departure;
                const realDep = currentStop.realtime?.departure ?? schedDep;

                const delayInfo = !isTerminus
                    ? formatDelayMinutes(schedDep, realDep)
                    : formatDelayMinutes(schedArr, realArr);

                const nextStops = stops
                    .slice(stopIndex + 1)
                    .map(s => getStationTagName(s))
                    .filter(Boolean);

                const delayReason = train.primary_delay?.reason || train.delays?.[0]?.reason || "";
                const infoParts = [];
                if (nextStops.length > 0) {
                    infoParts.push(`Stops: ${nextStops.join(" - ")}`);
                } else {
                    infoParts.push("Terminal / End of Line");
                }
                if (delayReason) {
                    infoParts.push(`Delay reason: ${delayReason}`);
                }

                entries.push({
                    train,
                    section,
                    destination: section.destination,
                    arrivalText: isOrigin ? "-" : minecraftTimeToClock(realArr),
                    departureText: isTerminus ? "-" : minecraftTimeToClock(realDep),
                    sortTime: Number(realDep ?? realArr ?? 0),
                    delayInfo,
                    infosText: infoParts.join("  |  "),
                    platform: extractPlatform(currentStop, train.next_station)
                });
            }
        }

        entries.sort((a, b) => a.sortTime - b.sortTime);

        if (entries.length === 0) {
            board.innerHTML = `<tr><td colspan="8" style="text-align: center;">No trains scheduled for ${stationName}.</td></tr>`;
            return;
        }

        const rowsHtml = await Promise.all(entries.map(async (item) => {
            const trainName = item.train.train_name || item.train.name || item.train.id || "Train";
            const trainIdParam = item.train.id ?? item.train.train_id ?? item.train.uuid ?? trainName;
            const rawCategory = item.section.category || item.train.category;
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

            const delayCell = item.delayInfo.isDelayed
                ? `<span class="delay-badge">${item.delayInfo.text}</span>`
                : `-`;

            return `
                <tr>
                    <td>
                        <a href="train.html?id=${encodeURIComponent(trainIdParam)}&section=${item.section.index}" class="table-link">
                            ${trainName}
                        </a>
                    </td>
                    <td>${categoryHtml}</td>
                    <td><strong>${item.destination}</strong></td>
                    <td>${item.arrivalText}</td>
                    <td>${item.departureText}</td>
                    <td>${delayCell}</td>
                    <td class="infos-marquee-cell">
                        <div class="marquee-track">${item.infosText}</div>
                    </td>
                    <td><strong>${item.platform}</strong></td>
                </tr>
            `;
        }));

        board.innerHTML = rowsHtml.join("");
    } catch (err) {
        console.error("Error loading board:", err);
        board.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #b91c1c;">Error loading data.</td></tr>`;
    }
}

loadBoard();
setInterval(loadBoard, 10000);