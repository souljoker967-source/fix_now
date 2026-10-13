require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");

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

db.connect((err) => {
    if (err) {
        console.error("MySQL connection failed:", err.message);
        return;
    }

    console.log("MySQL connected successfully!");
});

// Health check
app.get("/", (req, res) => {
    res.json({ message: "Fix Now backend is running!" });
});

// Search providers
app.get("/providers/search", (req, res) => {
    const { service, location } = req.query;

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
                message: "Unable to search providers."
            });
        }

        return res.json({
            count: results.length,
            providers: results
        });
    });
});

// Register or update a provider profile linked to a login account
app.post("/providers", (req, res) => {
    const { user_id, name, phone, service_type, location } = req.body;

    if (
        !Number.isInteger(Number(user_id)) ||
        Number(user_id) <= 0 ||
        !name?.trim() ||
        !phone?.trim() ||
        !service_type?.trim() ||
        !location?.trim()
    ) {
        return res.status(400).json({
            message: "Please fill in all provider details."
        });
    }

    db.query(
        "SELECT id FROM users WHERE id = ? AND account_type = 'provider' LIMIT 1",
        [Number(user_id)],
        (err, users) => {
            if (err) {
                console.error("Provider account lookup failed:", err.message);
                return res.status(500).json({
                    message: "Unable to verify provider account."
                });
            }

            if (!users.length) {
                return res.status(400).json({
                    message: "Provider account not found."
                });
            }

            const sql = `
                INSERT INTO providers
                    (user_id, name, phone, service_type, location)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    phone = VALUES(phone),
                    service_type = VALUES(service_type),
                    location = VALUES(location)
            `;

            db.query(
                sql,
                [
                    Number(user_id),
                    name.trim(),
                    phone.trim(),
                    service_type.trim(),
                    location.trim()
                ],
                (saveErr) => {
                    if (saveErr) {
                        console.error("Provider profile save failed:", saveErr.message);
                        return res.status(500).json({
                            message: "Unable to save provider profile."
                        });
                    }

                    db.query(
                        "SELECT id FROM providers WHERE user_id = ? LIMIT 1",
                        [Number(user_id)],
                        (findErr, rows) => {
                            if (findErr || !rows.length) {
                                console.error(
                                    "Provider profile lookup failed:",
                                    findErr?.message
                                );
                                return res.status(500).json({
                                    message: "Unable to retrieve provider profile."
                                });
                            }

                            return res.json({
                                message: "Provider profile saved successfully!",
                                providerId: rows[0].id
                            });
                        }
                    );
                }
            );
        }
    );
});

// Get a provider profile by login user ID
app.get("/providers/by-user/:userId", (req, res) => {
    db.query(
        `SELECT id, user_id, name, phone, service_type, location
         FROM providers WHERE user_id = ? LIMIT 1`,
        [req.params.userId],
        (err, rows) => {
            if (err) {
                console.error("Provider profile lookup failed:", err.message);
                return res.status(500).json({
                    message: "Unable to retrieve provider profile."
                });
            }

            if (!rows.length) {
                return res.json({ provider: null });
            }

            return res.json({ provider: rows[0] });
        }
    );
});

// Register customer or provider account
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
        const hashedPassword = await bcrypt.hash(String(password), 10);

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
                        phone: String(phone).trim(),
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

// Log in
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "Email and password are required."
        });
    }

    db.query(
        `SELECT id, name, email, phone, password, account_type
         FROM users WHERE email = ? LIMIT 1`,
        [String(email).trim().toLowerCase()],
        async (err, results) => {
            if (err) {
                console.error("Login failed:", err.message);
                return res.status(500).json({
                    message: "Unable to log in."
                });
            }

            if (!results.length) {
                return res.status(401).json({
                    message: "Invalid email or password."
                });
            }

            try {
                const user = results[0];
                const validPassword = await bcrypt.compare(
                    String(password),
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
    const customerId = Number(customer_id);
    const providerId = Number(provider_id);

    if (
        !Number.isInteger(customerId) ||
        customerId <= 0 ||
        !Number.isInteger(providerId) ||
        providerId <= 0
    ) {
        return res.status(400).json({
            message: "Valid customer and provider IDs are required."
        });
    }

    const sql = `
        INSERT INTO bookings (customer_id, provider_id, problem, status)
        SELECT u.id, p.id, ?, 'Pending'
        FROM users u
        JOIN providers p ON p.id = ?
        WHERE u.id = ? AND u.account_type = 'customer'
    `;

    db.query(
        sql,
        [problem?.trim() || null, providerId, customerId],
        (err, result) => {
            if (err) {
                console.error("Booking creation failed:", err.message);
                return res.status(500).json({
                    message: "Unable to create booking."
                });
            }

            if (!result.affectedRows) {
                return res.status(400).json({
                    message: "Customer or provider was not found."
                });
            }

            return res.status(201).json({
                message: "Booking created successfully!",
                booking: {
                    id: result.insertId,
                    customer_id: customerId,
                    provider_id: providerId,
                    problem: problem?.trim() || null,
                    status: "Pending"
                }
            });
        }
    );
});

// Get customer bookings
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

// Get bookings for the provider's login user ID
app.get("/bookings/provider/:id", (req, res) => {
    const sql = `
        SELECT b.id, b.customer_id, b.provider_id, b.problem,
               b.status, b.created_at,
               u.name AS customer_name, u.phone AS customer_phone
        FROM bookings b
        JOIN users u ON b.customer_id = u.id
        JOIN providers p ON b.provider_id = p.id
        WHERE p.user_id = ?
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

// Update a booking status using the actual provider profile ID
app.patch("/bookings/:id/status", (req, res) => {
    const { status, provider_id } = req.body;
    const allowedStatuses = ["Accepted", "Rejected", "Completed"];
    const providerId = Number(provider_id);
    const bookingId = Number(req.params.id);

    if (
        !allowedStatuses.includes(status) ||
        !Number.isInteger(providerId) ||
        providerId <= 0 ||
        !Number.isInteger(bookingId) ||
        bookingId <= 0
    ) {
        return res.status(400).json({
            message: "Valid booking, provider, and status are required."
        });
    }

    const sql = `
        UPDATE bookings b
        JOIN providers p ON p.id = b.provider_id
        SET b.status = ?
        WHERE b.id = ?
          AND p.id = ?
          AND b.status = ?
          AND (
              (? = 'Completed' AND b.status = 'Accepted')
              OR (? IN ('Accepted', 'Rejected') AND b.status = 'Pending')
          )
    `;

    db.query(
        sql,
        [
            status,
            bookingId,
            providerId,
            status === "Completed" ? "Accepted" : "Pending",
            status,
            status
        ],
        (err, result) => {
            if (err) {
                console.error("Booking status update failed:", err.message);
                return res.status(500).json({
                    message: "Unable to update booking."
                });
            }

            if (!result.affectedRows) {
                return res.status(404).json({
                    message: "Booking not found or its status cannot be changed."
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