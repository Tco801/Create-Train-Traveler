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
const trainId = params.get("id");
const requestedSection = params.get("section");

const trainNameEl = document.getElementById("trainName");
const trainInfoEl = document.getElementById("trainInfo");
const stopsBody = document.getElementById("stops");
const mcTimeSpan = document.getElementById("mcTime");
const serverStatusSpan = document.getElementById("serverStatus");

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

async function loadTrainDetails() {
    if (!trainId) {
        if (trainNameEl) trainNameEl.textContent = "Train not specified";
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

        const activeSecIdx = requestedSection !== null
            ? Number(requestedSection)
            : (journey?.current_section_index ?? 0);

        const activeSection = sections.find(s => s.index === activeSecIdx) || sections[0] || null;
        const rawCategory = activeSection?.category || trainMeta?.category;
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

        if (trainNameEl) {
            trainNameEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${categoryHtml}
                    <span class="train-header">${trainName}</span>
                </div>
            `;
        }

        if (trainInfoEl) {
            const routeText = activeSection
                ? `${activeSection.origin} → ${activeSection.destination}`
                : "N/A";
            const nextStationText = getStationTagName(trainMeta?.next_station) || "-";
            const statusText = trainMeta?.live_state || trainMeta?.service_state || "IN SERVICE";

            trainInfoEl.innerHTML = `
                <div class="stat-card">
                    <span class="stat-label">Route</span>
                    <div class="stat-value" style="font-size: 1.15rem;">${routeText}</div>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Next Station</span>
                    <div class="stat-value" style="font-size: 1.15rem;">${nextStationText}</div>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Status</span>
                    <div class="stat-value" style="font-size: 1.15rem;">${statusText}</div>
                </div>
            `;
        }

        if (!stopsBody) return;

        if (sections.length === 0) {
            stopsBody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 20px;">
                        No stops available for this train.
                    </td>
                </tr>`;
            return;
        }

        const currentSectionIndex = journey?.current_section_index ?? 0;

        const rowsHtml = sections.map((sec) => {
            const isCurrentSection = sec.index === currentSectionIndex;
            const isNextSection = sec.index > currentSectionIndex;

            let badgeHtml = "";
            if (isCurrentSection) {
                badgeHtml = `<span style="background: #16a34a; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px;">Current Section</span>`;
            } else if (isNextSection) {
                badgeHtml = `<span style="background: #2563eb; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px;">Next Schedule Section</span>`;
            }

            const sectionHeaderRow = `
                <tr style="background: #f1f5f9;">
                    <td colspan="4" style="font-weight: bold; color: #173252;">
                        Section ${sec.index + 1}: ${sec.origin} → ${sec.destination} ${badgeHtml}
                    </td>
                </tr>
            `;

            const stopRows = sec.stops.map((stop, idx) => {
                const stName = getStationTagName(stop) || "Station";
                const platform = extractPlatform(stop);

                const schedArr = stop.scheduled?.arrival;
                const schedDep = stop.scheduled?.departure;
                const realArr = stop.realtime?.arrival ?? schedArr;
                const realDep = stop.realtime?.departure ?? schedDep;

                const isCurrentStop = isCurrentSection && sec.currentStopIndex === idx;
                const isPassed = isCurrentSection && sec.currentStopIndex > idx;

                const rowClass = isCurrentStop ? "current" : (isPassed ? "completed" : "future");

                const arrDisplay = idx === 0 ? "-" : minecraftTimeToClock(realArr);
                const depDisplay = idx === sec.stops.length - 1 ? "-" : minecraftTimeToClock(realDep);

                return `
                    <tr class="${rowClass}">
                        <td>
                            <a href="station.html?name=${encodeURIComponent(stName)}" style="color: #173252; text-decoration: underline;">
                                ${stName}
                            </a>
                            ${isCurrentStop ? " 🚆" : ""}
                        </td>
                        <td><strong>${platform}</strong></td>
                        <td>${arrDisplay}</td>
                        <td>${depDisplay}</td>
                    </tr>
                `;
            }).join("");

            return sectionHeaderRow + stopRows;
        }).join("");

        stopsBody.innerHTML = rowsHtml;

    } catch (err) {
        console.error("Error loading train details:", err);
        if (stopsBody) {
            stopsBody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: #dc2626; padding: 20px;">
                        Error loading train route.
                    </td>
                </tr>`;
        }
    }
}

updateClock();
loadTrainDetails();

setInterval(updateClock, 2000);
setInterval(loadTrainDetails, 10000);