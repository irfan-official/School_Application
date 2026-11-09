# School Admission System

## Run the full application with Docker

1. Install and start Docker Desktop.
2. From the repository root, copy `.env.example` to `.env` if you want to configure the Compose variables.
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
| `POST` | `/classes/{classId}/holds` | Apply and temporarily hold a seat |
| `GET` | `/holds/{holdId}` | Get a hold's status |
| `POST` | `/holds/{holdId}/confirm` | Simulate payment and confirm admission |
| `DELETE` | `/holds/{holdId}` | Cancel a hold or confirmed admission |
| `GET` | `/me/holds` | List the student's holds |

Set `HOLD_DURATION_SECONDS` to change the default 600-second hold duration. Set `ConnectionStrings__DefaultConnection` to connect the backend to another PostgreSQL database.

## Frontend checks

```powershell
cd frontend
npm run lint
npm run build
```
