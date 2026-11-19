import {
    getStations,
    getTrains,
    getJourney,
    getCategoryInfo,
    minecraftTimeToClock,
    getStationTagName,
    extractPlatform,
    extractSections
} from "./api.js";
import { initGlobalHeader } from "./header-search.js";

initGlobalHeader("navigate");

const fromInput = document.getElementById("fromStation");
const toInput = document.getElementById("toStation");
const swapBtn = document.getElementById("swapBtn");
const stationsDatalist = document.getElementById("stationsList");
const searchForm = document.getElementById("searchForm");
const resultsContainer = document.getElementById("results");

if (swapBtn && fromInput && toInput) {
    swapBtn.addEventListener("click", () => {
        const tmp = fromInput.value;
        fromInput.value = toInput.value;
        toInput.value = tmp;
    });
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
        if (stationsDatalist) {
            stationsDatalist.innerHTML = sortedNames.map(name => `<option value="${name}"></option>`).join("");
        }
    } catch (err) {
        console.error("Error loading stations:", err);
    }
}

function getStopDeparture(stop) {
    return stop.realtime?.departure ?? stop.scheduled?.departure ?? stop.realtime?.arrival ?? stop.scheduled?.arrival ?? 0;
}

function getStopArrival(stop) {
    return stop.realtime?.arrival ?? stop.scheduled?.arrival ?? stop.realtime?.departure ?? stop.scheduled?.departure ?? 0;
}

function getTickDiff(startTick, endTick) {
    let diff = endTick - startTick;
    if (diff < 0) diff = (diff % 24000 + 24000) % 24000;
    return diff;
}

function formatDurationTicks(ticks) {
    const totalMinutes = Math.round(ticks * 0.06);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
}

function getTrainUniqueId(train) {
    return String(train.id ?? train.train_id ?? train.uuid ?? train.train_name ?? train.name ?? "");
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
        : "#b91c1c";
    return `<span class="category-pill" style="background-color: ${bgColor};">${catText}</span>`;
}

