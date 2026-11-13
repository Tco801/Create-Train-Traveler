
import {
    getStations,
    getTrains,
    getJourney,
    getCategoryInfo,
    getTime,
    minecraftTimeToClock,
    getStationTagName,
    extractPlatform,
    extractSections
} from "./api.js";

const allSelects = document.querySelectorAll("select");
const fromSelect = document.getElementById("fromStation")
    || document.getElementById("originStation")
    || document.getElementById("origin")
    || document.getElementById("from")
    || allSelects[0];

const toSelect = document.getElementById("toStation")
    || document.getElementById("destinationStation")
    || document.getElementById("destination")
    || document.getElementById("to")
    || allSelects[1];

const searchBtn = document.getElementById("searchRouteBtn")
    || document.getElementById("searchBtn")
    || document.getElementById("findRoute")
    || document.querySelector("main button, form button");

const resultsContainer = document.getElementById("routeResults")
    || document.getElementById("results")
    || document.getElementById("routesList")
    || document.getElementById("solutions");

const mcTimeSpan = document.getElementById("mcTime");
const serverStatusSpan = document.getElementById("serverStatus");

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

async function populateStations() {
    try {
        const [stationsData, trainsData] = await Promise.all([
            getStations(),
            getTrains().catch(() => [])
        ]);

        const trainsArray = Array.isArray(trainsData) ? trainsData : (trainsData?.trains || []);
        const servedStationNames = new Set();

        await Promise.all(trainsArray.map(async (train) => {
            const id = train.id ?? train.train_id ?? train.uuid ?? train.train_name;
            if (!id) return;
            try {
                const journey = await getJourney(id);
                extractSections(journey).forEach(sec => {
                    if (!sec.usable) return;
                    sec.stops.forEach(s => {
                        const n = getStationTagName(s);
                        if (n) servedStationNames.add(n.trim().toLowerCase());
                    });
                });
            } catch {}
        }));

        const rawStations = Array.isArray(stationsData) ? stationsData : (stationsData?.stations || []);
        const uniqueNames = new Map();

        rawStations.forEach(st => {
            if (!isStationAllowed(st)) return;
            const name = getStationTagName(st);
            if (!name) return;
            const lower = name.trim().toLowerCase();
            if (servedStationNames.size > 0 && !servedStationNames.has(lower)) return;
            if (!uniqueNames.has(lower)) uniqueNames.set(lower, name);
        });

        const sortedNames = Array.from(uniqueNames.values()).sort((a, b) => a.localeCompare(b));

        const optionsHtml = sortedNames
            .map(name => `<option value="${name}">${name}</option>`)
            .join("");

        if (fromSelect) fromSelect.innerHTML = `<option value="">-- Departure --</option>${optionsHtml}`;
        if (toSelect) toSelect.innerHTML = `<option value="">-- Destination --</option>${optionsHtml}`;
    } catch (err) {
        console.error("Error loading stations:", err);
    }
}

function getStopDeparture(stop) {
    return stop.realtime?.departure
        ?? stop.scheduled?.departure
        ?? stop.realtime?.arrival
        ?? stop.scheduled?.arrival
        ?? 0;
}

function getStopArrival(stop) {
    return stop.realtime?.arrival
        ?? stop.scheduled?.arrival
        ?? stop.realtime?.departure
        ?? stop.scheduled?.departure
        ?? 0;
}

// Calcola la differenza in tick considerando anche l'eventuale passaggio alla giornata successiva (24000 tick = 24h)
function getTickDiff(startTick, endTick) {
    let diff = endTick - startTick;
    if (diff < 0) {
        diff = (diff % 24000 + 24000) % 24000;
    }
    return diff;
}

