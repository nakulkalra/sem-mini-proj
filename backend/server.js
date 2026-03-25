const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// Add customer
app.post("/add", (req, res) => {
    const { name, service } = req.body;

    const sql = "INSERT INTO queue (name, service) VALUES ($1, $2)";
    db.query(sql, [name, service], (err, result) => {
        if (err) throw err;
        res.send("Customer Added");
    });
});

// Get queue
app.get("/queue", (req, res) => {
    db.query("SELECT * FROM queue ORDER BY id ASC", (err, result) => {
        if (err) throw err;
        res.json(result.rows);
    });
});

// Serve next customer
app.post("/serve", (req, res) => {
    const sql = "DELETE FROM queue WHERE id = (SELECT id FROM queue ORDER BY id ASC LIMIT 1)";
    db.query(sql, (err, result) => {
        if (err) throw err;
        res.send("Served");
    });
});

app.listen(5000, () => console.log("Server running on port 5000"));