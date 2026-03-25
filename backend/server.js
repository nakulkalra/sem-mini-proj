require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// Add customer
app.post("/add", async (req, res) => {
    try {
        const { name, service } = req.body;
        const sql = "INSERT INTO queue (name, service, status) VALUES ($1, $2, 'waiting') RETURNING *";
        const result = await db.query(sql, [name, service]);
        res.status(201).json({ message: "Customer Added", customer: result.rows[0] });
    } catch (err) {
        console.error("Error adding customer:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Get queue
app.get("/queue", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM queue WHERE status = 'waiting' ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        console.error("Error getting queue:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Get served customers
app.get("/served", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM queue WHERE status = 'served' ORDER BY id DESC LIMIT 50");
        res.json(result.rows);
    } catch (err) {
        console.error("Error getting served customers:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Serve next customer
app.post("/serve", async (req, res) => {
    try {
        const sql = "UPDATE queue SET status = 'served' WHERE id = (SELECT id FROM queue WHERE status = 'waiting' ORDER BY id ASC LIMIT 1) RETURNING *";
        const result = await db.query(sql);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ message: "No customers waiting" });
        }
        res.json({ message: "Served", customer: result.rows[0] });
    } catch (err) {
        console.error("Error serving customer:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Reset database
app.post("/reset", async (req, res) => {
    try {
        await db.query("TRUNCATE TABLE queue RESTART IDENTITY");
        res.json({ message: "Database reset successfully" });
    } catch (err) {
        console.error("Error resetting database:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));