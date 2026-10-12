
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
    port: Number(process.env.MYSQL_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.MYSQL_USER || process.env.MYSQLUSER || "root",
    password:
        process.env.MYSQL_PASSWORD ||
        process.env.MYSQL_ROOT_PASSWORD ||
        process.env.MYSQLPASSWORD ||
        "",
    database:
        process.env.MYSQL_DATABASE ||
        process.env.MYSQLDATABASE ||
        "fix_now"
});

// Connect to MySQL
db.connect((err) => {
    if (err) {
        console.error("MySQL connection failed:", err.message);
        return;
    }

    console.log("MySQL connected successfully!");
});

// Health-check route
app.get("/", (req, res) => {
    res.json({
        message: "Fix Now backend is running!"
    });
});

// Search service providers
// Example: GET /providers/search?service=Plumber
// Optional: GET /providers/search?service=Plumber&location=Chennai
app.get("/providers/search", (req, res) => {
    const service = req.query.service;
    const location = req.query.location;

    if (typeof service !== "string" || !service.trim()) {
        return res.status(400).json({
            message: "Please enter a service type."
        });
    }

    let sql = `
        SELECT id, name, phone, service_type, location
        FROM providers
        WHERE service_type LIKE ?
    `;

    const params = [`%${service.trim()}%`];

    if (typeof location === "string" && location.trim()) {
        sql += " AND location LIKE ?";
        params.push(`%${location.trim()}%`);
    }

    sql += " ORDER BY name ASC";

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error("Provider search failed:", err.message);

            return res.status(500).json({
                message: "Unable to search providers. Please try again."
            });
        }

        return res.json({
            count: results.length,
            providers: results
        });
    });
});

// Register a new service provider
app.post("/providers", (req, res) => {
    const { name, phone, service_type, location } = req.body;

    if (!name || !phone || !service_type || !location) {
        return res.status(400).json({
            message: "Please fill in all provider details."
        });
    }

    const sql = `
        INSERT INTO providers (name, phone, service_type, location)
        VALUES (?, ?, ?, ?)
    `;

    db.query(
        sql,
        [name.trim(), phone.trim(), service_type.trim(), location.trim()],
        (err, result) => {
            if (err) {
                console.error("Provider registration failed:", err.message);

                return res.status(500).json({
                    message: "Unable to register provider."
                });
            }

            return res.status(201).json({
                message: "Provider registered successfully!",
                providerId: result.insertId
            });
        }
    );
});
// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
