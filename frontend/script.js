const API = "http://localhost:5000";

let countersData = [];
let queueData = [];
let simStats = {};
let mode = "manual";
let paused = false;
let speed = 1;
let isVIP = false;

let mainInterval = null;
let tickInterval = null;
const BASE_POLL = 1500;
const BASE_TICK = 1000;

let avatars = {};
let counterTimeRemaining = {}; 

async function fetchAll() {
    try {
        const [winRes, qRes, statRes] = await Promise.all([
            fetch(API + "/windows"),
            fetch(API + "/queue"),
            fetch(API + "/stats")
        ]);
        if (!winRes.ok) return;

        countersData = await winRes.json();
        queueData = await qRes.json();
        simStats = await statRes.json();

        renderCounters();
        renderAvatarsInQueues();
        updateStats();
        checkAnnouncements();
        document.getElementById("errorOverlay").classList.add("hidden");
    } catch (e) {
        document.getElementById("errorOverlay").classList.remove("hidden");
    }
}

function startTimers() {
    clearInterval(mainInterval);
    clearInterval(tickInterval);
    const pollMs = Math.max(500, BASE_POLL / speed);
    const tickMs = Math.max(100, BASE_TICK / speed);
    mainInterval = setInterval(fetchAll, pollMs);
    tickInterval = setInterval(tick, tickMs);
}

function renderCounters() {
    const row = document.getElementById("countersRow");
    if (row.children.length === 0) {
        countersData.forEach(c => {
            const div = document.createElement("div");
            div.className = `counter-desk ${c.type === 'vip' ? 'vip-theme' : ''}`;
            div.id = `counter-desk-${c.window_id}`;
            div.innerHTML = `
                <div class="desk-id">${c.name}</div>
                <div class="desk-type">${c.services.join(' &bull; ')}</div>
                
                <button class="btn-toggle-desk ${c.is_offline ? 'is-offline' : ''}" onclick="toggleCounter(${c.window_id}, ${!c.is_offline})">
                    ${c.is_offline ? '🔴 Offline' : '🟢 Online'}
                </button>
                <div class="desk-time-wrap" style="display:flex; justify-content:space-between; width:100%; font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:4px; opacity: ${c.is_offline ? '0' : '1'}">
                    <span>Est. Time</span>
                    <span id="time-${c.window_id}">--s</span>
                </div>
                <div class="desk-progress" style="opacity: ${c.is_offline ? '0.5' : '1'}">
                    <div class="desk-progress-bar" id="prog-${c.window_id}"></div>
                </div>
                <div style="margin-top:16px; width:100%;" id="serve-btn-${c.window_id}">
                    ${mode === 'manual' ? `<button class="btn-primary" onclick="serveWindow(${c.window_id})" style="width:100%;font-size:13px;padding:10px;" ${c.is_offline ? 'disabled style="opacity:0.5"' : ''}>Serve Next</button>` : ''}
                </div>
            `;
            row.appendChild(div);
        });
    } else {
        countersData.forEach(c => {
            const div = document.getElementById(`counter-desk-${c.window_id}`);
            if (div) {
                div.className = `counter-desk ${c.type === 'vip' ? 'vip-theme' : ''} ${c.is_offline ? 'offline' : ''}`;
                const btn = div.querySelector('.btn-toggle-desk');
                btn.className = `btn-toggle-desk ${c.is_offline ? 'is-offline' : ''}`;
                btn.textContent = c.is_offline ? '🔴 Offline' : '🟢 Online';
                btn.setAttribute("onclick", `toggleCounter(${c.window_id}, ${!c.is_offline})`);
                
                // Track remaining time for simple progress visual (pause if desk offline)
                if (!c.is_offline && c.current && (!counterTimeRemaining[c.window_id] || counterTimeRemaining[c.window_id].customer_id !== c.current.id)) {
                    counterTimeRemaining[c.window_id] = { cur: c.current.order_time, max: c.current.order_time, customer_id: c.current.id };
                } else if (c.is_offline || !c.current) {
                    delete counterTimeRemaining[c.window_id];
                    const pbar = document.getElementById(`prog-${c.window_id}`);
                    if(pbar) pbar.style.width = '0%';
                    const tval = document.getElementById(`time-${c.window_id}`);
                    if(tval) tval.textContent = '--s';
                }
            }
        });
    }
}

