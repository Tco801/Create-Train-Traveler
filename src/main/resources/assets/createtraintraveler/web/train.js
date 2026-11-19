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

initGlobalHeader("train");

const params = new URLSearchParams(window.location.search);
const trainId = params.get("id");
const requestedSection = params.get("section");

const trainNameEl = document.getElementById("trainName");
const nextStationBanner = document.getElementById("nextStationBanner");
const actualSectionSubtitle = document.getElementById("actualSectionSubtitle");
const actualStopsBody = document.getElementById("actualStops");
const nextSectionCard = document.getElementById("nextSectionCard");
const nextSectionSubtitle = document.getElementById("nextSectionSubtitle");
const nextStopsBody = document.getElementById("nextStops");
const connectionsCard = document.getElementById("connectionsCard");
const connectionsTitle = document.getElementById("connectionsTitle");
const connectionsBoard = document.getElementById("connectionsBoard");

function computeDelayMins(schedTick, realTick) {
    if (schedTick === undefined || schedTick === null || realTick === undefined || realTick === null) return 0;
    const mins = Math.round((Number(realTick) - Number(schedTick)) * 0.06);
    return mins > 0 ? mins : 0;
}

function formatTimeCellWithDelay(schedTick, realTick, isEndpointHidden) {
    if (isEndpointHidden) return "-";
    const schedStr = minecraftTimeToClock(schedTick);
    const realStr = minecraftTimeToClock(realTick ?? schedTick);
    const delayMins = computeDelayMins(schedTick, realTick);

    if (delayMins > 0 && schedStr !== realStr) {
        return `
            <div class="time-delayed-block">
                <span class="time-scheduled-label">Scheduled: ${schedStr}</span>
                <span class="time-actual-label">Actual: ${realStr}</span>
            </div>
        `;
    }
    return `<strong>${realStr}</strong>`;
}

async function renderCategoryElement(rawCategory) {
    const categoryInfo = await getCategoryInfo(rawCategory);
    if (categoryInfo && categoryInfo.logo) {
        return `<img src="${categoryInfo.logo}" class="operator-logo" alt="${categoryInfo.name || 'Category'}">`;
    }
    const catText = typeof rawCategory === "object" && rawCategory !== null
        ? (rawCategory.name || rawCategory.code || "Train")
        : (rawCategory || "Train");
    const bgColor = (typeof rawCategory === "object" && rawCategory?.color && rawCategory.color !== "#00000000")
        ? rawCategory.color
        : "#b91c1c";
    return `<span class="category-pill" style="background-color: ${bgColor};">${catText}</span>`;
}

async function loadNextConnections(nextStationName, currentTrainId, minArrivalTick, allTrains) {
    if (!connectionsCard || !connectionsBoard || !nextStationName) return;

    const targetClean = nextStationName.trim().toLowerCase();
    const candidates = [];

    await Promise.all(allTrains.map(async (tr) => {
        const trId = tr.id ?? tr.train_id ?? tr.uuid ?? tr.train_name;
        if (!trId || String(trId) === String(currentTrainId)) return;
        try {
            const j = await getJourney(trId);
            const secs = extractSections(j);
            for (const sec of secs) {
                if (!sec.usable || !sec.stops) continue;
                const idx = sec.stops.findIndex(s => (getStationTagName(s) || "").trim().toLowerCase() === targetClean);
                if (idx === -1 || idx === sec.stops.length - 1) continue;

                const stop = sec.stops[idx];
                const depTick = stop.realtime?.departure ?? stop.scheduled?.departure ?? 0;
                const arrTick = stop.realtime?.arrival ?? stop.scheduled?.arrival;

                let diff = depTick - (minArrivalTick || 0);
                if (diff < 0) diff += 24000;

                const delayMins = computeDelayMins(stop.scheduled?.departure, stop.realtime?.departure);
                const nextStops = sec.stops.slice(idx + 1).map(s => getStationTagName(s)).filter(Boolean);

                candidates.push({
                    train: tr,
                    section: sec,
                    depTick,
                    arrTick,
                    diff,
                    delayMins,
                    infosText: nextStops.length > 0 ? `Stops: ${nextStops.join(" - ")}` : "End of the line",
                    platform: extractPlatform(stop)
                });
            }
        } catch {}
    }));

    candidates.sort((a, b) => a.diff - b.diff);
    const top4 = candidates.slice(0, 4);

    if (top4.length === 0) {
        connectionsCard.style.display = "none";
        return;
    }

    connectionsCard.style.display = "block";
    if (connectionsTitle) {
        connectionsTitle.textContent = `Next 4 Connections at ${nextStationName}`;
    }

    const rows = await Promise.all(top4.map(async (c) => {
        const tName = c.train.train_name || c.train.name || c.train.id || "Train";
        const tIdParam = c.train.id ?? c.train.train_id ?? c.train.uuid ?? tName;
        const catHtml = await renderCategoryElement(c.section.category || c.train.category);
        const delayCell = c.delayMins > 0 ? `<span class="delay-badge">+${c.delayMins} min</span>` : `-`;

        return `
            <tr>
                <td><a href="train.html?id=${encodeURIComponent(tIdParam)}&section=${c.section.index}" class="table-link">${tName}</a></td>
                <td>${catHtml}</td>
                <td><strong>${c.section.destination}</strong></td>
                <td>${c.arrTick !== undefined ? minecraftTimeToClock(c.arrTick) : "-"}</td>
                <td><strong>${minecraftTimeToClock(c.depTick)}</strong></td>
                <td>${delayCell}</td>
                <td class="infos-marquee-cell"><div class="marquee-track">${c.infosText}</div></td>
                <td><strong>${c.platform}</strong></td>
            </tr>
        `;
    }));

    connectionsBoard.innerHTML = rows.join("");
}

