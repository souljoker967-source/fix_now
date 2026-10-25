const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { DEMO_PROVIDERS } = require("./demo-providers");

process.env.AUTH_TOKEN_SECRET = "local-test-secret-with-at-least-32-bytes";

const { app, db, initializeSchema } = require("./server");
const users = new Map();
const bookings = [];
let nextUserId = 3;
let nextBookingId = 1;
let nextInsertError = null;
let nextLoginError = null;
const provider = {
  id: 9,
  user_id: 2,
  name: "Test Provider",
  phone: "5550102",
  service_type: "Plumbing",
  location: "Test City",
  latitude: null,
  longitude: null,
  is_available: 1,
};

users.set(1, {
  id: 1,
  name: "Test Customer",
  email: "customer@example.com",
  phone: "5550101",
  password: bcrypt.hashSync("CustomerPassword123", 4),
  account_type: "customer",
});
users.set(2, {
  id: 2,
  name: "Test Provider",
  email: "provider@example.com",
  phone: "5550102",
  password: bcrypt.hashSync("ProviderPassword123", 4),
  account_type: "provider",
});

db.query = (query, params, callback) => {
  const sql = query.replace(/\s+/g, " ").trim();

  if (sql.startsWith("INSERT INTO users")) {
    const [name, email, phone, password, account_type] = params;
    if (nextInsertError) {
      const error = nextInsertError;
      nextInsertError = null;
      return callback(error);
    }
    if (
      [...users.values()].some(
        (user) => user.email === email || user.phone === phone
      )
    ) {
      return callback({ code: "ER_DUP_ENTRY", message: "Duplicate user" });
    }
    const user = {
      id: nextUserId++,
      name,
      email,
      phone,
      password,
      account_type,
    };
    users.set(user.id, user);
    return callback(null, { insertId: user.id });
  }

  if (sql.includes("FROM users WHERE email = ?")) {
    if (nextLoginError) {
      const error = nextLoginError;
      nextLoginError = null;
      return callback(error);
    }
    const user = [...users.values()].find((entry) => entry.email === params[0]);
    return callback(null, user ? [user] : []);
  }

  if (sql.includes("FROM users WHERE id = ? AND account_type")) {
    const user = users.get(Number(params[0]));
    return callback(
      null,
      user?.account_type === "provider" ? [{ id: user.id }] : []
    );
  }

  if (sql.includes("FROM users WHERE id = ? LIMIT 1")) {
    const user = users.get(Number(params[0]));
    const fields = user
      ? [{
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          account_type: user.account_type,
        }]
      : [];
    return callback(null, fields);
  }

  if (sql.includes("FROM providers WHERE service_type LIKE")) {
    const serviceMatches = provider.service_type
      .toLowerCase()
      .includes(String(params[0]).slice(1, -1).toLowerCase());
    const locationParameter = params.find(
      (parameter) =>
        typeof parameter === "string" &&
        parameter.startsWith("%") &&
        parameter.endsWith("%") &&
        parameter !== params[0]
    );
    const locationMatches =
      !locationParameter ||
      provider.location
        .toLowerCase()
        .includes(locationParameter.slice(1, -1).toLowerCase());
    const availabilityMatches =
      !sql.includes("AND is_available = 1") || Boolean(provider.is_available);
    return callback(
      null,
      serviceMatches && locationMatches && availabilityMatches ? [provider] : []
    );
  }

  if (sql.includes("FROM providers WHERE user_id = ? LIMIT 1")) {
    return callback(null, provider.user_id === Number(params[0]) ? [provider] : []);
  }

  if (sql.startsWith("INSERT INTO bookings")) {
    const [, providerId, customerId] = params;
    if (Number(providerId) !== provider.id || Number(customerId) !== 1) {
      return callback(null, { insertId: 0, affectedRows: 0 });
    }
    const booking = {
      id: nextBookingId++,
      customer_id: Number(customerId),
      provider_id: Number(providerId),
      problem: params[0],
      status: "Pending",
    };
    bookings.push(booking);
    return callback(null, { insertId: booking.id, affectedRows: 1 });
  }

  if (sql.includes("FROM bookings b") && sql.includes("WHERE b.customer_id = ?")) {
    return callback(
      null,
      bookings.filter((booking) => booking.customer_id === Number(params[0]))
    );
  }

  if (sql.includes("FROM bookings b") && sql.includes("WHERE p.user_id = ?")) {
    return callback(
      null,
      provider.user_id === Number(params[0])
        ? bookings.filter((booking) => booking.provider_id === provider.id)
        : []
    );
  }

  if (sql.startsWith("UPDATE bookings b")) {
    const [status, bookingId, providerId, userId] = params;
    const booking = bookings.find(
      (entry) =>
        entry.id === Number(bookingId) &&
        entry.provider_id === Number(providerId) &&
        provider.user_id === Number(userId)
    );
    if (booking) booking.status = status;
    return callback(null, { affectedRows: booking ? 1 : 0 });
  }

  return callback(new Error(`Unexpected test query: ${sql}`));
};

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

