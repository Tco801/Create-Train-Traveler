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

const trainTitle = document.getElementById("trainTitle") || document.querySelector("h1");
const trainHeaderInfo = document.getElementById("trainHeaderInfo");
const stopsContainer = document.getElementById("stopsContainer") || document.getElementById("trainStops");
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
        if (trainTitle) trainTitle.textContent = "Train not specified";
        return;
    }

    try {
        const [trainsData, journey] = await Promise.all([
            getTrains().catch(() => []),
            getJourney(trainId)
        ]);

        const trains = Array.isArray(trainsData) ? trainsData : (trainsData?.trains || []);
        const trainMeta = trains.find(t => String(t.id ?? t.train_id ?? t.uuid ?? t.train_name) === String(trainId));

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

        if (trainTitle) {
            trainTitle.innerHTML = `${categoryHtml} <span>Train ${trainName}</span>`;
        }

        if (trainHeaderInfo && activeSection) {
            trainHeaderInfo.innerHTML = `
                <div style="margin-top: 8px; font-size: 1.05rem;">
                    Current route: <strong>${activeSection.origin}</strong> → <strong>${activeSection.destination}</strong>
                </div>
            `;
        }

        if (!stopsContainer) return;

        if (sections.length === 0) {
            stopsContainer.innerHTML = `<p style="padding: 20px;">No stops available for this train.</p>`;
            return;
        }

        const sectionsHtml = sections.map((sec) => {
            const isCurrentSection = sec.index === (journey?.current_section_index ?? 0);
            const isNextSection = sec.index > (journey?.current_section_index ?? 0);

            let badgeHtml = "";
            if (isCurrentSection) {
                badgeHtml = `<span style="background: #16a34a; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px;">Current Section</span>`;
            } else if (isNextSection) {
                badgeHtml = `<span style="background: #2563eb; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px;">Next Schedule Section</span>`;
            }

            const rows = sec.stops.map((stop, idx) => {
                const stName = getStationTagName(stop) || "Station";
                const platform = extractPlatform(stop);

                const schedArr = stop.scheduled?.arrival;
                const schedDep = stop.scheduled?.departure;
                const realArr = stop.realtime?.arrival ?? schedArr;
                const realDep = stop.realtime?.departure ?? schedDep;

                const isCurrentStop = isCurrentSection && sec.currentStopIndex === idx;
                const isPassed = isCurrentSection && sec.currentStopIndex > idx;

                const rowStyle = isCurrentStop
                    ? "background-color: #fef9c3; font-weight: bold;"
                    : (isPassed ? "opacity: 0.6;" : "");

                const arrDisplay = idx === 0 ? "-" : minecraftTimeToClock(realArr);
                const depDisplay = idx === sec.stops.length - 1 ? "-" : minecraftTimeToClock(realDep);

                return `
                    <tr style="${rowStyle}">
                        <td>
                            <a href="station.html?name=${encodeURIComponent(stName)}" style="color: #173252; text-decoration: underline;">
                                ${stName}
                            </a>
                            ${isCurrentStop ? " 🚆" : ""}
                        </td>
                        <td>${arrDisplay}</td>
                        <td>${depDisplay}</td>
                        <td><strong>${platform}</strong></td>
                    </tr>
                `;
            }).join("");

            return `
                <div class="section-block" style="margin-bottom: 24px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #fff;">
                    <div style="background: #f1f5f9; padding: 12px 16px; border-bottom: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;">
                        <div>
                            <strong>Section ${sec.index + 1}:</strong> ${sec.origin} → ${sec.destination}
                            ${badgeHtml}
                        </div>
                    </div>
                    <table class="board-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th>Station</th>
                                <th>Arrival</th>
                                <th>Departure</th>
                                <th>Platform</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            `;
        }).join("");

        stopsContainer.innerHTML = sectionsHtml;

    } catch (err) {
        console.error("Error loading train details:", err);
        if (stopsContainer) {
            stopsContainer.innerHTML = `<p style="color: #dc2626; padding: 20px;">Error loading train route.</p>`;
        }
    }
}

updateClock();
loadTrainDetails();

setInterval(updateClock, 2000);
setInterval(loadTrainDetails, 10000);