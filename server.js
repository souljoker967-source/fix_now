
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");

const app = express();
app.use(cors());
app.use(express.json());

const mysqlHost =
  process.env.MYSQL_HOST || process.env.MYSQLHOST || "localhost";
const mysqlSslSetting = process.env.MYSQL_SSL?.toLowerCase();
const mysqlSslCa = process.env.MYSQL_SSL_CA;
const mysqlSslEnabled =
  mysqlSslSetting === "true" ||
  (mysqlSslSetting === undefined &&
    !["localhost", "127.0.0.1"].includes(mysqlHost));

const db = mysql.createPool({
  host: mysqlHost,
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
    "fix_now",
  ssl: mysqlSslEnabled
    ? {
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
        verifyIdentity: true,
        ...(mysqlSslCa ? { ca: mysqlSslCa.replace(/\\n/g, "\n") } : {}),
      }
    : null,
  waitForConnections: true,
  connectionLimit: 10,
});

const AUTH_TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

function getAuthTokenSecret() {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("AUTH_TOKEN_SECRET must be configured with at least 32 bytes.");
  }
  return secret;
}

function createAuthToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: Number(user.id),
      account_type: user.account_type,
      iat: now,
      exp: now + AUTH_TOKEN_LIFETIME_SECONDS,
    })
  ).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const signature = crypto
    .createHmac("sha256", getAuthTokenSecret())
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

function verifyAuthToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerPart, payloadPart, signaturePart] = parts;
  const signingInput = `${headerPart}.${payloadPart}`;
  const expectedSignature = crypto
    .createHmac("sha256", getAuthTokenSecret())
    .update(signingInput)
    .digest();
  let suppliedSignature;
  let header;
  let payload;

  try {
    suppliedSignature = Buffer.from(signaturePart, "base64url");
    header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    header.alg !== "HS256" ||
    suppliedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(suppliedSignature, expectedSignature) ||
    !Number.isInteger(payload.sub) ||
    payload.sub <= 0 ||
    !["customer", "provider"].includes(payload.account_type) ||
    !Number.isInteger(payload.exp) ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return { id: payload.sub, account_type: payload.account_type };
}

function authenticateToken(req, res, next) {
  const authorization = req.get("authorization");
  const match = typeof authorization === "string"
    ? authorization.match(/^Bearer ([^\s]+)$/i)
    : null;

  if (!match) {
    return res.status(401).json({ message: "Authentication is required." });
  }

  try {
    const user = verifyAuthToken(match[1]);
    if (!user) {
      return res.status(401).json({ message: "Your session is invalid or expired." });
    }
    req.authUser = user;
    return next();
  } catch (error) {
    return res.status(503).json({ message: error.message });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.authUser.account_type !== role) {
      return res.status(403).json({ message: "You do not have access to this resource." });
    }
    return next();
  };
}

function getSafeDatabaseCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
    ? error.code
    : "DATABASE_ERROR";
}

function logDatabaseFailure(operation, error) {
  const diagnosticId = crypto.randomUUID();
  const code = getSafeDatabaseCode(error);

  console.error(
    `${operation} database request failed (ref=${diagnosticId}, code=${code}, errno=${error?.errno ?? "unknown"}, sqlState=${error?.sqlState ?? "unknown"}).`
  );

  return { diagnosticId, code };
}

function registrationDatabaseError(error) {
  const { diagnosticId, code } = logDatabaseFailure("Registration", error);
  const schemaErrors = new Set([
    "ER_BAD_FIELD_ERROR",
    "ER_BAD_NULL_ERROR",
    "ER_NO_DEFAULT_FOR_FIELD",
    "ER_NO_SUCH_TABLE",
  ]);
  const availabilityErrors = new Set([
    "ECONNREFUSED",
    "ER_CON_COUNT_ERROR",
    "ER_LOCK_WAIT_TIMEOUT",
    "ETIMEDOUT",
    "PROTOCOL_CONNECTION_LOST",
  ]);

  if (code === "ER_DUP_ENTRY") {
    return {
      status: 409,
      message: "That email or phone number is already registered.",
    };
  }
  if (code === "ER_DATA_TOO_LONG" || code === "WARN_DATA_TRUNCATED") {
    return {
      status: 400,
      message: "One or more registration details are too long. Please shorten them and try again.",
    };
  }
  if (schemaErrors.has(code)) {
    return {
      status: 500,
      message: `Account setup is incomplete (${code}). Please contact support with reference ${diagnosticId}.`,
    };
  }
  if (availabilityErrors.has(code)) {
    return {
      status: 503,
      message: "Account service is temporarily unavailable. Please try again shortly.",
    };
  }
  return {
    status: 500,
    message: `Unable to create account right now (${code}). Please contact support with reference ${diagnosticId}.`,
  };
}