test("schema initialization executes only idempotent existing table definitions", async () => {
  const statements = [];
  await initializeSchema(async (statement) => statements.push(statement));
  assert.equal(statements.length, 3);
  assert.ok(statements.every((statement) => /^CREATE TABLE IF NOT EXISTS/i.test(statement)));
  assert.match(statements[0], /account_type ENUM\('customer', 'provider'\)/);
  assert.match(statements[0], /users_email_unique/);
  assert.match(statements[0], /users_phone_unique/);
  assert.match(statements[1], /providers_user_id_unique/);
  assert.match(statements[2], /bookings_customer_created_idx/);
});

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function registerAccount({
  name = "New Account",
  email,
  phone,
  password = "NewPassword123",
  account_type,
}) {
  return request("/register", {
    method: "POST",
    body: {
      name,
      email,
      phone,
      password,
      account_type,
    },
  });
}

test("registration creates customer and provider accounts with hashed passwords", async () => {
  const customer = await registerAccount({
    name: "New Customer",
    email: "new-customer@example.com",
    phone: "5550103",
    account_type: "customer",
  });

  assert.equal(customer.status, 201);
  assert.equal(typeof customer.body.token, "string");
  assert.equal(customer.body.user.account_type, "customer");
  assert.equal("password" in customer.body.user, false);
  assert.equal(
    await bcrypt.compare("NewPassword123", users.get(3).password),
    true
  );

  const provider = await registerAccount({
    name: "New Provider",
    email: "new-provider@example.com",
    phone: "5550104",
    account_type: "provider",
  });
  assert.equal(provider.status, 201);
  assert.equal(provider.body.user.account_type, "provider");
  assert.equal(
    await bcrypt.compare("NewPassword123", users.get(4).password),
    true
  );
});

test("registration rejects duplicate email and duplicate phone without creating accounts", async () => {
  const originalCount = users.size;
  const duplicateEmail = await registerAccount({
    email: "customer@example.com",
    phone: "5550191",
    account_type: "customer",
  });
  assert.equal(duplicateEmail.status, 409);
  assert.match(duplicateEmail.body.message, /email or phone number/);

  const duplicatePhone = await registerAccount({
    email: "another@example.com",
    phone: "5550101",
    account_type: "provider",
  });
  assert.equal(duplicatePhone.status, 409);
  assert.match(duplicatePhone.body.message, /email or phone number/);
  assert.equal(users.size, originalCount);
});

test("registration rejects invalid fields and unsupported account roles", async () => {
  const originalCount = users.size;
  const invalidRequests = [
    { email: "bad-email", phone: "5550192", account_type: "customer" },
    { email: "valid@example.com", phone: "5550193", account_type: "admin" },
    {
      email: "short-password@example.com",
      phone: "5550194",
      password: "short",
      account_type: "customer",
    },
    {
      name: " ",
      email: "blank-name@example.com",
      phone: "5550195",
      account_type: "provider",
    },
  ];

  for (const input of invalidRequests) {
    const result = await registerAccount(input);
    assert.equal(result.status, 400);
    assert.equal(typeof result.body.message, "string");
  }
  assert.equal(users.size, originalCount);
});