async function loadTrainDetails() {
    if (!trainId) {
        if (trainNameEl) trainNameEl.textContent = "Treno non specificato";
        return;
    }

    try {
        const [trainsData, journey] = await Promise.all([
            getTrains().catch(() => []),
            getJourney(trainId)
        ]);

        const trains = Array.isArray(trainsData) ? trainsData : (trainsData?.trains || []);
        const trainMeta = trains.find(t =>
            String(t.id ?? t.train_id ?? t.uuid ?? t.train_name) === String(trainId)
            || String(t.train_name ?? t.name) === String(trainId)
        );

        const trainName = journey?.train_name || trainMeta?.train_name || trainMeta?.name || trainId;
        const sections = extractSections(journey);

        const currentSectionIndex = journey?.current_section_index ?? 0;
        const activeSecIdx = requestedSection !== null ? Number(requestedSection) : currentSectionIndex;
        const actualSection = sections.find(s => s.index === activeSecIdx) || sections[0] || null;
        const nextSection = actualSection ? sections.find(s => s.index === actualSection.index + 1) : null;

        const rawCategory = actualSection?.category || trainMeta?.category;
        const categoryHtml = await renderCategoryElement(rawCategory);
        const catLabel = typeof rawCategory === "object" && rawCategory !== null
            ? (rawCategory.name || rawCategory.code || "")
            : (rawCategory || "");

        if (trainNameEl) {
            trainNameEl.innerHTML = `
                ${categoryHtml}
                <div>
                    <div style="font-size: 1.65rem; font-weight: 800; color: #111827;">${trainName}</div>
                    ${catLabel ? `<div style="font-size: 0.85rem; font-weight: 700; color: #b91c1c; text-transform: uppercase;">${catLabel}</div>` : ""}
                </div>
            `;
        }

        // Banner Next Station
        if (actualSection && Array.isArray(actualSection.stops) && actualSection.stops.length > 0 && nextStationBanner) {
            const nextIdx = Math.min(Math.max(0, actualSection.currentStopIndex ?? 0), actualSection.stops.length - 1);
            const nextStopObj = actualSection.stops[nextIdx];
            const nextStName = getStationTagName(nextStopObj) || getStationTagName(trainMeta?.next_station);
            const nextPlatform = extractPlatform(nextStopObj);
            const nextArr = nextStopObj.realtime?.arrival ?? nextStopObj.scheduled?.arrival;
            const nextDep = nextStopObj.realtime?.departure ?? nextStopObj.scheduled?.departure;

            if (nextStName) {
                nextStationBanner.style.display = "flex";
                nextStationBanner.innerHTML = `
                    <div>
                        <div class="next-station-title">Next Station</div>
                        <div class="next-station-name">${nextStName}</div>
                    </div>
                    <div class="next-station-metrics">
                        <div class="metric-box">
                            <span>Platform</span>
                            <strong>${nextPlatform}</strong>
                        </div>
                        <div class="metric-box">
                            <span>Arrival</span>
                            <strong>${nextArr !== undefined ? minecraftTimeToClock(nextArr) : "-"}</strong>
                        </div>
                        <div class="metric-box">
                            <span>Departure</span>
                            <strong>${nextDep !== undefined ? minecraftTimeToClock(nextDep) : "-"}</strong>
                        </div>
                    </div>
                `;

                loadNextConnections(nextStName, trainId, nextArr ?? nextDep ?? 0, trains);
            }
        }

        // Tabella ACTUAL SECTION
        if (actualSection && actualStopsBody) {
            if (actualSectionSubtitle) {
                actualSectionSubtitle.textContent = `${actualSection.origin} → ${actualSection.destination}`;
            }

            actualStopsBody.innerHTML = actualSection.stops.map((stop, idx) => {
                const stName = getStationTagName(stop) || "Station";
                const platform = extractPlatform(stop);
                const isFirst = idx === 0;
                const isLast = idx === actualSection.stops.length - 1;

                const schedArr = stop.scheduled?.arrival;
                const realArr = stop.realtime?.arrival ?? schedArr;
                const schedDep = stop.scheduled?.departure;
                const realDep = stop.realtime?.departure ?? schedDep;

                const delayMins = !isLast
                    ? computeDelayMins(schedDep, realDep)
                    : computeDelayMins(schedArr, realArr);

                const isCurrentStop = actualSection.index === currentSectionIndex && actualSection.currentStopIndex === idx;
                const isPassed = actualSection.index === currentSectionIndex && actualSection.currentStopIndex > idx;

                let rowClass = "";
                if (isFirst || isLast) {
                    rowClass = "endpoint-row";
                } else if (isCurrentStop) {
                    rowClass = "current-stop-row";
                } else if (isPassed) {
                    rowClass = "passed-stop-row";
                }

                return `
                    <tr class="${rowClass}">
                        <td>
                            <a href="station.html?name=${encodeURIComponent(stName)}" class="table-link">${stName}</a>
                        </td>
                        <td>${formatTimeCellWithDelay(schedArr, realArr, isFirst)}</td>
                        <td>${formatTimeCellWithDelay(schedDep, realDep, isLast)}</td>
                        <td>${delayMins > 0 ? `<span class="delay-badge">+${delayMins} min</span>` : "-"}</td>
                        <td><strong>${platform}</strong></td>
                    </tr>
                `;
            }).join("");
        }

        // Tabella NEXT SECTION (senza ritardo)
        if (nextSection && nextSectionCard && nextStopsBody) {
            nextSectionCard.style.display = "block";
            if (nextSectionSubtitle) {
                nextSectionSubtitle.textContent = `${nextSection.origin} → ${nextSection.destination}`;
            }

            nextStopsBody.innerHTML = nextSection.stops.map((stop, idx) => {
                const stName = getStationTagName(stop) || "Station";
                const platform = extractPlatform(stop);
                const isFirst = idx === 0;
                const isLast = idx === nextSection.stops.length - 1;
                const arrTick = stop.scheduled?.arrival ?? stop.realtime?.arrival;
                const depTick = stop.scheduled?.departure ?? stop.realtime?.departure;

                const rowClass = (isFirst || isLast) ? "endpoint-row" : "";

                return `
                    <tr class="${rowClass}">
                        <td><a href="station.html?name=${encodeURIComponent(stName)}" class="table-link">${stName}</a></td>
                        <td>${isFirst ? "-" : minecraftTimeToClock(arrTick)}</td>
                        <td>${isLast ? "-" : minecraftTimeToClock(depTick)}</td>
                        <td><strong>${platform}</strong></td>
                    </tr>
                `;
            }).join("");
        } else if (nextSectionCard) {
            nextSectionCard.style.display = "none";
        }
    } catch (err) {
        console.error("Error loading train details:", err);
    }
}

loadTrainDetails();
setInterval(loadTrainDetails, 10000);