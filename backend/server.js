require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// --- Constants ---
const SERVICES = {
    'Cash Deposit': { prefix: 'CD', min: 10, max: 20 },
    'Cash Withdrawal': { prefix: 'CW', min: 12, max: 25 },
    'Account Services': { prefix: 'AS', min: 30, max: 60 },
    'Loan Inquiry': { prefix: 'LN', min: 35, max: 70 },
    'Priority Service': { prefix: 'VP', min: 10, max: 50 }
};

// Counters (Windows)
const COUNTERS = [
    { id: 1, name: "Cashier 1", type: "cash", services: ['Cash Deposit', 'Cash Withdrawal'] },
    { id: 2, name: "Cashier 2", type: "cash", services: ['Cash Deposit', 'Cash Withdrawal'] },
    { id: 3, name: "Account Desk", type: "accounts", services: ['Account Services', 'Loan Inquiry'] },
    { id: 4, name: "Priority Desk", type: "vip", services: ['Cash Deposit', 'Cash Withdrawal', 'Account Services', 'Loan Inquiry', 'Priority Service'] }
];

// In-memory counter states (since they aren't in DB)
// 1 = online, 0 = offline (on break)
const counterStatus = { 1: true, 2: true, 3: true, 4: true };

// Token generation state (per prefix)
const tokenCounters = { 'CD': 1, 'CW': 1, 'AS': 1, 'LN': 1, 'VP': 1 };