test("registration returns safe actionable database errors", async () => {
  nextInsertError = {
    code: "ER_NO_SUCH_TABLE",
    errno: 1146,
    sqlState: "42S02",
    message: "sensitive SQL and account data must not be returned",
  };
  const schemaFailure = await registerAccount({
    email: "schema-failure@example.com",
    phone: "5550196",
    account_type: "customer",
  });
  assert.equal(schemaFailure.status, 500);
  assert.match(schemaFailure.body.message, /Account setup is incomplete/);
  assert.doesNotMatch(
    JSON.stringify(schemaFailure.body),
    /sensitive SQL|42S02|1146/
  );
  assert.equal(nextInsertError, null);

  nextInsertError = {
    code: "ER_DATA_TOO_LONG",
    message: "raw database contents are not client-facing",
  };
  const dataFailure = await registerAccount({
    email: "long-details@example.com",
    phone: "5550197",
    account_type: "provider",
  });
  assert.equal(dataFailure.status, 400);
  assert.match(dataFailure.body.message, /too long/);
  assert.doesNotMatch(
    JSON.stringify(dataFailure.body),
    /raw database contents/
  );
});

test("login failures include a safe database code and reference", async () => {
  nextLoginError = {
    code: "ER_NO_SUCH_TABLE",
    errno: 1146,
    sqlState: "42S02",
    message: "sensitive SQL and account data must not be returned",
  };
  const result = await request("/login", {
    method: "POST",
    body: {
      email: "nonexistent@example.com",
      password: "SyntheticPassword123",
    },
  });
  assert.equal(result.status, 500);
  assert.match(result.body.message, /ER_NO_SUCH_TABLE/);
  assert.match(result.body.message, /reference [0-9a-f-]{36}/);
  assert.doesNotMatch(
    JSON.stringify(result.body),
    /sensitive SQL|42S02|1146/
  );
  assert.equal(nextLoginError, null);
});

test("login authenticates passwords and /auth/me restores the signed session", async () => {
  const rejected = await request("/login", {
    method: "POST",
    body: { email: "customer@example.com", password: "incorrect" },
  });
  assert.equal(rejected.status, 401);

  const loggedIn = await request("/login", {
    method: "POST",
    body: {
      email: "customer@example.com",
      password: "CustomerPassword123",
    },
  });
  assert.equal(loggedIn.status, 200);
  const restored = await request("/auth/me", { token: loggedIn.body.token });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.user.id, 1);
});

test("protected routes require tokens and enforce account role and ownership", async () => {
  const publicSearch = await request("/providers/search?service=Plumbing");
  assert.equal(publicSearch.status, 401);

  const customer = await request("/login", {
    method: "POST",
    body: {
      email: "customer@example.com",
      password: "CustomerPassword123",
    },
  });
  const providerLogin = await request("/login", {
    method: "POST",
    body: {
      email: "provider@example.com",
      password: "ProviderPassword123",
    },
  });

  const wrongRole = await request("/providers/by-user/2", {
    token: customer.body.token,
  });
  assert.equal(wrongRole.status, 403);

  const wrongOwner = await request("/bookings/customer/3", {
    token: customer.body.token,
  });
  assert.equal(wrongOwner.status, 403);

  const providerReadsCustomerBookings = await request("/bookings/customer/1", {
    token: providerLogin.body.token,
  });
  assert.equal(providerReadsCustomerBookings.status, 403);
});