function formatMysqlConnectionError(error) {
  let message = error.message;
  const credentials = [
    process.env.MYSQL_USER,
    process.env.MYSQLUSER,
    process.env.MYSQL_PASSWORD,
    process.env.MYSQL_ROOT_PASSWORD,
    process.env.MYSQLPASSWORD,
  ].filter(Boolean);

  for (const credential of credentials) {
    message = message.split(credential).join("[REDACTED]");
  }

  return error.code ? `${error.code}: ${message}` : message;
}

const testConnectionOnly = process.argv.includes("--test-db");

function startServer() {
  if (testConnectionOnly && mysqlSslSetting !== "true") {
    console.error("MySQL connection test requires MYSQL_SSL=true.");
    db.end(() => {
      process.exitCode = 1;
    });
    return;
  }

  db.getConnection((err, connection) => {
    if (err) {
      console.error(
        "MySQL connection failed:",
        formatMysqlConnectionError(err)
      );
      db.end((endError) => {
        if (endError) {
          console.error("MySQL pool shutdown failed:", endError.message);
        }
        process.exitCode = 1;
      });
      return;
    }

    connection.release();
    if (testConnectionOnly) {
      console.log("MySQL connection successful (TLS enabled).");
      db.end((endError) => {
        if (endError) {
          console.error("MySQL pool shutdown failed:", endError.message);
          process.exitCode = 1;
        }
      });
      return;
    }

    console.log(
      `MySQL connected successfully (TLS ${mysqlSslEnabled ? "enabled" : "disabled"}).`
    );
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  });
}

if (require.main === module) {
  startServer();
}

app.get("/", (req, res) => {
  res.json({ message: "Fix Now backend is running!" });
});

// Search providers by service, optional location, availability and GPS radius.
app.get("/providers/search", authenticateToken, requireRole("customer"), (req, res) => {
  const { service, location, lat, lon, radiusKm, availableOnly } = req.query;

  if (typeof service !== "string" || !service.trim()) {
    return res.status(400).json({ message: "Please enter a service type." });
  }

  const hasLat = lat !== undefined && lat !== "";
  const hasLon = lon !== undefined && lon !== "";

  if (hasLat !== hasLon) {
    return res.status(400).json({
      message: "Both latitude and longitude are required for nearby search.",
    });
  }

  const userLat = Number(lat);
  const userLon = Number(lon);
  const radius = radiusKm === undefined ? 10 : Number(radiusKm);

  if (
    hasLat &&
    (!Number.isFinite(userLat) ||
      !Number.isFinite(userLon) ||
      userLat < -90 ||
      userLat > 90 ||
      userLon < -180 ||
      userLon > 180)
  ) {
    return res.status(400).json({ message: "Invalid GPS coordinates." });
  }

  if (!Number.isFinite(radius) || radius <= 0 || radius > 200) {
    return res.status(400).json({
      message: "Search radius must be between 1 and 200 km.",
    });
  }

  const distanceSql = hasLat
    ? `(
        6371 * ACOS(
          LEAST(1, GREATEST(-1,
            COS(RADIANS(?)) * COS(RADIANS(latitude)) *
            COS(RADIANS(longitude) - RADIANS(?)) +
            SIN(RADIANS(?)) * SIN(RADIANS(latitude))
          ))
        )
      )`
    : "NULL";

  let sql = `
    SELECT id, user_id, name, phone, service_type, location,
           latitude, longitude, is_available,
           ${distanceSql} AS distance_km
    FROM providers
    WHERE service_type LIKE ?
  `;

  const params = hasLat ? [userLat, userLon, userLat] : [];
  params.push(`%${service.trim()}%`);

  if (typeof location === "string" && location.trim()) {
    sql += " AND location LIKE ?";
    params.push(`%${location.trim()}%`);
  }

  if (String(availableOnly).toLowerCase() === "true") {
    sql += " AND is_available = 1";
  }

  if (hasLat) {
    sql += " AND latitude IS NOT NULL AND longitude IS NOT NULL";
    sql += ` AND ${distanceSql} <= ?`;
    params.push(userLat, userLon, userLat, radius);
    sql += ` ORDER BY is_available DESC, distance_km ASC, name ASC`;
  } else {
    sql += " ORDER BY is_available DESC, name ASC";
  }

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error("Provider search failed:", err.message);
      return res.status(500).json({ message: "Unable to search providers." });
    }

    res.json({
      count: rows.length,
      providers: rows.map((provider) => ({
        ...provider,
        distance_km:
          provider.distance_km == null
            ? null
            : Number(Number(provider.distance_km).toFixed(2)),
        is_available: Boolean(provider.is_available),
      })),
    });
  });
});