function renderAvatarsInQueues() {
    const expected = new Set();
    const floorRect = document.querySelector(".bank-floor").getBoundingClientRect();

    // Group waiters by window
    const queuesByWindow = {};
    countersData.forEach(c => { queuesByWindow[c.window_id] = []; });
    queueData.forEach(q => { if(queuesByWindow[q.window_id]) queuesByWindow[q.window_id].push(q); });

    countersData.forEach(c => {
        const deskEl = document.getElementById(`counter-desk-${c.window_id}`);
        if (!deskEl) return;
        const deskRect = deskEl.getBoundingClientRect();
        
        // Coordinates local to .bank-floor
        const centerX = deskRect.left - floorRect.left + (deskRect.width / 2);
        
        // 1. Current Customer (is right ON TOP of the desk card area visually)
        if (c.current) {
            expected.add(c.current.id.toString());
            let el = createOrGetAvatar(c.current);
            el.classList.add('is-serving');
            el.style.left = (centerX - 35) + "px"; // 35 is half avatar width 70px
            el.style.top = (deskRect.top - floorRect.top + 70) + "px"; // Shift down into desk div
        }

        // 2. Waiting Queue forming a line downwards BELOW the desk
        const deskBottomY = deskRect.bottom - floorRect.top + 20;
        const sortedLine = queuesByWindow[c.window_id].sort((a,b) => a.id - b.id);
        
        sortedLine.forEach((qCust, idx) => {
            expected.add(qCust.id.toString());
            let el = createOrGetAvatar(qCust);
            el.classList.remove('is-serving');
            
            const gap = 84; // 70px width + 14px padding
            el.style.left = (centerX - 35) + "px";
            el.style.top = (deskBottomY + (idx * gap)) + "px";
        });
    });

    // Cleanup abandoned/served (walk out screen to left)
    Object.keys(avatars).forEach(id => {
        if (!expected.has(id)) {
            const el = avatars[id];
            el.style.left = "-150px"; 
            el.style.opacity = "0";
            setTimeout(() => { if(el && el.parentNode) el.remove(); }, 600);
            delete avatars[id];
        }
    });

    // Increase floor min height dynamically if queues grow very long
    const longestLine = Math.max(...Object.values(queuesByWindow).map(arr => arr.length));
    const requiredHeight = 400 + (longestLine * 84); // 400 is desk height + clearance
    document.querySelector(".bank-floor").style.minHeight = requiredHeight + "px";
}

function createOrGetAvatar(cust) {
    let el = avatars[cust.id];
    let isNew = false;
    if (!el) {
        el = document.createElement("div");
        const prefix = cust.token.split('-')[0].toLowerCase();
        el.className = `avatar-token token-${prefix} ${cust.priority === 'vip' ? 'vip-token' : ''}`;
        el.textContent = cust.token;
        document.getElementById("walkingArea").appendChild(el);
        avatars[cust.id] = el;
        
        // Spawn origin (bottom center of the screen)
        el.style.left = "50%";
        el.style.top = "150%"; // Offscreen bottom
        el.style.opacity = "0";
        el.style.transform = "scale(0.8)";
        isNew = true;
    }
    if (isNew) {
        setTimeout(() => {
            el.style.opacity = "1";
            el.style.transform = "scale(1)";
        }, 50);
    }
    return el;
}

function checkAnnouncements() {
    countersData.forEach(c => {
        if (c.current && c.current.id !== c._lastAnnounced) {
            c._lastAnnounced = c.current.id;
            triggerAnnouncement(c.current.token, c.name);
        }
    });
}

function triggerAnnouncement(token, destName) {
    const board = document.getElementById("announcerBoard");
    board.querySelector(".ann-token").textContent = token;
    board.querySelector(".ann-dest").textContent = `PLEASE PROCEED TO ${destName.toUpperCase()}`;
    board.classList.add("flash");
    setTimeout(() => { board.classList.remove("flash"); }, 2000);
}