test("customer search and booking use the authenticated customer identity", async () => {
  const login = await request("/login", {
    method: "POST",
    body: {
      email: "customer@example.com",
      password: "CustomerPassword123",
    },
  });

  const search = await request("/providers/search?service=Plumbing&location=Test%20City", {
    token: login.body.token,
  });
  assert.equal(search.status, 200);
  assert.equal(search.body.providers.length, 1);

  const created = await request("/bookings", {
    method: "POST",
    token: login.body.token,
    body: { customer_id: 2, provider_id: 9, problem: "Leaking tap" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.booking.customer_id, 1);

  const history = await request("/bookings/customer/1", {
    token: login.body.token,
  });
  assert.equal(history.status, 200);
  assert.equal(history.body.bookings.length, 1);
});

test("customer search returns eight clearly marked demo profiles without accounts", async () => {
  assert.equal(DEMO_PROVIDERS.length, 8);
  assert.equal(new Set(DEMO_PROVIDERS.map((item) => item.id)).size, 8);
  assert.ok(DEMO_PROVIDERS.every((item) => item.phone === "DEMO ONLY"));
  assert.ok(DEMO_PROVIDERS.every((item) => item.user_id === null));

  const login = await request("/login", {
    method: "POST",
    body: {
      email: "customer@example.com",
      password: "CustomerPassword123",
    },
  });
  const categories = [
    "Electrical",
    "Plumbing",
    "Cleaning",
    "Carpentry",
    "Painting",
    "Appliance Repair",
  ];

  for (const service of categories) {
    const result = await request(
      `/providers/search?service=${encodeURIComponent(service)}`,
      { token: login.body.token }
    );
    assert.equal(result.status, 200);
    assert.ok(result.body.providers.some((item) => item.is_demo));
  }

  const nagercoil = await request(
    "/providers/search?service=Plumbing&location=Nagercoil",
    { token: login.body.token }
  );
  assert.deepEqual(
    nagercoil.body.providers.map((item) => item.id),
    ["demo:revathi-anand-plumbing"]
  );
  assert.equal(nagercoil.body.providers[0].is_demo, true);
  assert.equal(nagercoil.body.providers[0].starting_price_inr, 300);

  const applianceAlias = await request(
    "/providers/search?service=Appliances&location=Marthandam",
    { token: login.body.token }
  );
  assert.deepEqual(
    applianceAlias.body.providers.map((item) => item.id),
    ["demo:vignesh-balan-appliance-repair"]
  );

  const nearbyElectrical = await request(
    "/providers/search?service=Electrical&lat=8.1833&lon=77.4119&radiusKm=5",
    { token: login.body.token }
  );
  assert.ok(
    nearbyElectrical.body.providers.some(
      (item) => item.id === "demo:arjun-kumar-electrical"
    )
  );

  const unavailableFiltered = await request(
    "/providers/search?service=Plumbing&location=Nagercoil&availableOnly=true",
    { token: login.body.token }
  );
  assert.equal(unavailableFiltered.body.count, 0);

  const bookingCount = bookings.length;
  const demoBooking = await request("/bookings", {
    method: "POST",
    token: login.body.token,
    body: {
      customer_id: 1,
      provider_id: "demo:revathi-anand-plumbing",
      problem: "Demo request",
    },
  });
  assert.equal(demoBooking.status, 400);
  assert.equal(bookings.length, bookingCount);
});

test("provider can update status only on a booking tied to their own profile", async () => {
  const login = await request("/login", {
    method: "POST",
    body: {
      email: "provider@example.com",
      password: "ProviderPassword123",
    },
  });

  const updated = await request("/bookings/1/status", {
    method: "PATCH",
    token: login.body.token,
    body: { status: "Accepted", provider_id: 9 },
  });
  assert.equal(updated.status, 200);
  assert.equal(bookings[0].status, "Accepted");

  const rejected = await request("/bookings/1/status", {
    method: "PATCH",
    token: login.body.token,
    body: { status: "Completed", provider_id: 10 },
  });
  assert.equal(rejected.status, 404);
});

test("authentication is unavailable when the production token secret is missing", async () => {
  const configuredSecret = process.env.AUTH_TOKEN_SECRET;
  delete process.env.AUTH_TOKEN_SECRET;
  try {
    const result = await request("/login", {
      method: "POST",
      body: {
        email: "customer@example.com",
        password: "CustomerPassword123",
      },
    });
    assert.equal(result.status, 503);
    assert.match(result.body.message, /AUTH_TOKEN_SECRET/);
  } finally {
    process.env.AUTH_TOKEN_SECRET = configuredSecret;
  }
});