// Register or update a provider profile.
app.post("/providers", authenticateToken, requireRole("provider"), (req, res) => {
  const {
    name,
    phone,
    service_type,
    location,
    latitude,
    longitude,
    is_available,
  } = req.body;

  const userId = req.authUser.id;
  const hasLat = latitude !== undefined && latitude !== null && latitude !== "";
  const hasLon = longitude !== undefined && longitude !== null && longitude !== "";

  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof phone !== "string" ||
    !phone.trim() ||
    typeof service_type !== "string" ||
    !service_type.trim() ||
    typeof location !== "string" ||
    !location.trim()
  ) {
    return res.status(400).json({
      message: "Please fill in all provider details.",
    });
  }

  if (hasLat !== hasLon) {
    return res.status(400).json({
      message: "Both latitude and longitude must be provided together.",
    });
  }

  if (
    hasLat &&
    (!Number.isFinite(Number(latitude)) ||
      !Number.isFinite(Number(longitude)) ||
      Number(latitude) < -90 ||
      Number(latitude) > 90 ||
      Number(longitude) < -180 ||
      Number(longitude) > 180)
  ) {
    return res.status(400).json({ message: "Invalid GPS coordinates." });
  }

  db.query(
    "SELECT id FROM users WHERE id = ? AND account_type = 'provider' LIMIT 1",
    [userId],
    (err, users) => {
      if (err) {
        console.error("Provider account lookup failed:", err.message);
        return res.status(500).json({
          message: "Unable to verify provider account.",
        });
      }

      if (!users.length) {
        return res.status(400).json({ message: "Provider account not found." });
      }

      const sql = `
        INSERT INTO providers
          (user_id, name, phone, service_type, location,
           latitude, longitude, is_available)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          phone = VALUES(phone),
          service_type = VALUES(service_type),
          location = VALUES(location),
          latitude = VALUES(latitude),
          longitude = VALUES(longitude),
          is_available = VALUES(is_available)
      `;

      const availability =
        is_available === undefined ? 1 : Number(Boolean(is_available));

      db.query(
        sql,
        [
          userId,
          name.trim(),
          phone.trim(),
          service_type.trim(),
          location.trim(),
          hasLat ? Number(latitude) : null,
          hasLon ? Number(longitude) : null,
          availability,
        ],
        (saveErr) => {
          if (saveErr) {
            console.error("Provider profile save failed:", saveErr.message);
            return res.status(500).json({
              message: "Unable to save provider profile.",
            });
          }

          db.query(
            `SELECT id FROM providers WHERE user_id = ? LIMIT 1`,
            [userId],
            (findErr, rows) => {
              if (findErr || !rows.length) {
                return res.status(500).json({
                  message: "Unable to retrieve provider profile.",
                });
              }

              res.json({
                message: "Provider profile saved successfully!",
                providerId: rows[0].id,
              });
            }
          );
        }
      );
    }
  );
});

// Load provider profile.
app.get(
  "/providers/by-user/:userId",
  authenticateToken,
  requireRole("provider"),
  (req, res) => {
  if (Number(req.params.userId) !== req.authUser.id) {
    return res.status(403).json({ message: "You cannot access another provider profile." });
  }

  db.query(
    `SELECT id, user_id, name, phone, service_type, location,
            latitude, longitude, is_available
     FROM providers WHERE user_id = ? LIMIT 1`,
    [req.authUser.id],
    (err, rows) => {
      if (err) {
        console.error("Provider profile lookup failed:", err.message);
        return res.status(500).json({
          message: "Unable to retrieve provider profile.",
        });
      }

      res.json({ provider: rows[0] || null });
    }
  );
});

