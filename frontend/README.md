# Frontend

The React/Vite client calls the .NET API through `VITE_API_BASE_URL` (defaults to `http://localhost:8080`).

Run the app locally from this directory:

```powershell
npm ci
$env:VITE_API_BASE_URL = "http://localhost:8080"
npm run dev
```

Run `npm run lint` and `npm run build` to validate the frontend. For the full Docker setup, see the repository [README](../README.md).
