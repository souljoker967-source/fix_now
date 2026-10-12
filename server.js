
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
// Register a customer or service provider account
app.post("/register", async (req, res) => {
    const { name, email, phone, password, account_type } = req.body;

    if (!name || !email || !phone || !password) {
        return res.status(400).json({
            message: "Please fill in all required fields."
        });
    }

    const type = account_type || "customer";

    if (!["customer", "provider"].includes(type)) {
        return res.status(400).json({
            message: "Invalid account type."
        });
    }

    if (String(password).length < 8) {
        return res.status(400).json({
            message: "Password must be at least 8 characters."
        });
    }

    try {
        const hashedPassword = await require("bcryptjs").hash(password, 10);

        const sql = `
            INSERT INTO users (name, email, phone, password, account_type)
            VALUES (?, ?, ?, ?, ?)
        `;

        db.query(
            sql,
            [
                String(name).trim(),
                String(email).trim().toLowerCase(),
                String(phone).trim(),
                hashedPassword,
                type
            ],
            (err, result) => {
                if (err) {
                    if (err.code === "ER_DUP_ENTRY") {
                        return res.status(409).json({
                            message: "That email or phone number is already registered."
                        });
                    }

                    console.error("Registration failed:", err.message);
                    return res.status(500).json({
                        message: "Unable to create account."
                    });
                }

                return res.status(201).json({
                    message: "Account created successfully!",
                    user: {
                        id: result.insertId,
                        name: String(name).trim(),
                        email: String(email).trim().toLowerCase(),
                        account_type: type
                    }
                });
            }
        );
    } catch (err) {
        console.error("Password hashing failed:", err.message);
        return res.status(500).json({
            message: "Unable to create account."
        });
    }
});

// Log in to an existing account
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "Email and password are required."
        });
    }

    db.query(
        "SELECT id, name, email, phone, password, account_type FROM users WHERE email = ? LIMIT 1",
        [String(email).trim().toLowerCase()],
        async (err, results) => {
            if (err) {
                console.error("Login failed:", err.message);
                return res.status(500).json({
                    message: "Unable to log in."
                });
            }

            if (results.length === 0) {
                return res.status(401).json({
                    message: "Invalid email or password."
                });
            }

            try {
                const user = results[0];
                const validPassword = await require("bcryptjs").compare(
                    password,
                    user.password
                );

                if (!validPassword) {
                    return res.status(401).json({
                        message: "Invalid email or password."
                    });
                }

                return res.json({
                    message: "Login successful!",
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        phone: user.phone,
                        account_type: user.account_type
                    }
                });
            } catch (compareError) {
                console.error("Password verification failed:", compareError.message);
                return res.status(500).json({
                    message: "Unable to log in."
                });
            }
        }
    );
});
// Create a booking
app.post("/bookings", (req, res) => {
    const { customer_id, provider_id, problem } = req.body;

    if (!customer_id || !provider_id) {
        return res.status(400).json({
            message: "Customer ID and provider ID are required."
        });
    }

    const sql = `
        INSERT INTO bookings (customer_id, provider_id, problem, status)
        SELECT u.id, p.id, ?, 'Pending'
        FROM users u
        CROSS JOIN providers p
        WHERE u.id = ? AND p.id = ?
        AND u.account_type = 'customer'
    `;

    db.query(
        sql,
        [problem || null, customer_id, provider_id],
        (err, result) => {
            if (err) {
                console.error("Booking creation failed:", err.message);
                return res.status(500).json({
                    message: "Unable to create booking."
                });
            }

            if (result.affectedRows === 0) {
                return res.status(400).json({
                    message: "Customer or provider was not found."
                });
            }

            return res.status(201).json({
                message: "Booking created successfully!",
                booking: {
                    id: result.insertId,
                    customer_id,
                    provider_id,
                    problem: problem || null,
                    status: "Pending"
                }
            });
        }
    );
});

// Get bookings for a customer
app.get("/bookings/customer/:id", (req, res) => {
    const sql = `
        SELECT b.id, b.customer_id, b.provider_id, b.problem,
               b.status, b.created_at,
               p.name AS provider_name, p.phone AS provider_phone,
               p.service_type, p.location
        FROM bookings b
        JOIN providers p ON b.provider_id = p.id
        WHERE b.customer_id = ?
        ORDER BY b.created_at DESC
    `;

    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error("Customer bookings failed:", err.message);
            return res.status(500).json({
                message: "Unable to retrieve bookings."
            });
        }

        return res.json({ bookings: results });
    });
});

// Get bookings for a provider (use the providers table ID)
app.get("/bookings/provider/:id", (req, res) => {
    const sql = `
        SELECT b.id, b.customer_id, b.provider_id, b.problem,
               b.status, b.created_at,
               u.name AS customer_name, u.phone AS customer_phone
        FROM bookings b
        JOIN users u ON b.customer_id = u.id
        WHERE b.provider_id = ?
        ORDER BY b.created_at DESC
    `;

    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error("Provider bookings failed:", err.message);
            return res.status(500).json({
                message: "Unable to retrieve bookings."
            });
        }

        return res.json({ bookings: results });
    });
});

// Update booking status
app.patch("/bookings/:id/status", (req, res) => {
    const { status, provider_id } = req.body;
    const allowedStatuses = ["Accepted", "Rejected", "Completed"];

    if (!allowedStatuses.includes(status) || !provider_id) {
        return res.status(400).json({
            message: "A valid status and provider ID are required."
        });
    }

    const sql = `
        UPDATE bookings
        SET status = ?
        WHERE id = ? AND provider_id = ? AND status = 'Pending'
    `;

    db.query(
        sql,
        [status, req.params.id, provider_id],
        (err, result) => {
            if (err) {
                console.error("Booking status update failed:", err.message);
                return res.status(500).json({
                    message: "Unable to update booking."
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    message: "Pending booking not found for this provider."
                });
            }

            return res.json({
                message: `Booking ${status.toLowerCase()} successfully.`,
                status
            });
        }
    );
});
// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