// Change provider availability. Only the linked account can update its profile.
app.patch(
  "/providers/:id/availability",
  authenticateToken,
  requireRole("provider"),
  (req, res) => {
  const providerId = Number(req.params.id);
  const userId = req.authUser.id;
  const available = req.body.is_available;

  if (
    !Number.isInteger(providerId) ||
    providerId <= 0 ||
    typeof available !== "boolean"
  ) {
    return res.status(400).json({
      message: "Provider, user, and availability are required.",
    });
  }

  db.query(
    `UPDATE providers
     SET is_available = ?
     WHERE id = ? AND user_id = ?`,
    [available ? 1 : 0, providerId, userId],
    (err, result) => {
      if (err) {
        console.error("Availability update failed:", err.message);
        return res.status(500).json({
          message: "Unable to update availability.",
        });
      }

      if (!result.affectedRows) {
        // MySQL may report zero changed rows when the value is unchanged.
        return db.query(
          "SELECT id FROM providers WHERE id = ? AND user_id = ?",
          [providerId, userId],
          (checkErr, rows) => {
            if (checkErr || !rows.length) {
              return res.status(404).json({
                message: "Provider profile not found.",
              });
            }
            res.json({
              message: "Availability saved.",
              is_available: available,
            });
          }
        );
      }

      res.json({
        message: "Availability updated successfully.",
        is_available: available,
      });
    }
  );
});

// Register customer or provider account.
app.post("/register", async (req, res) => {
  const { name, email, phone, password, account_type } = req.body;

  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof phone !== "string" ||
    !phone.trim() ||
    typeof password !== "string" ||
    !password
  ) {
    return res.status(400).json({
      message: "Please fill in all required fields.",
    });
  }

  const type = account_type || "customer";

  if (!["customer", "provider"].includes(type)) {
    return res.status(400).json({ message: "Invalid account type." });
  }

  if (password.length < 8) {
    return res.status(400).json({
      message: "Password must be at least 8 characters.",
    });
  }

  try {
    getAuthTokenSecret();
  } catch (error) {
    return res.status(503).json({ message: error.message });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      `INSERT INTO users (name, email, phone, password, account_type)
       VALUES (?, ?, ?, ?, ?)`,
      [
        String(name).trim(),
        String(email).trim().toLowerCase(),
        String(phone).trim(),
        hashedPassword,
        type,
      ],
      (err, result) => {
        if (err) {
          const failure = registrationDatabaseError(err);
          return res.status(failure.status).json({ message: failure.message });
        }

        const user = {
          id: result.insertId,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          account_type: type,
        };
        res.status(201).json({
          message: "Account created successfully!",
          user,
          token: createAuthToken(user),
        });
      }
    );
  } catch (err) {
    const diagnosticId = crypto.randomUUID();
    console.error(`Password hashing failed (ref=${diagnosticId}).`);
    res.status(500).json({
      message: `Unable to prepare your account. Please contact support with reference ${diagnosticId}.`,
    });
  }
});

// Log in.
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (
    typeof email !== "string" ||
    !email.trim() ||
    typeof password !== "string" ||
    !password
  ) {
    return res.status(400).json({
      message: "Email and password are required.",
    });
  }

  try {
    getAuthTokenSecret();
  } catch (error) {
    return res.status(503).json({ message: error.message });
  }

  db.query(
    `SELECT id, name, email, phone, password, account_type
     FROM users WHERE email = ? LIMIT 1`,
    [String(email).trim().toLowerCase()],
    async (err, results) => {
      if (err) {
        const diagnostic = logDatabaseFailure("Login", err);
        return res.status(500).json({
          message: `Unable to read account data (${diagnostic.code}). Please contact support with reference ${diagnostic.diagnosticId}.`,
        });
      }

      if (!results.length) {
        return res.status(401).json({
          message: "Invalid email or password.",
        });
      }

      try {
        const user = results[0];
        const validPassword = await bcrypt.compare(
          password,
          user.password
        );

        if (!validPassword) {
          return res.status(401).json({
            message: "Invalid email or password.",
          });
        }

        const publicUser = {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          account_type: user.account_type,
        };
        res.json({
          message: "Login successful!",
          user: publicUser,
          token: createAuthToken(publicUser),
        });
      } catch (compareError) {
        console.error("Password verification failed:", compareError.message);
        res.status(500).json({ message: "Unable to log in." });
      }
    }
  );
});

app.get("/auth/me", authenticateToken, (req, res) => {
  db.query(
    `SELECT id, name, email, phone, account_type
     FROM users WHERE id = ? LIMIT 1`,
    [req.authUser.id],
    (err, rows) => {
      if (err) {
        console.error("Session validation failed:", err.message);
        return res.status(500).json({ message: "Unable to validate your session." });
      }
      if (!rows.length) {
        return res.status(401).json({ message: "Your account no longer exists." });
      }
      return res.json({ user: rows[0] });
    }
  );
});

