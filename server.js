require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");

const app = express();

app.use(cors());
app.use(express.json());

// MySQL connection
const db = mysql.createConnection({
    host: process.env.MYSQL_HOST || process.env.MYSQLHOST || "localhost",
    port: process.env.MYSQL_PORT || process.env.MYSQLPORT || 3306,
    user: process.env.MYSQL_USER || process.env.MYSQLUSER || "root",
    password: process.env.MYSQL_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || process.env.MYSQLPASSWORD || "",
    database: process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE || "fix_now"
});

db.connect((err) => {
    if (err) {
        console.error("MySQL connection failed:", err);
        return;
    }

    console.log("MySQL connected successfully!");
});

// Test route
app.get("/", (req, res) => {
    res.json({
        message: "Fix Now backend is running!"
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
});