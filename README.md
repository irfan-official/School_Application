# School Admission System

## Run the full application with Docker

1. Install and start Docker Desktop.
2. From the repository root, copy `.env.example` to `.env` if you want to configure the Compose variables. Set `HOLD_DURATION_SECONDS` there to override the default 600-second hold duration (for example, `HOLD_DURATION_SECONDS=30` for testing).
3. Start the database, .NET API, and React app:

   ```powershell
   docker compose up --build
   ```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8080
- Health check: http://localhost:8080/health
- PostgreSQL: `localhost:5432`

Created classes and applications are stored in the `pgdata` Docker volume and survive container restarts. Do not use `docker compose down -v` unless you intend to delete that data.

The browser stores the entered student ID locally so the student can see their applications after a refresh. It is an identifier, not authentication.

## Run the frontend locally

Start the backend and database with `docker compose up --build db backend`, then run:

```powershell
cd frontend
npm ci
$env:VITE_API_BASE_URL = "http://localhost:8080"
npm run dev
```

`VITE_API_BASE_URL` is a Vite build-time setting. For Docker deployments, set it in the root `.env` file and rebuild the frontend image.

## API

Hold endpoints require the `X-Student-Id` header containing a 17-digit student birth-registration number.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/classes` | Create a class |
| `GET` | `/classes` | List classes and seat counts |
| `GET` | `/classes/{classId}` | Get a class and its seat counts |
| `PUT` | `/classes/{classId}` | Update a class name and capacity |
| `DELETE` | `/classes/{classId}` | Archive a class |
| `POST` | `/classes/{classId}/holds` | Apply and temporarily hold a seat |
| `GET` | `/holds/{holdId}` | Get a hold's status |
| `POST` | `/holds/{holdId}/confirm` | Simulate payment and confirm admission |
| `DELETE` | `/holds/{holdId}` | Cancel a hold or confirmed admission |
| `GET` | `/me/holds` | List the student's holds |

Set `HOLD_DURATION_SECONDS` to change the default 600-second hold duration. It is measured in seconds and must be a positive integer. With Docker Compose, configure it in the root `.env` file; when running the backend directly, set it in the backend process environment. Set `ConnectionStrings__DefaultConnection` to connect the backend to another PostgreSQL database.

Class updates require both `name` and `totalSeats`, as with class creation. Capacity cannot be reduced below the number of held and confirmed seats. Deleting a class archives it rather than removing its database record: archived classes disappear from the available class list and Admin list, and their application history is retained but hidden from the student application list. Any outstanding `HELD` applications are expired when a class is archived; confirmed history remains stored. The backend adds the archive flag to an existing `Classes` table at startup if needed.

## Frontend checks

```powershell
cd frontend
npm run lint
npm run build
```

## Backend integration tests

The backend tests use a disposable PostgreSQL 15 container, so Docker Desktop must be running. They exercise seat capacity, student ownership, idempotent confirmation, and concurrent requests for the last seat without touching the application database.

```powershell
dotnet test backend\WebApplication1.sln
```
