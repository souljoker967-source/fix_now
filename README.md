# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Connect the app to the existing backend

The app calls the existing Express API in `server.js`. Its MySQL-compatible
database can use the free TiDB Cloud Starter tier; no database credentials
belong in the Expo app.

1. Create a TiDB Cloud Starter cluster and a database named `fix_now`.
2. In the existing backend host's environment settings, set `MYSQL_HOST`,
   `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` from the
   cluster connection details, and set `MYSQL_SSL=true`. Keep these values
   private. The server enables TLS 1.2 or newer and verifies the certificate
   using Node.js's default trusted CA certificates. TiDB Cloud Starter normally
   does not require a custom CA; set `MYSQL_SSL_CA` only if your cluster
   explicitly requires one. Allow the backend host's outbound IP addresses in
   the cluster's network access settings. The backend initializes the existing
   [`schema.sql`](./schema.sql) definitions at startup using
   `CREATE TABLE IF NOT EXISTS`; existing tables and rows are not replaced.
3. Generate a private secret (for example,
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`)
   and add it in Render under **Service → Environment** as `AUTH_TOKEN_SECRET`.
   Keep this value stable so existing sessions remain valid. The API returns
   signed, seven-day bearer tokens; the app stores them with Expo SecureStore.
   Deploy this backend change to Render before installing the updated app.
5. The app's default API URL is `https://fix-now.onrender.com`. To use another
   URL, set `EXPO_PUBLIC_API_URL` before building. The API URL is public app
   configuration; database credentials and the auth-token secret stay on the
   backend.

Start the existing backend locally with `npm run server`.
To check the database connection using the configured environment variables,
run `npm run test:db`. It reports the connection result without printing
configured credentials.

Run the backend route/authentication checks with `npm test`. They use an
in-memory database stub and do not test the live Render service or TiDB
connection.

## Fictional demonstration providers

The authenticated customer provider search includes eight code-managed,
fictional Tamil Nadu demo profiles. They are separate from the `users`,
`providers`, and `bookings` tables, so enabling them does not create accounts or
change existing database data. Each result is marked as a demo, uses no real
contact number, and cannot be booked. Prices, experience, availability, and
ratings are illustrative. Deploying a backend change makes the profiles
available through search; an updated Android APK is needed to show the demo
labels and profile details in the app.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
