// ════════════════════════════════════════════════════
//  Smart Queue — Multi-Window Simulation Script
// ════════════════════════════════════════════════════

const API = "http://localhost:5000";

// ── State ──────────────────────────────────────────
let windowsData = [];
let servedData = [];
let statsData = {};
let mode = "manual";        // "manual" | "auto"
let paused = false;
let speed = 1;
let algorithm = "fifo";     // "fifo" | "priority" | "sjf"
let isVIP = false;
let simSeconds = 0;
let notifiedQueue2nd = new Set(); // track ETA alerts already sent
let switchSuggested  = new Set(); // track customer IDs we already toast-suggested switching
let lastSwitchAt     = 0;         // timestamp of last executed switch
const SWITCH_COOLDOWN_MS = 20000; // 20s cooldown between auto-switches
const SWITCH_THRESHOLD_S = 60;    // only switch if wait difference > 60s

// Per-window countdown state (client-side)
let windowCountdowns = { 1: 0, 2: 0, 3: 0 };
let windowBusy = { 1: false, 2: false, 3: false };
let lastCurrentId = { 1: null, 2: null, 3: null };

// ── Timers ─────────────────────────────────────────
let mainInterval = null;   // polling
let tickInterval = null;   // countdown ticker
let clockInterval = null;  // sim clock

const BASE_POLL_MS = 3000;
const BASE_TICK_MS = 1000;

function startTimers() {
    clearInterval(mainInterval);
    clearInterval(tickInterval);
    clearInterval(clockInterval);

    // If speed is 5x, poll every 600ms instead of 3000ms
    const pollMs  = Math.max(500, BASE_POLL_MS / speed);
    // If speed is 5x, tick every 200ms instead of 1000ms
    const tickMs  = Math.max(100, BASE_TICK_MS / speed);

    mainInterval  = setInterval(fetchAll, pollMs);
    tickInterval  = setInterval(tick, tickMs);
    // The clock should tick at the exact same sped-up rate
    clockInterval = setInterval(tickClock, tickMs);
}

// ════════════════════════════════════════════════════
//  FETCH & RENDER
// ════════════════════════════════════════════════════
async function fetchAll() {
    try {
        const [winRes, servRes, statRes] = await Promise.all([
            fetch(API + "/windows"),
            fetch(API + "/served"),
            fetch(API + "/stats")
        ]);
        if (!winRes.ok) throw new Error("Failed to fetch");

        const newWindows = await winRes.json();
        const newServed  = await servRes.json();
        const newStats   = await statRes.json();

        showErrorOverlay(false);

        if (JSON.stringify(newWindows) !== JSON.stringify(windowsData)) {
            windowsData = newWindows;
            renderWindows();
            runAlgoComparison();
            checkForSwitch();
            checkETA();
        }
        if (JSON.stringify(newServed) !== JSON.stringify(servedData)) {
            servedData = newServed;
            renderHistory();
        }
        if (JSON.stringify(newStats) !== JSON.stringify(statsData)) {
            statsData = newStats;
            renderStats();
        }
    } catch (err) {
        if (err.message.includes("fetch")) showErrorOverlay(true);
    }
}

