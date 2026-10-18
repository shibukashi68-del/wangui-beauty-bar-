CREATE TABLE IF NOT EXISTS bookings (
  id text PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL,
  service_id text NOT NULL,
  service text NOT NULL,
  booking_date date NOT NULL,
  booking_time time NOT NULL,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'declined', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  overlap_start integer NOT NULL,
  overlap_end integer NOT NULL
);

CREATE INDEX IF NOT EXISTS bookings_date_status_idx
  ON bookings (booking_date, status);
