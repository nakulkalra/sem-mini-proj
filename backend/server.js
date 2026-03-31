require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const path = require("path");
app.use(express.static(path.join(__dirname, '../frontend')));

// --- Constants ---
const SERVICES = {
    'Cash Deposit': { prefix: 'CD', min: 10, max: 90 },
    'Cash Withdrawal': { prefix: 'CW', min: 15, max: 80 },
    'Account Services': { prefix: 'AS', min: 40, max: 180 },
    'Loan Inquiry': { prefix: 'LN', min: 60, max: 300 },
    'Priority Service': { prefix: 'VP', min: 5, max: 45 },
    'New Account': { prefix: 'NA', min: 60, max: 240 }
};

const tokenCounters = { 'CD': 1, 'CW': 1, 'AS': 1, 'LN': 1, 'VP': 1, 'NA': 1 };

function getRandomTime(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// --- DB Helpers ---
async function getCounters() {
    const res = await db.query("SELECT * FROM counters ORDER BY id ASC");
    return res.rows;
}

async function computeWaitTime(windowId, priority) {
    const result = await db.query(
        `SELECT order_time, priority FROM queue
         WHERE status = 'waiting' AND window_id = $1
         ORDER BY CASE WHEN priority = 'vip' THEN 0 ELSE 1 END ASC, id ASC`,
        [windowId]
    );
    if (priority === 'vip') {
        const vipsBefore = result.rows.filter(r => r.priority === 'vip');
        return vipsBefore.reduce((sum, r) => sum + r.order_time, 0);
    } else {
        return result.rows.reduce((sum, r) => sum + r.order_time, 0);
    }
}

async function getCapableCounters(service, priority, countersCache = null) {
    const counters = countersCache || await getCounters();
    const capable = [];
    for (const c of counters) {
        if (c.is_offline || !c.services.includes(service)) continue;
        
        // NORMAL customers can only enter a VIP desk if it is COMPLETELY EMPTY
        if (c.type === 'vip' && priority !== 'vip') {
            const check = await db.query("SELECT COUNT(*) FROM queue WHERE status = 'waiting' AND window_id = $1", [c.id]);
            if (parseInt(check.rows[0].count) > 0) continue; // Skip since it's not empty
        }
        capable.push(c);
    }
    return capable;
}

async function attemptRebalance(emptyWindowId) {
    const counters = await getCounters();
    const targetDesk = counters.find(c => c.id === emptyWindowId);
    if (!targetDesk || targetDesk.is_offline || targetDesk.services.length === 0) return;

    // Trigger stealing if we have less than 2 people (so at most 1 active person getting served, and 0 waiting behind)
    const checkEmpty = await db.query("SELECT COUNT(*) FROM queue WHERE status = 'waiting' AND window_id = $1", [emptyWindowId]);
    const emptyLen = parseInt(checkEmpty.rows[0].count);
    if (emptyLen >= 2) return;

    const placeholders = targetDesk.services.map((_, i) => `$${i + 3}`).join(',');
    
    // Mathematically perfect stealing threshold: Target must have at least (Current + 2) people to guarantee a net balance improvement
    const stealQuery = `SELECT q.id, q.window_id FROM queue q JOIN (SELECT window_id, COUNT(*) as q_len FROM queue WHERE status = 'waiting' AND window_id != $1 GROUP BY window_id HAVING COUNT(*) >= $2) busy_desks ON q.window_id = busy_desks.window_id WHERE q.status = 'waiting' AND q.service IN (${placeholders}) ORDER BY busy_desks.q_len DESC, CASE WHEN q.priority = 'vip' THEN 0 ELSE 1 END ASC, q.id DESC LIMIT 1`;
    
    try {
        const stealable = await db.query(stealQuery, [emptyWindowId, emptyLen + 2, ...targetDesk.services]);
        if (stealable.rows.length > 0) {
            const stolenId = stealable.rows[0].id;
            
            // Calculate wait time saved
            const oldWaitRes = await db.query("SELECT wait_time FROM queue WHERE id = $1", [stolenId]);
            const oldWait = oldWaitRes.rows[0].wait_time;
            const newWait = 0; // The desk is empty
            const saved = Math.max(0, oldWait - newWait);

            console.log(`Auto-Rebalance: Moving customer ${stolenId} to empty window ${emptyWindowId} (Saved ${saved}s)`);
            await db.query("UPDATE queue SET window_id = $1, wait_time = 0 WHERE id = $2", [emptyWindowId, stolenId]);
            await db.query("UPDATE counters SET time_saved = time_saved + $1 WHERE id = $2", [saved, emptyWindowId]);
        }
    } catch(e) { console.error("Rebalance err:", e); }
}

async function reRouteCustomersFromWindow(windowId, countersCache = null) {
    const counters = countersCache || await getCounters();
    const customersToMove = await db.query(`SELECT * FROM queue WHERE status = 'waiting' AND window_id = $1 ORDER BY id ASC`, [windowId]);
    let movedCount = 0;
    for (const cust of customersToMove.rows) {
        const capableCounters = await getCapableCounters(cust.service, cust.priority, counters);
        if (capableCounters.length > 0) {
            let minWait = Infinity; let bestWindow = capableCounters[0].id;
            for (const c of capableCounters) {
                const wt = await computeWaitTime(c.id, cust.priority);
                if (wt < minWait) { minWait = wt; bestWindow = c.id; }
            }
            
            const saved = Math.max(0, cust.wait_time - minWait);
            if (saved > 0) {
                await db.query("UPDATE counters SET time_saved = time_saved + $1 WHERE id = $2", [saved, bestWindow]);
            }

            await db.query(`UPDATE queue SET window_id = $1, wait_time = $2 WHERE id = $3`, [bestWindow, minWait, cust.id]);
            movedCount++;
        }
    }
    return movedCount;
}

// --- Endpoints ---
app.post("/counters", async (req, res) => {
    try {
        const { name, type = 'standard', services } = req.body;
        if (!name || !services || services.length === 0) return res.status(400).json({error: "Invalid desk config"});
        // services comes in as an array of strings
        const result = await db.query("INSERT INTO counters (name, type, services, is_offline) VALUES ($1, $2, $3, false) RETURNING *", [name, type, services]);
        res.json(result.rows[0]);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Could not add counter" });
    }
});

app.delete("/counters/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        // Force offline and re-route before deleting
        await db.query("UPDATE counters SET is_offline = true WHERE id = $1", [id]);
        await reRouteCustomersFromWindow(id);
        await db.query("DELETE FROM counters WHERE id = $1", [id]);
        res.json({ success: true });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Could not delete counter" });
    }
});