function formatDurationTicks(ticks) {
    const totalMinutes = Math.round(ticks * 0.06);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins} min`;
}

async function renderCategoryBadge(rawCat) {
    const catInfo = await getCategoryInfo(rawCat);
    if (catInfo && catInfo.logo) {
        return `<img src="${catInfo.logo}" class="operator-logo" alt="${catInfo.name || 'Category'}">`;
    }
    const catText = typeof rawCat === "object" && rawCat !== null
        ? (rawCat.name || rawCat.code || "Train")
        : (rawCat || "Train");
    const bgColor = (typeof rawCat === "object" && rawCat?.color && rawCat.color !== "#00000000")
        ? rawCat.color
        : "#173252";
    return `<span class="category-pill" style="background-color: ${bgColor};">${catText}</span>`;
}

async function findRoutes(e) {
    if (e) e.preventDefault();

    const originName = fromSelect?.value?.trim();
    const destName = toSelect?.value?.trim();

    if (!originName || !destName) {
        if (resultsContainer) resultsContainer.innerHTML = `<p style="padding: 15px;">Please select both departure and destination stations.</p>`;
        return;
    }

    if (originName.toLowerCase() === destName.toLowerCase()) {
        if (resultsContainer) resultsContainer.innerHTML = `<p style="padding: 15px;">Departure and destination stations cannot be the same.</p>`;
        return;
    }

    if (resultsContainer) resultsContainer.innerHTML = `<p style="padding: 15px;">Searching routes...</p>`;

    try {
        const trains = await getTrains();
        const trainsArray = Array.isArray(trains) ? trains : (trains?.trains || []);

        const journeys = await Promise.all(
            trainsArray.map(async (train) => {
                const id = train.id ?? train.train_id ?? train.uuid ?? train.train_name;
                if (!id) return null;
                try {
                    const journey = await getJourney(id);
                    return { train, journey };
                } catch {
                    return null;
                }
            })
        );

        const validLegs = [];
        for (const item of journeys) {
            if (!item || !item.journey) continue;
            const { train, journey } = item;
            const sections = extractSections(journey);

            for (const sec of sections) {
                if (!sec.usable || sec.stops.length < 2) continue;
                validLegs.push({
                    train,
                    section: sec,
                    stops: sec.stops
                });
            }
        }

        const originClean = originName.toLowerCase();
        const destClean = destName.toLowerCase();
        const solutions = [];

        // 1. Ricerca collegamenti diretti
        for (const leg of validLegs) {
            const fromIdx = leg.stops.findIndex(s => (getStationTagName(s) || "").toLowerCase() === originClean);
            const toIdx = leg.stops.findIndex(s => (getStationTagName(s) || "").toLowerCase() === destClean);

            if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
                const startStop = leg.stops[fromIdx];
                const endStop = leg.stops[toIdx];
                const depTime = getStopDeparture(startStop);
                const arrTime = getStopArrival(endStop);
                const intermediateStops = leg.stops
                    .slice(fromIdx + 1, toIdx)
                    .map(s => getStationTagName(s))
                    .filter(Boolean);

                solutions.push({
                    type: "direct",
                    depTime,
                    arrTime,
                    duration: getTickDiff(depTime, arrTime),
                    legs: [{
                        train: leg.train,
                        section: leg.section,
                        fromName: originName,
                        toName: destName,
                        depTime,
                        arrTime,
                        depPlatform: extractPlatform(startStop),
                        arrPlatform: extractPlatform(endStop),
                        intermediateStops
                    }]
                });
            }
        }

        // 2. Ricerca collegamenti con 1 cambio
        const firstLegCandidates = validLegs.filter(leg =>
            leg.stops.some((s, idx) => idx < leg.stops.length - 1 && (getStationTagName(s) || "").toLowerCase() === originClean)
        );

        const secondLegCandidates = validLegs.filter(leg =>
            leg.stops.some((s, idx) => idx > 0 && (getStationTagName(s) || "").toLowerCase() === destClean)
        );

        const seenTransfers = new Set();

        for (const leg1 of firstLegCandidates) {
            const fromIdx1 = leg1.stops.findIndex(s => (getStationTagName(s) || "").toLowerCase() === originClean);
            if (fromIdx1 === -1) continue;

            for (let tIdx1 = fromIdx1 + 1; tIdx1 < leg1.stops.length; tIdx1++) {
                const transferStop1 = leg1.stops[tIdx1];
                const transferName = getStationTagName(transferStop1);
                if (!transferName) continue;

                const transferClean = transferName.toLowerCase();
                if (transferClean === originClean || transferClean === destClean) continue;

                for (const leg2 of secondLegCandidates) {
                    const train1Id = leg1.train.id ?? leg1.train.train_id ?? leg1.train.train_name;
                    const train2Id = leg2.train.id ?? leg2.train.train_id ?? leg2.train.train_name;

                    // Evita cambi inutili sullo stesso identico treno e stessa sezione
                    if (train1Id === train2Id && leg1.section.index === leg2.section.index) continue;

                    const tIdx2 = leg2.stops.findIndex(s => (getStationTagName(s) || "").toLowerCase() === transferClean);
                    const toIdx2 = leg2.stops.findIndex(s => (getStationTagName(s) || "").toLowerCase() === destClean);

                    if (tIdx2 !== -1 && toIdx2 !== -1 && tIdx2 < toIdx2) {
                        const startStop1 = leg1.stops[fromIdx1];
                        const startStop2 = leg2.stops[tIdx2];
                        const endStop2 = leg2.stops[toIdx2];

                        const dep1 = getStopDeparture(startStop1);
                        const arr1 = getStopArrival(transferStop1);
                        const dep2 = getStopDeparture(startStop2);
                        const arr2 = getStopArrival(endStop2);

                        // Calcola tempo di attesa per la coincidenza (accetta fino a mezza giornata Minecraft = 12000 tick)
                        const waitTicks = getTickDiff(arr1, dep2);
                        if (waitTicks > 12000) continue;

                        const routeKey = `${train1Id}-${leg1.section.index}|${transferClean}|${train2Id}-${leg2.section.index}`;
                        if (seenTransfers.has(routeKey)) continue;
                        seenTransfers.add(routeKey);

                        const leg1Duration = getTickDiff(dep1, arr1);
                        const leg2Duration = getTickDiff(dep2, arr2);
                        const totalDuration = leg1Duration + waitTicks + leg2Duration;

                        solutions.push({
                            type: "transfer",
                            depTime: dep1,
                            arrTime: arr2,
                            duration: totalDuration,
                            transferStation: transferName,
                            waitTicks,
                            legs: [
                                {
                                    train: leg1.train,
                                    section: leg1.section,
                                    fromName: originName,
                                    toName: transferName,
                                    depTime: dep1,
                                    arrTime: arr1,
                                    depPlatform: extractPlatform(startStop1),
                                    arrPlatform: extractPlatform(transferStop1),
                                    intermediateStops: leg1.stops.slice(fromIdx1 + 1, tIdx1).map(s => getStationTagName(s)).filter(Boolean)
                                },
                                {
                                    train: leg2.train,
                                    section: leg2.section,
                                    fromName: transferName,
                                    toName: destName,
                                    depTime: dep2,
                                    arrTime: arr2,
                                    depPlatform: extractPlatform(startStop2),
                                    arrPlatform: extractPlatform(endStop2),
                                    intermediateStops: leg2.stops.slice(tIdx2 + 1, toIdx2).map(s => getStationTagName(s)).filter(Boolean)
                                }
                            ]
                        });
                    }
                }
            }
        }

        // Ordina prima i diretti, poi per tempo totale di percorrenza / orario di partenza
        solutions.sort((a, b) => {
            if (a.type !== b.type) return a.type === "direct" ? -1 : 1;
            return a.duration - b.duration || a.depTime - b.depTime;
        });

        if (solutions.length === 0) {
            if (resultsContainer) {
                resultsContainer.innerHTML = `<p style="padding: 15px;">No direct or 1-transfer routes found between <strong>${originName}</strong> and <strong>${destName}</strong>.</p>`;
            }
            return;
        }

        const html = await Promise.all(solutions.map(async (sol) => {
            const isDirect = sol.type === "direct";
            const badgeHtml = isDirect
                ? `<span style="background: #16a34a; color: #fff; padding: 3px 10px; border-radius: 12px; font-size: 0.78rem; font-weight: 600;">Direct</span>`
                : `<span style="background: #d97706; color: #fff; padding: 3px 10px; border-radius: 12px; font-size: 0.78rem; font-weight: 600;">1 Transfer at ${sol.transferStation}</span>`;

            const legsHtml = await Promise.all(sol.legs.map(async (leg, index) => {
                const trainName = leg.train.train_name || leg.train.name || leg.train.id || "Train";
                const trainIdParam = leg.train.id ?? leg.train.train_id ?? leg.train.uuid ?? trainName;
                const rawCat = leg.section.category || leg.train.category;
                const catHtml = await renderCategoryBadge(rawCat);

                const transferNotice = (!isDirect && index === 0)
                    ? `<div style="margin: 10px 0; padding: 8px 12px; background: #fef3c7; border-left: 4px solid #d97706; border-radius: 4px; font-size: 0.88rem; color: #92400e;">
                         🔄 Change train at <strong>${sol.transferStation}</strong> (Wait time: ~${formatDurationTicks(sol.waitTicks)})
                       </div>`
                    : "";

                return `
                    <div class="route-leg" style="${index > 0 ? 'margin-top: 8px; padding-top: 8px;' : ''}">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                            ${catHtml}
                            <a href="train.html?id=${encodeURIComponent(trainIdParam)}&section=${leg.section.index}" style="font-weight: bold; color: #173252; text-decoration: underline;">
                                ${trainName}
                            </a>
                            <span style="color: #64748b; font-size: 0.9rem;">(To ${leg.section.destination})</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 1rem;">
                            <div>
                                <strong>${minecraftTimeToClock(leg.depTime)}</strong> ${leg.fromName} <span style="color: #64748b;">(Plat. ${leg.depPlatform})</span>
                            </div>
                            <div>→</div>
                            <div>
                                <strong>${minecraftTimeToClock(leg.arrTime)}</strong> ${leg.toName} <span style="color: #64748b;">(Plat. ${leg.arrPlatform})</span>
                            </div>
                        </div>
                        ${leg.intermediateStops.length > 0
                            ? `<div style="margin-top: 6px; font-size: 0.85rem; color: #475569;">Intermediate stops: ${leg.intermediateStops.join(", ")}</div>`
                            : `<div style="margin-top: 6px; font-size: 0.85rem; color: #475569;">No intermediate stops</div>`
                        }
                    </div>
                    ${transferNotice}
                `;
            }));

            return `
                <div class="route-card" style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 14px; background: #fff;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0;">
                        <div>
                            <strong>${minecraftTimeToClock(sol.depTime)}</strong> → <strong>${minecraftTimeToClock(sol.arrTime)}</strong>
                            <span style="color: #64748b; font-size: 0.9rem; margin-left: 8px;">(Duration: ${formatDurationTicks(sol.duration)})</span>
                        </div>
                        <div>${badgeHtml}</div>
                    </div>
                    ${legsHtml.join("")}
                </div>
            `;
        }));

        if (resultsContainer) resultsContainer.innerHTML = html.join("");

    } catch (err) {
        console.error("Error calculating route:", err);
        if (resultsContainer) resultsContainer.innerHTML = `<p style="color: #dc2626; padding: 15px;">Error calculating route.</p>`;
    }
}

if (searchBtn) {
    searchBtn.addEventListener("click", findRoutes);
}

const formEl = document.querySelector("form");
if (formEl) {
    formEl.addEventListener("submit", findRoutes);
}

updateClock();
populateStations();
setInterval(updateClock, 2000);