function updateStats() {
    document.getElementById("statServed").textContent = simStats.total_served || 0;
    document.getElementById("statWaiting").textContent = queueData.length;
    document.getElementById("statAvgWait").textContent = simStats.avg_wait_seconds ? Math.round(simStats.avg_wait_seconds) + "s" : "0s";
}

function tick() {
    if (paused) return;
    Object.keys(counterTimeRemaining).forEach(wid => {
        const state = counterTimeRemaining[wid];
        if (state.cur > 0) state.cur -= 1;
        const pct = 100 - ((state.cur / state.max) * 100);
        const pb = document.getElementById(`prog-${wid}`);
        if (pb) pb.style.width = `${Math.min(100, Math.max(0, pct))}%`;
        const tval = document.getElementById(`time-${wid}`);
        if (tval) tval.textContent = `${state.cur}s`;

        if (mode === "auto" && state.cur <= 0) {
            serveWindow(wid);
        }
    });
}

async function addCustomer() {
    const svc = document.getElementById("service").value;
    try {
        const res = await fetch(API + "/add", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ priority: isVIP ? 'vip' : 'normal', service: svc })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`Generated: ${data.customer.token}`, "info");
            fetchAll();
        } else { showToast(data.error, "danger"); }
    } catch(e) {}
}

async function spawnRandomClient() {
    try {
        const res = await fetch(API + "/random", { method: "POST" });
        if (res.ok) fetchAll();
    } catch(e){}
}

async function serveWindow(wid) {
    try {
        await fetch(API + `/serve/${wid}`, { method: "POST" });
        delete counterTimeRemaining[wid];
        const pb = document.getElementById(`prog-${wid}`);
        if (pb) pb.style.width = `0%`;
        const tv = document.getElementById(`time-${wid}`);
        if (tv) tv.textContent = `--s`;
        fetchAll();
    } catch(e){}
}

async function toggleCounter(wid, isOffline) {
    try {
        const res = await fetch(API + `/status/${wid}`, {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({is_offline: isOffline})
        });
        const data = await res.json();
        if (data.movedCustomers > 0) showToast(`Re-routed ${data.movedCustomers} waiting components!`, "warning");
        document.getElementById("countersRow").innerHTML = ""; 
        fetchAll();
    } catch(e){}
}

async function resetDatabase() {
    if (!confirm("Delete all data?")) return;
    try {
        await fetch(API + "/reset", { method: "POST" });
        Object.keys(avatars).forEach(id => avatars[id].remove());
        avatars = {};
        counterTimeRemaining = {};
        fetchAll();
        showToast("Simulation memory zeroed.", "danger");
    } catch(e){}
}

function setMode(m) {
    mode = m;
    document.getElementById("modeManual").classList.toggle("active", m === "manual");
    document.getElementById("modeAuto").classList.toggle("active", m === "auto");
    document.getElementById("countersRow").innerHTML = ""; 
    fetchAll();
}
function setSpeed(s) {
    speed = s;
    document.querySelectorAll(".speed-btn").forEach(b => b.classList.toggle("active", parseInt(b.dataset.speed)===s));
    startTimers();
}
function togglePause() {
    paused = !paused;
    const btn = document.getElementById("pauseBtn");
    btn.textContent = paused ? "▶ Resume" : "⏸ Pause";
    btn.classList.toggle("paused", paused);
}
function togglePriority() {
    isVIP = !isVIP;
    const btn = document.getElementById("priorityBtn");
    btn.querySelector(".priority-icon").textContent = isVIP ? "⭐" : "☆";
    btn.querySelector(".priority-label").textContent = isVIP ? "VIP Priority" : "Regular Priority";
    btn.classList.toggle("vip-active", isVIP);
}
function showToast(msg, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// Window resize fixes layout mapping
window.addEventListener("resize", renderAvatarsInQueues);

// Run!
setMode('manual');
document.getElementById("modeManual").classList.add("active");
fetchAll();
startTimers();