function getRandomTime(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Compute estimated wait time for a new customer joining a window
async function computeWaitTime(windowId, priority) {
    const result = await db.query(
        `SELECT order_time, priority FROM queue
         WHERE status = 'waiting' AND window_id = $1
         ORDER BY
           CASE WHEN priority = 'vip' THEN 0 ELSE 1 END ASC,
           id ASC`,
        [windowId]
    );
    if (priority === 'vip') {
        const vipsBefore = result.rows.filter(r => r.priority === 'vip');
        return vipsBefore.reduce((sum, r) => sum + r.order_time, 0);
    } else {
        return result.rows.reduce((sum, r) => sum + r.order_time, 0);
    }
}

// --- POST /add ---
app.post("/add", async (req, res) => {
    try {
        const { name, service = "Cash Deposit", priority = "normal", window_id = null } = req.body;
        
        let targetService = service;
        // If unknown service, fallback to Cash Deposit
        if (!SERVICES[targetService]) targetService = 'Cash Deposit';

        const srvDef = SERVICES[targetService];
        const order_time = getRandomTime(srvDef.min, srvDef.max);

        // Generate Token
        const tokenStr = `${srvDef.prefix}-${tokenCounters[srvDef.prefix].toString().padStart(3, '0')}`;
        tokenCounters[srvDef.prefix]++;

        // Which counters can serve this?
        const capableCounters = COUNTERS.filter(c => c.services.includes(targetService) && counterStatus[c.id]);

        if (capableCounters.length === 0) {
            return res.status(400).json({ error: "No available counters for this service" });
        }

        let assignedWindow = window_id;
        if (!assignedWindow || !capableCounters.find(c => c.id === assignedWindow)) {
            let minWait = Infinity;
            for (const c of capableCounters) {
                const wt = await computeWaitTime(c.id, priority);
                if (wt < minWait) { minWait = wt; assignedWindow = c.id; }
            }
        }
        
        // If still somehow no window, default to first capable
        if (!assignedWindow) assignedWindow = capableCounters[0].id;

        const wait_time = await computeWaitTime(assignedWindow, priority);
        const sql = `INSERT INTO queue (name, service, priority, status, window_id, order_time, wait_time, token)
                     VALUES ($1, $2, $3, 'waiting', $4, $5, $6, $7) RETURNING *`;
        const result = await db.query(sql, [name, targetService, priority, assignedWindow, order_time, wait_time, tokenStr]);
        res.status(201).json({ message: "Customer Added", customer: result.rows[0], assigned_window: assignedWindow, estimated_wait: wait_time });
    } catch (err) {
        console.error("Error adding customer:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- POST /random --- (Spawn purely random user)
app.post("/random", async (req, res) => {
    try {
        const servicesList = Object.keys(SERVICES);
        const randomService = servicesList[Math.floor(Math.random() * servicesList.length)];
        
        // 10% chance of VIP
        const isVip = Math.random() < 0.15;
        const priority = isVip ? 'vip' : 'normal';
        const name = "Walk-in Client";

        const srvDef = SERVICES[randomService];
        const order_time = getRandomTime(srvDef.min, srvDef.max);
        const tokenStr = `${srvDef.prefix}-${tokenCounters[srvDef.prefix].toString().padStart(3, '0')}`;
        tokenCounters[srvDef.prefix]++;

        const capableCounters = COUNTERS.filter(c => c.services.includes(randomService) && counterStatus[c.id]);
        if (capableCounters.length === 0) {
            return res.status(400).json({ error: `No counters for ${randomService}` });
        }

        let assignedWindow = null;
        let minWait = Infinity;
        for (const c of capableCounters) {
            // Prioritize empty queues even over exact math
            const waitTime = await computeWaitTime(c.id, priority);
            if (waitTime < minWait) { minWait = waitTime; assignedWindow = c.id; }
        }
        if (!assignedWindow) assignedWindow = capableCounters[0].id;

        const wait_time = await computeWaitTime(assignedWindow, priority);
        const sql = `INSERT INTO queue (name, service, priority, status, window_id, order_time, wait_time, token)
                     VALUES ($1, $2, $3, 'waiting', $4, $5, $6, $7) RETURNING *`;
        const result = await db.query(sql, [name, randomService, priority, assignedWindow, order_time, wait_time, tokenStr]);
        res.status(201).json({ message: "Random Added", customer: result.rows[0], assigned_window: assignedWindow, estimated_wait: wait_time });
    } catch (err) {
        console.error("Error adding random:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- GET /queue ---
app.get("/queue", async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM queue WHERE status = 'waiting'
             ORDER BY window_id ASC,
               CASE WHEN priority = 'vip' THEN 0 ELSE 1 END ASC,
               id ASC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- GET /served ---
app.get("/served", async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM queue WHERE status IN ('served', 'abandoned') ORDER BY id DESC LIMIT 100`
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- GET /windows ---
app.get("/windows", async (req, res) => {
    try {
        const responseWindows = [];
        for (const c of COUNTERS) {
            const waitingResult = await db.query(
                `SELECT * FROM queue WHERE status = 'waiting' AND window_id = $1
                 ORDER BY CASE WHEN priority = 'vip' THEN 0 ELSE 1 END ASC, id ASC`,
                [c.id]
            );
            const rows = waitingResult.rows;
            const current = rows[0] || null;
            const queueLength = rows.length;
            const totalWait = rows.reduce((s, r) => s + r.order_time, 0);
            
            responseWindows.push({
                window_id: c.id,
                name: c.name,
                type: c.type,
                services: c.services,
                is_offline: !counterStatus[c.id],
                current,
                queue_length: queueLength,
                total_wait: totalWait,
                queue: rows
            });
        }
        res.json(responseWindows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

async function attemptRebalance(emptyWindowId) {
    if (!counterStatus[emptyWindowId]) return;
    
    // Only fetch if empty
    const checkEmpty = await db.query("SELECT COUNT(*) FROM queue WHERE status = 'waiting' AND window_id = $1", [emptyWindowId]);
    if (parseInt(checkEmpty.rows[0].count) > 0) return;
    
    const targetDesk = COUNTERS.find(c => c.id === emptyWindowId);
    if (!targetDesk) return;

    // A desk is empty! Try to steal the person at the back of the longest capable line
    if (targetDesk.services.length === 0) return;
    const placeholders = targetDesk.services.map((_, i) => `$${i + 2}`).join(", ");
    
    const stealQuery = `
        SELECT q.id, q.window_id 
        FROM queue q
        JOIN (
            SELECT window_id, COUNT(*) as q_len 
            FROM queue 
            WHERE status = 'waiting' AND window_id != $1
            GROUP BY window_id
            HAVING COUNT(*) > 1
        ) busy_desks ON q.window_id = busy_desks.window_id
        WHERE q.status = 'waiting' AND q.service IN (${placeholders})
        ORDER BY busy_desks.q_len DESC, q.id DESC
        LIMIT 1
    `;
    
    const params = [emptyWindowId, ...targetDesk.services];
    try {
        const stealable = await db.query(stealQuery, params);
        if (stealable.rows.length > 0) {
            const stolenId = stealable.rows[0].id;
            console.log(`Auto-Rebalance: Moving customer ${stolenId} to empty window ${emptyWindowId}`);
            await db.query("UPDATE queue SET window_id = $1 WHERE id = $2", [emptyWindowId, stolenId]);
        }
    } catch(e) {
        console.error("Rebalance err:", e);
    }
}

// --- POST /serve/:windowId ---
app.post("/serve/:windowId", async (req, res) => {
    try {
        const windowId = parseInt(req.params.windowId);
        if (!counterStatus[windowId]) return res.status(400).json({ message: "Counter is offline" });

        const sql = `UPDATE queue SET status = 'served', served_at = NOW()
                     WHERE id = (
                       SELECT id FROM queue WHERE status = 'waiting' AND window_id = $1
                       ORDER BY CASE WHEN priority = 'vip' THEN 0 ELSE 1 END ASC, id ASC
                       LIMIT 1
                     ) RETURNING *`;
        const result = await db.query(sql, [windowId]);
        if (result.rowCount === 0) {
            // Check if we can steal someone immediately anyway since we're empty
            await attemptRebalance(windowId);
            return res.status(404).json({ message: "No customers waiting (rebalance checked)" });
        }
        
        // We served someone, let's see if this caused us to become empty
        await attemptRebalance(windowId);
        
        res.json({ message: "Served", customer: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- POST /auto-advance ---
app.post("/auto-advance", async (req, res) => {
    try {
        const served = [];
        for (const c of COUNTERS) {
            if (!counterStatus[c.id]) continue;
            const sql = `UPDATE queue SET status = 'served', served_at = NOW()
                         WHERE id = (
                           SELECT id FROM queue WHERE status = 'waiting' AND window_id = $1
                           ORDER BY CASE WHEN priority = 'vip' THEN 0 ELSE 1 END ASC, id ASC
                           LIMIT 1
                         ) RETURNING *`;
            const result = await db.query(sql, [c.id]);
            if (result.rowCount > 0) {
                served.push(result.rows[0]);
                await attemptRebalance(c.id);
            } else {
                await attemptRebalance(c.id);
            }
        }
        res.json({ message: "Auto advanced", served });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- POST /status/:windowId --- (Take counter offline & re-route)
app.post("/status/:windowId", async (req, res) => {
    try {
        const windowId = parseInt(req.params.windowId);
        const { is_offline } = req.body;
        
        counterStatus[windowId] = !is_offline;

        if (is_offline) {
            // Re-route everyone in this window
            const customersToMove = await db.query(
                `SELECT * FROM queue WHERE status = 'waiting' AND window_id = $1 ORDER BY id ASC`, [windowId]
            );
            let movedCount = 0;
            for (const cust of customersToMove.rows) {
                // Find new window
                const capableCounters = COUNTERS.filter(c => c.services.includes(cust.service) && counterStatus[c.id]);
                if (capableCounters.length > 0) {
                    let minWait = Infinity; let bestWindow = capableCounters[0].id;
                    for (const c of capableCounters) {
                        const wt = await computeWaitTime(c.id, cust.priority);
                        if (wt < minWait) { minWait = wt; bestWindow = c.id; }
                    }
                    await db.query(`UPDATE queue SET window_id = $1, wait_time = $2 WHERE id = $3`, [bestWindow, minWait, cust.id]);
                    movedCount++;
                }
            }
            res.json({ message: "Counter offline", movedCustomers: movedCount });
        } else {
            res.json({ message: "Counter online" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- POST /switch/:customerId ---
app.post("/switch/:customerId", async (req, res) => {
    try {
        const customerId = parseInt(req.params.customerId);
        const customerResult = await db.query("SELECT * FROM queue WHERE id = $1", [customerId]);
        if (customerResult.rows.length === 0) return res.status(404).json({ message: "not found" });
        const customer = customerResult.rows[0];
        
        const capableCounters = COUNTERS.filter(c => c.services.includes(customer.service) && counterStatus[c.id]);
        if (capableCounters.length === 0) return res.json({ switched: false });
        
        let bestWindow = customer.window_id;
        let minWait = Infinity;
        const fromWait = await computeWaitTime(customer.window_id, customer.priority);

        for (const c of capableCounters) {
            if (c.id === customer.window_id) continue;
            const wt = await computeWaitTime(c.id, customer.priority);
            if (wt < minWait) { minWait = wt; bestWindow = c.id; }
        }

        if (bestWindow === customer.window_id) {
            return res.json({ switched: false });
        }

        await db.query("UPDATE queue SET window_id = $1, wait_time = $2 WHERE id = $3", [bestWindow, minWait, customerId]);
        res.json({ switched: true, from: customer.window_id, to: bestWindow });
    } catch(err) { res.status(500).json({error: err}); }
});

// --- POST /abandon ---
app.post("/abandon", async (req, res) => {
    try {
        const { threshold_seconds = 180 } = req.body;
        const sql = `UPDATE queue SET status = 'abandoned', abandoned_at = NOW()
                     WHERE status = 'waiting'
                       AND created_at < NOW() - ($1 || ' seconds')::INTERVAL
                     RETURNING *`;
        const result = await db.query(sql, [threshold_seconds]);
        res.json({ message: "Abandoned stale customers", count: result.rowCount, customers: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- GET /stats ---
app.get("/stats", async (req, res) => {
    try {
        const total = await db.query("SELECT COUNT(*) FROM queue WHERE status = 'served'");
        const abandoned = await db.query("SELECT COUNT(*) FROM queue WHERE status = 'abandoned'");
        const avgWait = await db.query(
            `SELECT AVG(EXTRACT(EPOCH FROM (served_at - created_at))) as avg_seconds
             FROM queue WHERE status = 'served' AND served_at IS NOT NULL`
        );
        const byWindow = await db.query(
            `SELECT window_id, COUNT(*) as served_count FROM queue WHERE status = 'served' GROUP BY window_id ORDER BY window_id`
        );
        res.json({
            total_served: parseInt(total.rows[0].count),
            total_abandoned: parseInt(abandoned.rows[0].count),
            avg_wait_seconds: parseFloat(avgWait.rows[0].avg_seconds) || 0,
            by_window: byWindow.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- POST /reset ---
app.post("/reset", async (req, res) => {
    try {
        await db.query("TRUNCATE TABLE queue RESTART IDENTITY");
        Object.keys(tokenCounters).forEach(k => tokenCounters[k] = 1);
        res.json({ message: "Database reset successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));