// ── Windows ───────────────────────────────────────
function renderWindows() {
    const grid = document.getElementById("windowsGrid");

    // Total waiting count
    let totalWaiting = 0;
    windowsData.forEach(w => totalWaiting += w.queue_length);
    document.getElementById("statWaiting").textContent = totalWaiting;

    windowsData.forEach(win => {
        const wid = win.window_id;
        const current = win.current;
        const queue = win.queue || [];

        // On new customer at window, reset countdown
        if (current && current.id !== lastCurrentId[wid]) {
            lastCurrentId[wid] = current.id;
            windowCountdowns[wid] = current.order_time;
            windowBusy[wid] = true;
        } else if (!current) {
            lastCurrentId[wid] = null;
            windowCountdowns[wid] = 0;
            windowBusy[wid] = false;
        }

        let card = document.getElementById(`window-card-${wid}`);
        if (!card) {
            card = document.createElement("div");
            card.className = "window-card";
            card.id = `window-card-${wid}`;
            grid.appendChild(card);
        }

        const isIdle = !current;
        const statusClass = isIdle ? "idle" : (win.queue_length > 5 ? "busy-full" : "busy");
        const statusText  = isIdle ? "IDLE" : (win.queue_length > 5 ? "FULL" : "SERVING");

        const countdown = windowCountdowns[wid];
        const pct = current ? Math.max(0, countdown / current.order_time) : 0;
        const circumference = 2 * Math.PI * 28; // r=28
        const dashOffset = circumference * (1 - pct);

        const serveBtn = mode === "manual"
            ? `<button class="btn-serve" onclick="serveWindow(${wid})" ${isIdle ? 'disabled' : ''}>Serve Next</button>`
            : '';

        // Sort queue for rendering based on selected algorithm
        const sortedQueue = sortQueueByAlgo([...queue]);

        card.innerHTML = `
            <div class="window-header">
                <div class="window-name">
                    <span class="window-num">W${wid}</span>
                    <span class="window-label">Window ${wid}</span>
                </div>
                <span class="window-status ${statusClass}">${statusText}</span>
            </div>

            <div class="window-body">
                <div class="countdown-ring ${isIdle ? 'idle' : ''}">
                    <svg viewBox="0 0 64 64" class="ring-svg">
                        <circle cx="32" cy="32" r="28" class="ring-bg"/>
                        <circle cx="32" cy="32" r="28" class="ring-fill"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${dashOffset}"
                            style="transition: stroke-dashoffset 0.9s linear;"/>
                    </svg>
                    <div class="ring-center">
                        ${current
                            ? `<span class="ring-time">${formatTime(countdown)}</span>
                               <span class="ring-sub">left</span>`
                            : `<span class="ring-idle">💤</span>`
                        }
                    </div>
                </div>

                ${current ? `
                <div class="current-customer">
                    <span class="now-serving">Now Serving</span>
                    <div class="customer-chip ${current.priority === 'vip' ? 'vip' : ''}">
                        ${current.priority === 'vip' ? '⭐ ' : ''}${escapeHTML(current.name)}
                        <span class="chip-service">${escapeHTML(current.service)}</span>
                    </div>
                </div>` : '<div class="no-customer">No active customer</div>'}
            </div>

            ${serveBtn}

            <div class="window-queue">
                <div class="queue-header">
                    <span>Queue</span>
                    <span class="queue-count">${win.queue_length} customer${win.queue_length !== 1 ? 's' : ''}</span>
                </div>
                <ul class="queue-list">
                    ${sortedQueue.length === 0
                        ? '<li class="queue-empty">Empty</li>'
                        : sortedQueue.map((c, i) => `
                            <li class="queue-item ${c.priority === 'vip' ? 'vip-item' : ''}">
                                <span class="q-pos">${i + 1}</span>
                                <span class="q-name">${c.priority === 'vip' ? '⭐ ' : ''}${escapeHTML(c.name)}</span>
                                <span class="q-wait">${formatTime(estimateWaitInLine(sortedQueue, i))}</span>
                                <button class="q-switch" title="Switch to shorter queue" onclick="switchCustomer(${c.id})">⇄</button>
                            </li>`).join('')
                    }
                </ul>
            </div>

            <div class="window-total-wait">
                Estimated total wait: <strong>${formatTime(win.total_wait)}</strong>
            </div>
        `;
    });
}

function estimateWaitInLine(queue, index) {
    return queue.slice(0, index).reduce((s, c) => s + c.order_time, 0);
}

function sortQueueByAlgo(queue) {
    // Separate into VIP and Normal groups first since VIPs ALWAYS map to the front of the line
    const vips = queue.filter(c => c.priority === 'vip');
    const normals = queue.filter(c => c.priority !== 'vip');

    const sortByAlgo = (list) => {
        if (algorithm === "fifo" || algorithm === "priority") {
            return list.sort((a, b) => a.id - b.id);
        } else if (algorithm === "sjf") {
            return list.sort((a, b) => a.order_time - b.order_time);
        }
        return list;
    };

    return [...sortByAlgo(vips), ...sortByAlgo(normals)];
}