async function findRoutes(e) {
    if (e) e.preventDefault();

    const originName = fromInput?.value?.trim();
    const destName = toInput?.value?.trim();

    if (!originName || !destName) return;

    if (originName.toLowerCase() === destName.toLowerCase()) {
        resultsContainer.innerHTML = `<div class="glass-panel">Start and destination cannot be the same.</div>`;
        return;
    }

    resultsContainer.innerHTML = `<div class="glass-panel">Searching for solutions...</div>`;

    try {
        const trains = await getTrains();
        const trainsArray = Array.isArray(trains) ? trains : (trains?.trains || []);

        const journeys = await Promise.all(
            trainsArray.map(async (train) => {
                const id = getTrainUniqueId(train);
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
            for (const sec of extractSections(journey)) {
                if (!sec.usable || sec.stops.length < 2) continue;
                validLegs.push({
                    train,
                    trainId: getTrainUniqueId(train),
                    section: sec,
                    stops: sec.stops
                });
            }
        }

        const originClean = originName.toLowerCase();
        const destClean = destName.toLowerCase();

        // 1. Ricerca treni diretti
        const directSolutions = [];
        const directTrainIds = new Set();

        for (const leg of validLegs) {
            const fromIdx = leg.stops.findIndex(s => (getStationTagName(s) || "").trim().toLowerCase() === originClean);
            const toIdx = leg.stops.findIndex(s => (getStationTagName(s) || "").trim().toLowerCase() === destClean);

            if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
                const startStop = leg.stops[fromIdx];
                const endStop = leg.stops[toIdx];
                const depTime = getStopDeparture(startStop);
                const arrTime = getStopArrival(endStop);
                const intermediateStops = leg.stops
                    .slice(fromIdx + 1, toIdx)
                    .map(s => getStationTagName(s))
                    .filter(Boolean);

                directTrainIds.add(leg.trainId);

                directSolutions.push({
                    transfersCount: 0,
                    depTime,
                    arrTime,
                    duration: getTickDiff(depTime, arrTime),
                    legs: [{
                        train: leg.train,
                        section: leg.section,
                        fromName: getStationTagName(startStop) || originName,
                        toName: getStationTagName(endStop) || destName,
                        depTime,
                        arrTime,
                        depPlatform: extractPlatform(startStop),
                        arrPlatform: extractPlatform(endStop),
                        intermediateStops,
                        waitTicksBefore: 0
                    }]
                });
            }
        }

        directSolutions.sort((a, b) => a.duration - b.duration || a.depTime - b.depTime);

        let finalSolutions = [...directSolutions];

        // 2. Se ci sono MENO di 2 treni diretti, cerca soluzioni fino a massimo 3 cambi (4 tratte)
        // escludendo i treni già presenti tra i diretti
        if (directSolutions.length < 2) {
            const nonDirectLegs = validLegs.filter(leg => !directTrainIds.has(leg.trainId));
            const transferSolutions = [];
            const seenSignatures = new Set();
            const MAX_TRANSFERS = 3; // Massimo 3 cambi = 4 tratte totali

            // Costruisce tutti i segmenti validi (fromIdx -> toIdx) sulle tratte non dirette
            const subSegments = [];
            for (const leg of nonDirectLegs) {
                for (let i = 0; i < leg.stops.length - 1; i++) {
                    const fromSt = getStationTagName(leg.stops[i]);
                    if (!fromSt) continue;
                    for (let j = i + 1; j < leg.stops.length; j++) {
                        const toSt = getStationTagName(leg.stops[j]);
                        if (!toSt || fromSt.toLowerCase() === toSt.toLowerCase()) continue;

                        const depTime = getStopDeparture(leg.stops[i]);
                        const arrTime = getStopArrival(leg.stops[j]);
                        subSegments.push({
                            train: leg.train,
                            trainId: leg.trainId,
                            section: leg.section,
                            fromName: fromSt,
                            fromClean: fromSt.trim().toLowerCase(),
                            toName: toSt,
                            toClean: toSt.trim().toLowerCase(),
                            depTime,
                            arrTime,
                            travelDuration: getTickDiff(depTime, arrTime),
                            depPlatform: extractPlatform(leg.stops[i]),
                            arrPlatform: extractPlatform(leg.stops[j]),
                            intermediateStops: leg.stops.slice(i + 1, j).map(s => getStationTagName(s)).filter(Boolean)
                        });
                    }
                }
            }

            // Indicizza i segmenti per stazione di partenza
            const byOrigin = new Map();
            for (const seg of subSegments) {
                if (!byOrigin.has(seg.fromClean)) byOrigin.set(seg.fromClean, []);
                byOrigin.get(seg.fromClean).push(seg);
            }

            // BFS / esplorazione fino a MAX_TRANSFERS + 1 tratte
            const queue = [];
            for (const firstSeg of (byOrigin.get(originClean) || [])) {
                if (firstSeg.toClean === destClean) continue; // già gestito nei diretti
                queue.push({
                    currentStationClean: firstSeg.toClean,
                    visitedStations: new Set([originClean, firstSeg.toClean]),
                    usedTrainIds: new Set([firstSeg.trainId]),
                    legs: [{ ...firstSeg, waitTicksBefore: 0 }],
                    totalDuration: firstSeg.travelDuration
                });
            }

            while (queue.length > 0) {
                const state = queue.shift();
                const currentTransfers = state.legs.length - 1;
                if (currentTransfers >= MAX_TRANSFERS) continue;

                const lastLeg = state.legs[state.legs.length - 1];
                const nextCandidates = byOrigin.get(state.currentStationClean) || [];

                for (const nextSeg of nextCandidates) {
                    // Evita di riprendere lo stesso treno o tornare in stazioni già visitate
                    if (state.usedTrainIds.has(nextSeg.trainId)) continue;
                    if (state.visitedStations.has(nextSeg.toClean)) continue;

                    const waitTicks = getTickDiff(lastLeg.arrTime, nextSeg.depTime);
                    // Tempo minimo coincidenza: 33 tick (~2 min MC), massimo: 12000 tick (12 ore MC)
                    if (waitTicks < 33 || waitTicks > 12000) continue;

                    const updatedLegs = [...state.legs, { ...nextSeg, waitTicksBefore: waitTicks }];
                    const updatedDuration = state.totalDuration + waitTicks + nextSeg.travelDuration;

                    if (nextSeg.toClean === destClean) {
                        const signature = updatedLegs.map(l => `${l.trainId}:${l.fromClean}->${l.toClean}`).join("|");
                        if (!seenSignatures.has(signature)) {
                            seenSignatures.add(signature);
                            transferSolutions.push({
                                transfersCount: updatedLegs.length - 1,
                                depTime: updatedLegs[0].depTime,
                                arrTime: nextSeg.arrTime,
                                duration: updatedDuration,
                                legs: updatedLegs
                            });
                        }
                    } else if (updatedLegs.length - 1 < MAX_TRANSFERS) {
                        const nextVisited = new Set(state.visitedStations);
                        nextVisited.add(nextSeg.toClean);
                        const nextTrains = new Set(state.usedTrainIds);
                        nextTrains.add(nextSeg.trainId);

                        queue.push({
                            currentStationClean: nextSeg.toClean,
                            visitedStations: nextVisited,
                            usedTrainIds: nextTrains,
                            legs: updatedLegs,
                            totalDuration: updatedDuration
                        });
                    }
                }
            }

            // Ordina per minor numero di cambi e poi per durata totale
            transferSolutions.sort((a, b) => {
                if (a.transfersCount !== b.transfersCount) return a.transfersCount - b.transfersCount;
                return a.duration - b.duration || a.depTime - b.depTime;
            });

            finalSolutions = [...directSolutions, ...transferSolutions.slice(0, 8)];
        }

        if (finalSolutions.length === 0) {
            resultsContainer.innerHTML = `<div class="glass-panel">No solutions found between <strong>${originName}</strong> and <strong>${destName}</strong> (maximum 3 transfers).</div>`;
            return;
        }

        const html = await Promise.all(finalSolutions.map(async (sol) => {
            const isDirect = sol.transfersCount === 0;
            const badgeText = isDirect
                ? "Direct"
                : `${sol.transfersCount} ${sol.transfersCount === 1 ? "Transfer" : "Transfers"}`;
            const badgeBg = isDirect ? "#15803d" : "#b91c1c";

            const legsHtml = await Promise.all(sol.legs.map(async (leg, index) => {
                const trainName = leg.train.train_name || leg.train.name || leg.train.id || "Train";
                const trainIdParam = leg.train.id ?? leg.train.train_id ?? leg.train.uuid ?? trainName;
                const catHtml = await renderCategoryBadge(leg.section.category || leg.train.category);

                const transferNotice = index > 0
                    ? `<div style="margin: 10px 0; padding: 8px 12px; background: rgba(254, 226, 226, 0.85); border: 1px solid #111827; border-radius: 6px; font-size: 0.86rem;">
                         Transfer at <strong>${leg.fromName}</strong> (Waiting for connection: ~${formatDurationTicks(leg.waitTicksBefore)})
                       </div>`
                    : "";

                return `
                    ${transferNotice}
                    <div style="${index > 0 ? 'padding-top: 6px;' : ''}">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                            ${catHtml}
                            <a href="train.html?id=${encodeURIComponent(trainIdParam)}&section=${leg.section.index}" class="table-link">${trainName}</a>
                            <span style="color: #4b5563; font-size: 0.88rem;">(Dir. ${leg.section.destination})</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.96rem;">
                            <div><strong>${minecraftTimeToClock(leg.depTime)}</strong> ${leg.fromName} (Bin. ${leg.depPlatform})</div>
                            <div>&rarr;</div>
                            <div><strong>${minecraftTimeToClock(leg.arrTime)}</strong> ${leg.toName} (Bin. ${leg.arrPlatform})</div>
                        </div>
                        ${leg.intermediateStops.length > 0
                            ? `<div style="margin-top: 6px; font-size: 0.84rem; color: #374151;">Intermediate stops: ${leg.intermediateStops.join(" - ")}</div>`
                            : ``
                        }
                    </div>
                `;
            }));

            return `
                <div class="glass-panel">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #111827;">
                        <div>
                            <strong>${minecraftTimeToClock(sol.depTime)}</strong> &rarr; <strong>${minecraftTimeToClock(sol.arrTime)}</strong>
                            <span style="color: #4b5563; font-size: 0.88rem; margin-left: 8px;">(Total duration: ${formatDurationTicks(sol.duration)})</span>
                        </div>
                        <div>
                            <span class="category-pill" style="background-color: ${badgeBg};">${badgeText}</span>
                        </div>
                    </div>
                    ${legsHtml.join("")}
                </div>
            `;
        }));

        resultsContainer.innerHTML = html.join("");
    } catch (err) {
        console.error("Error calculating route:", err);
        resultsContainer.innerHTML = `<div class="glass-panel" style="color: #b91c1c;">Error occurred while calculating the route.</div>`;
    }
}

if (searchForm) searchForm.addEventListener("submit", findRoutes);
populateStations();