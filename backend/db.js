const { Pool } = require("pg");

const pool = new Pool({
    host: "localhost",
    user: "nakul",
    password: "nakulk",
    database: "queue_db",
    port: 5432
});

pool.connect((err, client, release) => {
    if (err) throw err;
    console.log("PostgreSQL Connected");
    release();
});

module.exports = pool;