// ── History ───────────────────────────────────────
function renderHistory() {
    const list = document.getElementById("historyList");
    let servedCount = 0, abandonedCount = 0;

    if (servedData.length === 0) {
        list.innerHTML = '<div class="empty-state">No service history yet.</div>';
        document.getElementById("histServedCount").textContent = 0;
        document.getElementById("histAbandonedCount").textContent = 0;
        return;
    }

    list.innerHTML = servedData.map(c => {
        const isAbandoned = c.status === "abandoned";
        if (isAbandoned) abandonedCount++; else servedCount++;
        const duration = c.served_at && c.created_at
            ? formatTime(Math.round((new Date(c.served_at) - new Date(c.created_at)) / 1000))
            : "—";
        return `<div class="history-item ${isAbandoned ? 'abandoned' : 'served'}">
            <div class="hist-left">
                <span class="hist-id">#${c.id}</span>
                <span class="hist-name">${c.priority === 'vip' ? '⭐ ' : ''}${escapeHTML(c.name)}</span>
                <span class="hist-service">${escapeHTML(c.service)}</span>
            </div>
            <div class="hist-right">
                <span class="hist-window">W${c.window_id || '?'}</span>
                ${isAbandoned
                    ? '<span class="hist-status abandoned-badge-sm">Abandoned</span>'
                    : `<span class="hist-duration">${duration}</span>`}
            </div>
        </div>`;
    }).join('');

    document.getElementById("histServedCount").textContent = servedCount;
    document.getElementById("histAbandonedCount").textContent = abandonedCount;
}

// ── Stats ─────────────────────────────────────────
function renderStats() {
    document.getElementById("statServed").textContent = statsData.total_served || 0;
    document.getElementById("statAbandoned").textContent = statsData.total_abandoned || 0;

    const avg = statsData.avg_wait_seconds || 0;
    document.getElementById("statAvgWait").textContent = avg ? formatTime(Math.round(avg)) : "0s";

    const byWindow = statsData.by_window || [];
    if (byWindow.length > 0) {
        const busiest = byWindow.reduce((a, b) => (parseInt(a.served_count) > parseInt(b.served_count) ? a : b));
        document.getElementById("statBusiest").textContent = `Window ${busiest.window_id} (${busiest.served_count})`;
    } else {
        document.getElementById("statBusiest").textContent = "—";
    }
}

// ════════════════════════════════════════════════════
//  ACTIONS
// ════════════════════════════════════════════════════

async function addCustomer() {
    const nameInput = document.getElementById("name");
    const service = document.getElementById("service").value;
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    try {
        const res = await fetch(API + "/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, service, priority: isVIP ? 'vip' : 'normal' })
        });
        const data = await res.json();
        nameInput.value = "";
        const savingsText = data.estimated_wait > 0 ? `, ~${formatTime(data.estimated_wait)} wait` : '';
        showToast(`${isVIP ? '⭐ VIP' : '👤'} ${name} → Window ${data.assigned_window}${savingsText}`, "info");
        fetchAll();
    } catch (err) { console.error(err); }
}

async function serveWindow(windowId) {
    try {
        await fetch(API + `/serve/${windowId}`, { method: "POST" });
        fetchAll();
    } catch (err) { console.error(err); }
}

async function switchCustomer(customerId) {
    try {
        const res = await fetch(API + `/switch/${customerId}`, { method: "POST" });
        const data = await res.json();
        if (data.switched) {
            // Set cooldown BEFORE fetching to prevent immediate re-trigger
            lastSwitchAt = Date.now();
            switchSuggested.delete(customerId); // allow re-suggestion after cooldown if still needed
            showToast(`↩ Moved Window ${data.from} → Window ${data.to} (saves ~${formatTime((data.from_wait || 0) - data.new_wait)})`, "success");
            fetchAll();
        } else {
            showToast("Already in optimal queue!", "info");
        }
    } catch (err) { console.error(err); }
}

async function resetDatabase() {
    if (!confirm("Reset all queues and history?")) return;
    try {
        await fetch(API + "/reset", { method: "POST" });
        Object.keys(lastCurrentId).forEach(k => lastCurrentId[k] = null);
        Object.keys(windowCountdowns).forEach(k => windowCountdowns[k] = 0);
        notifiedQueue2nd.clear();
        switchSuggested.clear();
        lastSwitchAt = 0;
        simSeconds = 0;
        fetchAll();
        showToast("Database reset!", "danger");
    } catch (err) { console.error(err); }
}

async function abandonStale() {
    const threshold = parseInt(document.getElementById("abandonThreshold").value) || 180;
    try {
        const res = await fetch(API + "/abandon", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ threshold_seconds: threshold })
        });
        const data = await res.json();
        if (data.count > 0) {
            showToast(`🚶 ${data.count} customer(s) abandoned the queue`, "warning");
            fetchAll();
        }
    } catch (err) { console.error(err); }
}

