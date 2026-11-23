# Companykeeping

Companykeeping is a product of [For General Use](https://fgu.martinvolejnik.com). Founders can start with a working company name, choose a checklist, and keep their next actions and supporting records together. For General Use is also the first customer. Founders who want to try the app can opt into a private copy of sample records covering bookkeeping and the company's plans to launch Stillpoint.

## Start locally

From the repository root, with Docker Compose v2 and OpenSSL installed:

```sh
./deploy/start-local.sh
```

Open [Companykeeping on localhost](http://127.0.0.1:4317). The script creates `.env` on first use, generates distinct local database passwords, builds the image, and starts Spring Boot and PostgreSQL. PostgreSQL keeps the data in the `db_data` named volume. To stop and resume the same workspace:

```sh
docker compose down
./deploy/start-local.sh
```

`COMPANYKEEPING_PORT` changes the loopback port. Set `PUBLIC_ORIGIN` to the exact HTTPS origin when running behind a reverse proxy. The deployed route, database provisioning, and Helm commands are in the [Quip runbook](docs/deployment.md).

## The founder journey

1. Create an account and enter the business description, country or region, and stage. A working name or blank name is fine. Update the profile later from the company menu.
2. Review the starting checklist. Edit a title or next action, uncheck a suggestion, or add an item. Dates for ordinary workspaces come from the owner. Each item has a field for the accountant’s or official source link.
3. **This week** shows ready work, waiting items with their dependencies, and due dates and follow-ups for today and the next six days, including overdue items. Ready items stay visible without dates.
4. Open an item to change its next action, state, dates, source, or confirmation link. **Company records** includes all open and completed items.
5. For a monthly item, choose the record month, save the confirmation, and mark it complete. The completed record keeps its original evidence. The next occurrence starts with an empty evidence field and retains the source. A due date on the 31st moves to the last day of a shorter month and returns to the 31st when available.

## Build and run the checks

Use JDK 21, Maven 3.9+, Node 22.12+ and local PostgreSQL server binaries. `JAVA_HOME` must point to JDK 21 or newer. The HTTP and browser suites start disposable PostgreSQL clusters under the system temporary directory. They do not connect to a running company database. Run as an ordinary user. Set `PG_BIN` to the directory containing `initdb`, `postgres`, and `pg_ctl` if `pg_config --bindir` or `PATH` does not locate them.

```sh
npm ci --prefix frontend
npm run build --prefix frontend
mvn -B -ntp -f backend/pom.xml clean package
npm ci
npx playwright install chromium
npm test
npm run test:browser
```

The Vite build type-checks the React client. Maven runs the Java request-boundary tests and packages the client, backend, and migrations into `backend/target/companykeeping.jar`. The HTTP checks verify both business stages, checklist editing, persistence after process restart, sign-in/out, isolation between two owners, and concurrent completion of a monthly item. The Chromium check goes from signup through mobile task editing, reload, and a leap-year monthly rollover. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an installed Chromium-based browser. On a fresh Linux CI runner use `npx playwright install --with-deps chromium`.

## Run from source

With a local database named `companykeeping` owned by a `companykeeping` login, set `SPRING_DATASOURCE_PASSWORD` to that login’s password and run:

```sh
java -jar backend/target/companykeeping.jar
```

The backend defaults to `jdbc:postgresql://127.0.0.1:5432/companykeeping` and listens at `127.0.0.1:4317`. `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `HOST`, and `PORT` override those values. Flyway applies versioned SQL from `backend/src/main/resources/db/migration` on startup. For live React editing, leave Spring running and use:

```sh
npm run dev --prefix frontend
```

Open the Vite URL printed in the terminal. Vite forwards `/api` and `/healthz` to Spring. `COMPANYKEEPING_API_URL` selects a different development backend.

## Storage and identity

Spring derives the workspace from the signed-in account for every record operation. Passwords use salted PBKDF2, and PostgreSQL stores digests of session tokens. The session cookie is HttpOnly and becomes Secure and host-only on the public HTTPS origin. Record completion and creation of its successor share one database transaction.

The web app serves its own Index tab wordmark, stepped emblem, Archivo typeface, font license, and folder artwork from `frontend/public/assets`. Document and confirmation attachments are links to the founder’s chosen storage.