app.post("/add", async (req, res) => {
    try {
        let { name, service = "Cash Deposit", priority = "normal", window_id = null } = req.body;
        if (!SERVICES[service]) service = 'Cash Deposit';
        const srvDef = SERVICES[service];
        const order_time = getRandomTime(srvDef.min, srvDef.max);
        const tokenStr = `${srvDef.prefix}-${tokenCounters[srvDef.prefix].toString().padStart(3, '0')}`;
        tokenCounters[srvDef.prefix]++;

        const counters = await getCounters();
        const capableCounters = await getCapableCounters(service, priority, counters);

        if (capableCounters.length === 0) return res.status(400).json({ error: "No available capable counters" });

        let assignedWindow = window_id;
        if (!assignedWindow || !capableCounters.find(c => c.id === assignedWindow)) {
            let minWait = Infinity;
            for (const c of capableCounters) {
                const wt = await computeWaitTime(c.id, priority);
                if (wt < minWait) { minWait = wt; assignedWindow = c.id; }
            }
        }
        if (!assignedWindow) assignedWindow = capableCounters[0].id;

        const wait_time = await computeWaitTime(assignedWindow, priority);
        const sql = `INSERT INTO queue (name, service, priority, status, window_id, order_time, wait_time, token) VALUES ($1, $2, $3, 'waiting', $4, $5, $6, $7) RETURNING *`;
        const result = await db.query(sql, ["Walk-in Client", service, priority, assignedWindow, order_time, wait_time, tokenStr]);
        
        // Passively trigger rebalance checks floor-wide
        counters.filter(c => !c.is_offline).forEach(c => attemptRebalance(c.id));
        
        res.status(201).json({ customer: result.rows[0], assigned_window: assignedWindow });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server Error" }); }
});

app.post("/random", async (req, res) => {
    try {
        const count = parseInt(req.body.count) || 1;
        const totalGenerated = [];
        const counters = await getCounters();
        
        // Find all unique services currently supported by ANY active desk
        let activeServices = new Set();
        counters.filter(c => !c.is_offline).forEach(c => {
            c.services.forEach(s => activeServices.add(s));
        });
        const supportedServices = Array.from(activeServices);
        
        if (supportedServices.length === 0) {
            return res.status(400).json({ error: "No active desks to handle spawns" });
        }

        for (let i = 0; i < count; i++) {
            const randomService = supportedServices[Math.floor(Math.random() * supportedServices.length)];
            const priority = (Math.random() < 0.15) ? 'vip' : 'normal';
            
            // Generate workflow (25% chance of chained tasks)
            let workflow = [];
            if (Math.random() < 0.25 && supportedServices.length > 1) {
                const possibleNext = supportedServices.filter(s => s !== randomService);
                const nextService = possibleNext[Math.floor(Math.random() * possibleNext.length)];
                workflow.push(nextService);
                // 10% chance of a 3-step workflow
                if (Math.random() < 0.1 && possibleNext.length > 1) {
                    const thirdPossible = possibleNext.filter(s => s !== nextService);
                    workflow.push(thirdPossible[Math.floor(Math.random() * thirdPossible.length)]);
                }
            }
            
            // Fallback just in case
            const srvDef = SERVICES[randomService] || SERVICES['Cash Deposit'];
            const order_time = getRandomTime(srvDef.min, srvDef.max);
            const tokenStr = `${srvDef.prefix}-${tokenCounters[srvDef.prefix].toString().padStart(3, '0')}`;
            tokenCounters[srvDef.prefix]++;

            const capableCounters = await getCapableCounters(randomService, priority, counters);
            if (capableCounters.length === 0) continue; // Skip if cant handle

            let assignedWindow = null; let minWait = Infinity;
            for (const c of capableCounters) {
                const wt = await computeWaitTime(c.id, priority);
                if (wt < minWait) { minWait = wt; assignedWindow = c.id; }
            }
            if (!assignedWindow) assignedWindow = capableCounters[0].id;

            const wait_time = await computeWaitTime(assignedWindow, priority);
            const sql = `INSERT INTO queue (name, service, priority, status, window_id, order_time, wait_time, token, workflow) VALUES ($1, $2, $3, 'waiting', $4, $5, $6, $7, $8) RETURNING *`;
            const result = await db.query(sql, ["Random Spawn", randomService, priority, assignedWindow, order_time, wait_time, tokenStr, JSON.stringify(workflow)]);
            totalGenerated.push(result.rows[0]);
        }
        
        // At the end of huge bulk spawns, instantly execute cross-floor rebalancing
        counters.filter(c => !c.is_offline).forEach(c => attemptRebalance(c.id));
        
        res.status(201).json({ added: totalGenerated.length, customers: totalGenerated });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server Error" }); }
});

app.get("/queue", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM queue WHERE status = 'waiting' ORDER BY window_id ASC, CASE WHEN priority = 'vip' THEN 0 ELSE 1 END ASC, id ASC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.get("/windows", async (req, res) => {
    try {
        const counters = await getCounters();
        const responseWindows = [];
        for (const c of counters) {
            const waitingResult = await db.query(`SELECT * FROM queue WHERE status = 'waiting' AND window_id = $1 ORDER BY CASE WHEN priority = 'vip' THEN 0 ELSE 1 END ASC, id ASC`, [c.id]);
            const rows = waitingResult.rows;
            let current = rows[0] || null;
            
            // Mark virtual customer as 'called_at = NOW()' if they reach the front of the queue
            if (current && current.is_virtual && !current.checked_in && !current.called_at) {
                await db.query(`UPDATE queue SET called_at = NOW() WHERE id = $1`, [current.id]);
                current.called_at = new Date().toISOString();
            }

            const responseQueueTokens = rows.map(r => `${r.token} (${r.priority})`);
            console.log(`Window ${c.id} queue: `, responseQueueTokens);

            responseWindows.push({
                window_id: c.id, name: c.name, type: c.type, services: c.services, is_offline: c.is_offline, time_saved: c.time_saved || 0,
                current: rows[0] || null, queue_length: rows.length,
                total_wait: rows.reduce((s, r) => s + r.order_time, 0), queue: rows
            });
        }
        res.json(responseWindows);
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

async function processServe(windowId, counters) {
    const qRes = await db.query(`SELECT * FROM queue WHERE status = 'waiting' AND window_id = $1 ORDER BY CASE WHEN priority = 'vip' THEN 0 ELSE 1 END ASC, id ASC LIMIT 1`, [windowId]);
    if (qRes.rowCount === 0) return null;
    const row = qRes.rows[0];
    
    // Parse workflow array robustly
    let workflow = row.workflow || [];
    if (typeof workflow === 'string') {
        try { workflow = JSON.parse(workflow); } catch (e) { workflow = []; }
    }
    
    // Virtual handling: skip or re-queue if unchecked
    if (row.is_virtual && !row.checked_in) {
        if (row.called_at) {
            const calledAt = new Date(row.called_at).getTime();
            if (Date.now() - calledAt >= 15000) {
                // Timer expired -> remove from queue (mark abandoned)
                await db.query(`UPDATE queue SET status = 'abandoned', abandoned_at = NOW() WHERE id = $1`, [row.id]);
                // Process the next valid person
                return await processServe(windowId, counters);
            }
        }
        // Still calling, do nothing
        return { ...row, chained_handoff: false, is_calling: true };
    }

    if (workflow.length > 0) {
        // Handoff logic (Customer physically moves to a new desk)
        const nextService = workflow.shift();
        const capableCounters = await getCapableCounters(nextService, 'vip', counters);
        let assignedWindow = capableCounters.length > 0 ? capableCounters[0].id : windowId; // Fallback
        
        let minWait = Infinity;
        for (const c of capableCounters) {
            const wt = await computeWaitTime(c.id, 'vip');
            if (wt < minWait) { minWait = wt; assignedWindow = c.id; }
        }
        
        await db.query(`UPDATE queue SET service = $1, workflow = $2, window_id = $3, priority = 'vip' WHERE id = $4`, [nextService, JSON.stringify(workflow), assignedWindow, row.id]);
        return { ...row, chained_handoff: true, nextWindowId: assignedWindow };
    } else {
        // Traditional completion
        await db.query(`UPDATE queue SET status = 'served', served_at = NOW() WHERE id = $1`, [row.id]);
        return { ...row, chained_handoff: false };
    }
}

app.post("/serve/:windowId", async (req, res) => {
    try {
        const windowId = parseInt(req.params.windowId);
        const counters = await getCounters();
        const cDesk = counters.find(c => c.id === windowId);
        if (!cDesk || cDesk.is_offline) return res.status(400).json({ message: "Counter offline" });

        const servedCustomer = await processServe(windowId, counters);
        
        await attemptRebalance(windowId);
        if (!servedCustomer) return res.status(404).json({ message: "No customers waiting" });
        res.json({ message: "Served", customer: servedCustomer });
    } catch (err) { console.error(err); res.status(500).json({ error: "Error" }); }
});

app.post("/auto-advance", async (req, res) => {
    try {
        const served = [];
        const counters = await getCounters();
        for (const c of counters) {
            if (c.is_offline) continue;
            const servedCustomer = await processServe(c.id, counters);
            if (servedCustomer) served.push(servedCustomer);
            await attemptRebalance(c.id);
        }
        res.json({ message: "Auto advanced", served });
    } catch (err) { console.error(err); res.status(500).json({ error: "Error" }); }
});

app.post("/status/:windowId", async (req, res) => {
    try {
        const windowId = parseInt(req.params.windowId);
        const { is_offline } = req.body;
        await db.query("UPDATE counters SET is_offline = $1 WHERE id = $2", [is_offline, windowId]);
        if (is_offline) {
            const movedCount = await reRouteCustomersFromWindow(windowId);
            res.json({ message: "Counter offline", movedCustomers: movedCount });
        } else { res.json({ message: "Counter online" }); }
    } catch (err) { console.error(err); res.status(500).json({ error: "Error" }); }
});

app.get("/stats", async (req, res) => {
    try {
        const total = await db.query("SELECT COUNT(*) FROM queue WHERE status = 'served'");
        const avgWait = await db.query(`SELECT AVG(EXTRACT(EPOCH FROM (served_at - created_at))) as avg_seconds FROM queue WHERE status = 'served' AND served_at IS NOT NULL`);
        res.json({ total_served: parseInt(total.rows[0].count), avg_wait_seconds: parseFloat(avgWait.rows[0].avg_seconds) || 0 });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.post("/reset", async (req, res) => {
    try {
        await db.query("TRUNCATE TABLE queue RESTART IDENTITY");
        await db.query("UPDATE counters SET time_saved = 0");
        Object.keys(tokenCounters).forEach(k => tokenCounters[k] = 1);
        res.json({ message: "Database reset successfully" });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.post("/book", async (req, res) => {
    try {
        let { name, service = "Cash Deposit", priority = "normal" } = req.body;
        if (!name) name = "Virtual Client";
        if (!SERVICES[service]) service = 'Cash Deposit';
        const srvDef = SERVICES[service];
        const order_time = getRandomTime(srvDef.min, srvDef.max);
        const tokenStr = `${srvDef.prefix}-${tokenCounters[srvDef.prefix].toString().padStart(3, '0')}`;
        tokenCounters[srvDef.prefix]++;

        const counters = await getCounters();
        const capableCounters = await getCapableCounters(service, priority, counters);

        if (capableCounters.length === 0) return res.status(400).json({ error: "No available capable counters" });

        let assignedWindow = null; let minWait = Infinity;
        for (const c of capableCounters) {
            const wt = await computeWaitTime(c.id, priority);
            if (wt < minWait) { minWait = wt; assignedWindow = c.id; }
        }
        if (!assignedWindow) assignedWindow = capableCounters[0].id;

        const wait_time = await computeWaitTime(assignedWindow, priority);
        const sql = `INSERT INTO queue (name, service, priority, status, window_id, order_time, wait_time, token, is_virtual) VALUES ($1, $2, $3, 'waiting', $4, $5, $6, $7, true) RETURNING *`;
        const result = await db.query(sql, [name, service, priority, assignedWindow, order_time, wait_time, tokenStr]);
        
        counters.filter(c => !c.is_offline).forEach(c => attemptRebalance(c.id));
        
        res.status(201).json({ customer: result.rows[0], assigned_window: assignedWindow });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server Error" }); }
});

app.get("/queue-item/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const result = await db.query("SELECT * FROM queue WHERE id = $1", [id]);
        if (result.rowCount === 0) return res.status(404).json({error: "Not found"});
        const item = result.rows[0];
        
        const waiting = await db.query("SELECT id FROM queue WHERE status = 'waiting' AND window_id = $1 ORDER BY CASE WHEN priority = 'vip' THEN 0 ELSE 1 END ASC, id ASC", [item.window_id]);
        const pos = waiting.rows.findIndex(r => r.id === id) + 1;
        
        res.json({ item, position: pos });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.post("/checkin/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await db.query("UPDATE queue SET checked_in = true WHERE id = $1", [id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));