// ════════════════════════════════════════════════════
//  SIMULATION TICK
// ════════════════════════════════════════════════════
function tick() {
    if (paused) return;

    // The tick runs faster based on `speed`, so we always subtract 1 "simulation second" per tick
    for (const wid of [1, 2, 3]) {
        if (windowBusy[wid] && windowCountdowns[wid] > 0) {
            windowCountdowns[wid] = Math.max(0, windowCountdowns[wid] - 1);
        }

        // Auto mode: if countdown hits 0 and window is busy, serve next
        if (mode === "auto" && windowBusy[wid] && windowCountdowns[wid] <= 0) {
            serveWindow(wid);
        }
    }

    // Re-render countdown rings without full re-render
    updateCountdownRings();

    // Abandon check every 5 *simulation* seconds
    simSeconds++;
    if (simSeconds % 5 === 0 && mode === "auto") {
        abandonStale();
    }
}

function updateCountdownRings() {
    for (const wid of [1, 2, 3]) {
        const card = document.getElementById(`window-card-${wid}`);
        if (!card) continue;
        const current = windowsData.find(w => w.window_id === wid)?.current;
        if (!current) continue;

        const circumference = 2 * Math.PI * 28;
        const pct = Math.max(0, windowCountdowns[wid] / current.order_time);
        const dashOffset = circumference * (1 - pct);

        const ringFill = card.querySelector(".ring-fill");
        const ringTime = card.querySelector(".ring-time");
        if (ringFill) ringFill.style.strokeDashoffset = dashOffset;
        if (ringTime) ringTime.textContent = formatTime(Math.ceil(windowCountdowns[wid]));
    }
}

function tickClock() {
    if (paused) return;
    const mins = String(Math.floor(simSeconds / 60)).padStart(2, "0");
    const secs = String(simSeconds % 60).padStart(2, "0");
    document.getElementById("simClock").textContent = `${mins}:${secs}`;
}

// ════════════════════════════════════════════════════
//  SMART CHECKS
// ════════════════════════════════════════════════════

function checkForSwitch() {
    if (windowsData.length < 2) return;

    // Enforce cooldown — prevents oscillation between windows
    if (Date.now() - lastSwitchAt < SWITCH_COOLDOWN_MS) return;

    const waits = windowsData.map(w => w.total_wait);
    const maxWait = Math.max(...waits);
    const minWait = Math.min(...waits);

    // Only act on a meaningful imbalance
    if (maxWait - minWait <= SWITCH_THRESHOLD_S) return;

    const overloadedWin = windowsData.find(w => w.total_wait === maxWait);
    const lastNormal = [...(overloadedWin?.queue || [])]
        .filter(c => c.priority !== 'vip')
        .pop();

    if (!lastNormal) return;

    if (mode === "auto") {
        // Auto mode: switch immediately and set cooldown
        switchCustomer(lastNormal.id);
    } else {
        // Manual mode: only show toast once per customer suggestion
        if (!switchSuggested.has(lastNormal.id)) {
            switchSuggested.add(lastNormal.id);
            showToast(
                `💡 Imbalance: move "${lastNormal.name}" from Window ${overloadedWin.window_id} → shorter queue (saves ~${formatTime(maxWait - minWait)})`,
                "warning"
            );
        }
    }
}

function checkETA() {
    windowsData.forEach(win => {
        const sortedQ = sortQueueByAlgo([...win.queue]);
        if (sortedQ.length >= 1 && sortedQ[0]) {
            const secondUp = sortedQ[0]; // first in queue (0-indexed after current)
            if (!notifiedQueue2nd.has(secondUp.id)) {
                notifiedQueue2nd.add(secondUp.id);
                showToast(`🔔 ${secondUp.priority === 'vip' ? '⭐ ' : ''}${escapeHTML(secondUp.name)} is up next at Window ${win.window_id}!`, "eta");
            }
        }
    });
}

