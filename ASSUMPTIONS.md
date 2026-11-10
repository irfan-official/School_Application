# Assumptions

- Each class-and-shift combination is represented by one class record; shifts are reflected in the class name.
- The provided 17-digit student birth-registration number is the student identity. There is no login or role system in the assignment, so class creation is unauthenticated.
- Class names are limited to 120 characters and capacity to 1–500 seats, matching the UI's capacity limit and keeping invalid values out of the database.
- A seat is held for 600 seconds by default. `HOLD_DURATION_SECONDS` overrides this value and must be a positive integer.
- The database connection is supplied with `ConnectionStrings__DefaultConnection`; Docker Compose provides a local-development value.
- The frontend calls the backend at `VITE_API_BASE_URL` and stores the entered student ID in the browser so applications remain visible after refresh; this ID is not authentication.
- The payment action in the assignment is simulated: confirming a valid hold immediately changes its status to `CONFIRMED`.
- Expired and cancelled holds remain in the database and in the student's hold history for active classes; only `HELD` and `CONFIRMED` holds consume seats.
- Class capacity cannot be reduced below its current held plus confirmed seats. Deleting a class is a soft delete: archived classes are hidden from the Admin and student class lists, existing application history is retained in the database but hidden from the student's application list, and outstanding held applications are expired.
- PostgreSQL is the source of truth. No demo records are inserted, so the class list starts empty and survives application restarts.
- Concurrent seat requests are serialized by locking the target PostgreSQL class row with `SELECT ... FOR UPDATE` inside the same transaction that checks active holds and inserts a new hold. The lock is database-scoped, so separate backend processes sharing the same PostgreSQL database observe the same capacity invariant; running multiple API processes against separate databases is not supported.