// Create a booking.
app.post("/bookings", authenticateToken, requireRole("customer"), (req, res) => {
  const { customer_id, provider_id, problem } = req.body;
  const customerId = req.authUser.id;
  const providerId = Number(provider_id);

  if (
    !Number.isInteger(providerId) ||
    providerId <= 0
  ) {
    return res.status(400).json({
      message: "Valid customer and provider IDs are required.",
    });
  }

  db.query(
    `INSERT INTO bookings (customer_id, provider_id, problem, status)
     SELECT u.id, p.id, ?, 'Pending'
     FROM users u
     JOIN providers p ON p.id = ?
     WHERE u.id = ? AND u.account_type = 'customer'`,
    [typeof problem === "string" ? problem.trim() || null : null, providerId, customerId],
    (err, result) => {
      if (err) {
        console.error("Booking creation failed:", err.message);
        return res.status(500).json({ message: "Unable to create booking." });
      }

      if (!result.affectedRows) {
        return res.status(400).json({
          message: "Customer or provider was not found.",
        });
      }

      res.status(201).json({
        message: "Booking created successfully!",
        booking: {
          id: result.insertId,
          customer_id: customerId,
          provider_id: providerId,
          problem: typeof problem === "string" ? problem.trim() || null : null,
          status: "Pending",
        },
      });
    }
  );
});

// Customer booking history.
app.get(
  "/bookings/customer/:id",
  authenticateToken,
  requireRole("customer"),
  (req, res) => {
  if (Number(req.params.id) !== req.authUser.id) {
    return res.status(403).json({ message: "You cannot access another customer's bookings." });
  }

  db.query(
    `SELECT b.id, b.customer_id, b.provider_id, b.problem,
            b.status, b.created_at,
            p.name AS provider_name, p.phone AS provider_phone,
            p.service_type, p.location
     FROM bookings b
     JOIN providers p ON b.provider_id = p.id
     WHERE b.customer_id = ?
     ORDER BY b.created_at DESC`,
    [req.authUser.id],
    (err, results) => {
      if (err) {
        console.error("Customer bookings failed:", err.message);
        return res.status(500).json({
          message: "Unable to retrieve bookings.",
        });
      }
      res.json({ bookings: results });
    }
  );
});

// Provider booking list uses the provider's login user ID.
app.get(
  "/bookings/provider/:id",
  authenticateToken,
  requireRole("provider"),
  (req, res) => {
  if (Number(req.params.id) !== req.authUser.id) {
    return res.status(403).json({ message: "You cannot access another provider's bookings." });
  }

  db.query(
    `SELECT b.id, b.customer_id, b.provider_id, b.problem,
            b.status, b.created_at,
            u.name AS customer_name, u.phone AS customer_phone
     FROM bookings b
     JOIN users u ON b.customer_id = u.id
     JOIN providers p ON b.provider_id = p.id
     WHERE p.user_id = ?
     ORDER BY b.created_at DESC`,
    [req.authUser.id],
    (err, results) => {
      if (err) {
        console.error("Provider bookings failed:", err.message);
        return res.status(500).json({
          message: "Unable to retrieve bookings.",
        });
      }
      res.json({ bookings: results });
    }
  );
});

// Update booking status using provider profile ID.
app.patch(
  "/bookings/:id/status",
  authenticateToken,
  requireRole("provider"),
  (req, res) => {
  const { status, provider_id } = req.body;
  const providerId = Number(provider_id);
  const bookingId = Number(req.params.id);
  const allowedStatuses = ["Accepted", "Rejected", "Completed"];

  if (
    !allowedStatuses.includes(status) ||
    !Number.isInteger(providerId) ||
    providerId <= 0 ||
    !Number.isInteger(bookingId) ||
    bookingId <= 0
  ) {
    return res.status(400).json({
      message: "Valid booking, provider, and status are required.",
    });
  }

  db.query(
    `UPDATE bookings b
     JOIN providers p ON p.id = b.provider_id
     SET b.status = ?
     WHERE b.id = ?
       AND p.id = ?
       AND p.user_id = ?
       AND (
         (? = 'Completed' AND b.status = 'Accepted')
         OR (? IN ('Accepted', 'Rejected') AND b.status = 'Pending')
       )`,
    [status, bookingId, providerId, req.authUser.id, status, status],
    (err, result) => {
      if (err) {
        console.error("Booking status update failed:", err.message);
        return res.status(500).json({
          message: "Unable to update booking.",
        });
      }

      if (!result.affectedRows) {
        return res.status(404).json({
          message: "Booking not found or its status cannot be changed.",
        });
      }

      res.json({
        message: `Booking ${status.toLowerCase()} successfully.`,
        status,
      });
    }
  );
});

module.exports = { app, db, startServer };
