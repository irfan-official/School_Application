# Assumptions

- Each class-and-shift combination is represented by one class record; shifts are reflected in the class name.
- The provided 17-digit student birth-registration number is the student identity. There is no login or role system in the assignment, so class creation is unauthenticated.
- Class names are limited to 120 characters and capacity to 1–500 seats, matching the UI's capacity limit and keeping invalid values out of the database.
- A seat is held for 600 seconds by default. `HOLD_DURATION_SECONDS` overrides this value and must be a positive integer.
- The database connection is supplied with `ConnectionStrings__DefaultConnection`; Docker Compose provides a local-development value.
- The frontend calls the backend at `VITE_API_BASE_URL` and stores the entered student ID in the browser so applications remain visible after refresh; this ID is not authentication.
- The payment action in the assignment is simulated: confirming a valid hold immediately changes its status to `CONFIRMED`.
- Expired and cancelled holds remain in the database and in the student's hold history; only `HELD` and `CONFIRMED` holds consume seats.
- PostgreSQL is the source of truth. No demo records are inserted, so the class list starts empty and survives application restarts.
