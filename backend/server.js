require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// --- Constants ---
const ORDER_TIMES = { General: 30, Billing: 60, Support: 90 }; // seconds
const WINDOWS = [1, 2, 3];

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
    // If customer is VIP, they jump ahead of all normal → wait = sum of VIPs before them
    // If normal, wait = sum of all customers
    if (priority === 'vip') {
        // Only other VIPs ahead matter
        const vipsBefore = result.rows.filter(r => r.priority === 'vip');
        return vipsBefore.reduce((sum, r) => sum + r.order_time, 0);
    } else {
        return result.rows.reduce((sum, r) => sum + r.order_time, 0);
    }
}

// --- POST /add ---
app.post("/add", async (req, res) => {
    try {
        const { name, service = "General", priority = "normal", window_id = null } = req.body;
        const order_time = ORDER_TIMES[service] || 30;

        let assignedWindow = window_id;

        if (!assignedWindow) {
            // Smart assign: pick window with shortest estimated total wait
            let minWait = Infinity;
            for (const w of WINDOWS) {
                const wt = await computeWaitTime(w, priority);
                if (wt < minWait) { minWait = wt; assignedWindow = w; }
            }
        }

        const wait_time = await computeWaitTime(assignedWindow, priority);
        const sql = `INSERT INTO queue (name, service, priority, status, window_id, order_time, wait_time)
                     VALUES ($1, $2, $3, 'waiting', $4, $5, $6) RETURNING *`;
        const result = await db.query(sql, [name, service, priority, assignedWindow, order_time, wait_time]);
        res.status(201).json({ message: "Customer Added", customer: result.rows[0], assigned_window: assignedWindow, estimated_wait: wait_time });
    } catch (err) {
        console.error("Error adding customer:", err);
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
        const windows = [];
        for (const w of WINDOWS) {
            const waitingResult = await db.query(
                `SELECT * FROM queue WHERE status = 'waiting' AND window_id = $1
                 ORDER BY CASE WHEN priority = 'vip' THEN 0 ELSE 1 END ASC, id ASC`,
                [w]
            );
            const rows = waitingResult.rows;
            const current = rows[0] || null;
            const queueLength = rows.length;
            const totalWait = rows.reduce((s, r) => s + r.order_time, 0);
            windows.push({ window_id: w, current, queue_length: queueLength, total_wait: totalWait, queue: rows });
        }
        res.json(windows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- POST /serve/:windowId ---
app.post("/serve/:windowId", async (req, res) => {
    try {
        const windowId = parseInt(req.params.windowId);
        const sql = `UPDATE queue SET status = 'served', served_at = NOW()
                     WHERE id = (
                       SELECT id FROM queue WHERE status = 'waiting' AND window_id = $1
                       ORDER BY CASE WHEN priority = 'vip' THEN 0 ELSE 1 END ASC, id ASC
                       LIMIT 1
                     ) RETURNING *`;
        const result = await db.query(sql, [windowId]);
        if (result.rowCount === 0) return res.status(404).json({ message: "No customers waiting" });
        res.json({ message: "Served", customer: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- POST /auto-advance (tick all windows) ---
app.post("/auto-advance", async (req, res) => {
    try {
        const served = [];
        for (const w of WINDOWS) {
            const sql = `UPDATE queue SET status = 'served', served_at = NOW()
                         WHERE id = (
                           SELECT id FROM queue WHERE status = 'waiting' AND window_id = $1
                           ORDER BY CASE WHEN priority = 'vip' THEN 0 ELSE 1 END ASC, id ASC
                           LIMIT 1
                         ) RETURNING *`;
            const result = await db.query(sql, [w]);
            if (result.rowCount > 0) served.push(result.rows[0]);
        }
        res.json({ message: "Auto advanced", served });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- POST /switch/:customerId (move to a shorter queue) ---
app.post("/switch/:customerId", async (req, res) => {
    try {
        const customerId = parseInt(req.params.customerId);
        const customerResult = await db.query("SELECT * FROM queue WHERE id = $1", [customerId]);
        if (customerResult.rows.length === 0) return res.status(404).json({ message: "Customer not found" });

        const customer = customerResult.rows[0];
        let bestWindow = customer.window_id;
        let minWait = Infinity;
        const fromWait = await computeWaitTime(customer.window_id, customer.priority);

        for (const w of WINDOWS) {
            if (w === customer.window_id) continue;
            const wt = await computeWaitTime(w, customer.priority);
            if (wt < minWait) { minWait = wt; bestWindow = w; }
        }

        if (bestWindow === customer.window_id) {
            return res.json({ message: "Already in optimal queue", switched: false });
        }

        await db.query("UPDATE queue SET window_id = $1, wait_time = $2 WHERE id = $3",
            [bestWindow, minWait, customerId]);
        res.json({ message: "Switched", from: customer.window_id, to: bestWindow, from_wait: fromWait, new_wait: minWait, switched: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- POST /abandon (mark customers abandoned if wait too long) ---
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
        res.json({ message: "Database reset successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));