// ════════════════════════════════════════════════════
//  ALGORITHM COMPARISON
// ════════════════════════════════════════════════════
function runAlgoComparison() {
    const allQueue = windowsData.flatMap(w => w.queue || []);
    if (allQueue.length === 0) {
        ["FIFO", "Priority", "SJF"].forEach(a => {
            const key = a.toLowerCase().replace("priority", "prio");
            const el = document.getElementById(`${key === "prio" ? "prio" : key}Wait`);
            const elN = document.getElementById(`${key === "prio" ? "prio" : key}Next`);
            if (el) el.textContent = "—";
            if (elN) elN.textContent = "—";
        });
        return;
    }

    // FIFO
    const fifo = [...allQueue].sort((a, b) => a.id - b.id);
    const fifoAvg = fifo.length ? Math.round(fifo.reduce((s, c, i) => s + fifo.slice(0, i).reduce((ss, cc) => ss + cc.order_time, 0), 0) / fifo.length) : 0;
    document.getElementById("fifoWait").textContent = formatTime(fifoAvg);
    document.getElementById("fifoNext").textContent = fifo[0] ? escapeHTML(fifo[0].name.split(" ")[0]) : "—";

    // Priority
    const prio = [...allQueue].sort((a, b) => {
        if (a.priority === b.priority) return a.id - b.id;
        return a.priority === "vip" ? -1 : 1;
    });
    const prioAvg = prio.length ? Math.round(prio.reduce((s, c, i) => s + prio.slice(0, i).reduce((ss, cc) => ss + cc.order_time, 0), 0) / prio.length) : 0;
    document.getElementById("prioWait").textContent = formatTime(prioAvg);
    document.getElementById("prioNext").textContent = prio[0] ? escapeHTML(prio[0].name.split(" ")[0]) : "—";

    // SJF
    const sjf = [...allQueue].sort((a, b) => a.order_time - b.order_time);
    const sjfAvg = sjf.length ? Math.round(sjf.reduce((s, c, i) => s + sjf.slice(0, i).reduce((ss, cc) => ss + cc.order_time, 0), 0) / sjf.length) : 0;
    document.getElementById("sjfWait").textContent = formatTime(sjfAvg);
    document.getElementById("sjfNext").textContent = sjf[0] ? escapeHTML(sjf[0].name.split(" ")[0]) : "—";
}

// ════════════════════════════════════════════════════
//  CONTROLS
// ════════════════════════════════════════════════════
function setMode(m) {
    mode = m;
    document.getElementById("modeManual").classList.toggle("active", m === "manual");
    document.getElementById("modeAuto").classList.toggle("active", m === "auto");
    renderWindows();
    showToast(`Mode: ${m === "auto" ? "🤖 Auto" : "🖐 Manual"}`, "info");
}

function setSpeed(s) {
    speed = s;
    document.querySelectorAll(".speed-btn").forEach(b => {
        b.classList.toggle("active", parseInt(b.dataset.speed) === s);
    });
    startTimers();
    showToast(`Speed: ${s}×`, "info");
}

function setAlgorithm(algo) {
    algorithm = algo;
    const labels = { fifo: "FIFO", priority: "Priority", sjf: "SJF" };
    document.getElementById("algoBadge").textContent = labels[algo];
    document.querySelectorAll(".algo-row").forEach(r => r.classList.remove("active-algo"));
    const map = { fifo: "algoFIFO", priority: "algoPriority", sjf: "algoSJF" };
    document.getElementById(map[algo])?.classList.add("active-algo");
    renderWindows();
    showToast(`Algorithm: ${labels[algo]}`, "info");
}

function togglePause() {
    paused = !paused;
    const btn = document.getElementById("pauseBtn");
    const dot = document.getElementById("clockDot");
    const label = document.getElementById("clockLabel");
    btn.textContent = paused ? "▶ Resume" : "⏸ Pause";
    btn.classList.toggle("paused", paused);
    dot.classList.toggle("paused", paused);
    label.textContent = paused ? "PAUSED" : "RUNNING";
    showToast(paused ? "⏸ Simulation paused" : "▶ Simulation resumed", "info");
}

function togglePriority() {
    isVIP = !isVIP;
    const btn = document.getElementById("priorityBtn");
    btn.dataset.vip = isVIP;
    btn.querySelector(".priority-icon").textContent = isVIP ? "⭐" : "☆";
    btn.querySelector(".priority-label").textContent = isVIP ? "VIP" : "Normal";
    btn.classList.toggle("vip-active", isVIP);
}

// ════════════════════════════════════════════════════
//  TOAST SYSTEM
// ════════════════════════════════════════════════════
function showToast(msg, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════
function formatTime(seconds) {
    if (!seconds || seconds <= 0) return "0s";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
    return `${s}s`;
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t]));
}

function showErrorOverlay(show) {
    const overlay = document.getElementById("errorOverlay");
    const container = document.getElementById("mainContainer");
    if (!overlay) return;
    overlay.classList.toggle("hidden", !show);
    container?.classList.toggle("blur-main", show);
}

// ════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════
document.getElementById("name").addEventListener("keypress", e => {
    if (e.key === "Enter") addCustomer();
});

setAlgorithm("fifo");
fetchAll();
startTimers();