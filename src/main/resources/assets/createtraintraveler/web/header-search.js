import { getStations, getTrains, getTime, minecraftTimeToClock, getStationTagName } from "./api.js";

const THEME_STORAGE_KEY = "ctt-theme";

function resolveInitialTheme() {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    const btn = document.getElementById("themeToggleBtn");
    if (btn) {
        btn.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
    }
}

// Applica subito il tema all'import del modulo per evitare flash bianchi
applyTheme(resolveInitialTheme());

export function initGlobalHeader(activePage = "") {
    const currentTheme = resolveInitialTheme();
    const header = document.getElementById("globalHeader");

    if (header) {
        header.innerHTML = `
            <div class="header-left">
                <a href="index.html" class="brand-title">CREATE TRAIN TRAVELER</a>
                <a href="navigate.html" class="plan-route-link ${activePage === "navigate" ? "active" : ""}">PLAN ROUTE</a>
            </div>
            <div class="header-right">
                <button type="button" id="themeToggleBtn" class="theme-toggle-btn" aria-label="Toggle color theme">
                    ${currentTheme === "dark" ? "Light Mode" : "Dark Mode"}
                </button>
                <div class="header-status">
                    <span id="statusDot" class="status-dot"></span>
                    <span id="serverStatus">Server Online</span>
                    <span>|</span>
                    <span id="minecraftTime">--:--</span>
                </div>
                <form id="globalSearchForm" class="global-search-form">
                    <input
                        id="globalSearchInput"
                        type="text"
                        list="globalSearchSuggestions"
                        placeholder="Search train or station..."
                        autocomplete="off"
                    >
                    <datalist id="globalSearchSuggestions"></datalist>
                    <button type="submit">Search</button>
                </form>
            </div>
        `;
    }

    const themeBtn = document.getElementById("themeToggleBtn");
    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const activeTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
            applyTheme(activeTheme === "dark" ? "light" : "dark");
        });
    }

    const footer = document.getElementById("globalFooter");
    if (footer) {
        footer.innerHTML = `
            <div>made by PlayerE464</div>
            <div>Create Train Traveler v0.0.5-beta</div>
        `;
    }

    const mcTimeSpan = document.getElementById("minecraftTime");
    const serverStatusSpan = document.getElementById("serverStatus");
    const statusDot = document.getElementById("statusDot");

    async function updateClock() {
        try {
            const timeData = await getTime();
            if (timeData && timeData.time !== undefined) {
                if (mcTimeSpan) mcTimeSpan.textContent = `MC ${minecraftTimeToClock(timeData.time)}`;
                if (serverStatusSpan) serverStatusSpan.textContent = "Online";
                if (statusDot) statusDot.classList.remove("offline");
            }
        } catch {
            if (serverStatusSpan) serverStatusSpan.textContent = "Offline";
            if (statusDot) statusDot.classList.add("offline");
        }
    }

    updateClock();
    setInterval(updateClock, 2000);

    // Popola suggerimenti ricerca globale e gestisce il redirect diretto a treno o stazione
    const searchInput = document.getElementById("globalSearchInput");
    const searchForm = document.getElementById("globalSearchForm");
    const suggestionsList = document.getElementById("globalSearchSuggestions");

    let cachedStations = [];
    let cachedTrains = [];

    async function loadSearchIndex() {
        try {
            const [stData, trData] = await Promise.all([
                getStations().catch(() => []),
                getTrains().catch(() => [])
            ]);

            const rawStations = Array.isArray(stData) ? stData : (stData?.stations || []);
            const seenStations = new Set();
            cachedStations = [];

            for (const st of rawStations) {
                if (st?.blacklisted === true || st?.hidden === true || st?.usable === false) continue;
                const name = getStationTagName(st);
                if (!name) continue;
                const key = name.trim().toLowerCase();
                if (!seenStations.has(key)) {
                    seenStations.add(key);
                    cachedStations.push(name.trim());
                }
            }

            const rawTrains = Array.isArray(trData) ? trData : (trData?.trains || []);
            cachedTrains = rawTrains.map(t => ({
                id: t.id ?? t.train_id ?? t.uuid ?? t.train_name ?? t.name,
                name: (t.train_name || t.name || String(t.id || "")).trim()
            })).filter(t => t.name);

            if (suggestionsList) {
                const options = [
                    ...cachedStations.map(s => `<option value="${s}">Station</option>`),
                    ...cachedTrains.map(t => `<option value="${t.name}">Train</option>`)
                ];
                suggestionsList.innerHTML = options.join("");
            }
        } catch (err) {
            console.warn("Search index unavailable:", err);
        }
    }

    loadSearchIndex();

    if (searchForm && searchInput) {
        searchForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const query = searchInput.value.trim();
            if (!query) return;

            if (cachedStations.length === 0 && cachedTrains.length === 0) {
                await loadSearchIndex();
            }

            const qLower = query.toLowerCase();

            // 1. Corrispondenza esatta stazione
            const exactStation = cachedStations.find(s => s.toLowerCase() === qLower);
            if (exactStation) {
                window.location.href = `station.html?name=${encodeURIComponent(exactStation)}`;
                return;
            }

            // 2. Corrispondenza esatta treno
            const exactTrain = cachedTrains.find(t => t.name.toLowerCase() === qLower || String(t.id).toLowerCase() === qLower);
            if (exactTrain) {
                window.location.href = `train.html?id=${encodeURIComponent(exactTrain.id)}`;
                return;
            }

            // 3. Corrispondenza parziale
            const partialStation = cachedStations.find(s => s.toLowerCase().includes(qLower));
            if (partialStation) {
                window.location.href = `station.html?name=${encodeURIComponent(partialStation)}`;
                return;
            }

            const partialTrain = cachedTrains.find(t => t.name.toLowerCase().includes(qLower));
            if (partialTrain) {
                window.location.href = `train.html?id=${encodeURIComponent(partialTrain.id)}`;
                return;
            }

            searchInput.style.outline = "2px solid #b91c1c";
            setTimeout(() => { searchInput.style.outline = "none"; }, 1200);
        });
    }
}