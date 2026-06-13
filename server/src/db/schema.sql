-- DeskGuard PostgreSQL Schema

CREATE TYPE desk_status AS ENUM ('free','occupied','away','still_here_pending','abandoned');

CREATE TABLE IF NOT EXISTS desks (
  id          TEXT PRIMARY KEY,
  zone        TEXT NOT NULL,
  row_num     INT  NOT NULL,
  col_num     INT  NOT NULL,
  status      desk_status NOT NULL DEFAULT 'free',
  checkin_at  TIMESTAMPTZ,
  away_at     TIMESTAMPTZ,
  state_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id          SERIAL PRIMARY KEY,
  desk_id     TEXT,
  event_type  TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed 30 desks across 3 zones
INSERT INTO desks (id, zone, row_num, col_num) VALUES
  -- Zone A: Quiet Study (3 rows × 4 cols = 12 desks)
  ('A-01','Quiet Study',0,0),('A-02','Quiet Study',0,1),('A-03','Quiet Study',0,2),('A-04','Quiet Study',0,3),
  ('A-05','Quiet Study',1,0),('A-06','Quiet Study',1,1),('A-07','Quiet Study',1,2),('A-08','Quiet Study',1,3),
  ('A-09','Quiet Study',2,0),('A-10','Quiet Study',2,1),('A-11','Quiet Study',2,2),('A-12','Quiet Study',2,3),
  -- Zone B: Collaboration (2 rows × 5 cols = 10 desks)
  ('B-01','Collaboration',0,0),('B-02','Collaboration',0,1),('B-03','Collaboration',0,2),('B-04','Collaboration',0,3),('B-05','Collaboration',0,4),
  ('B-06','Collaboration',1,0),('B-07','Collaboration',1,1),('B-08','Collaboration',1,2),('B-09','Collaboration',1,3),('B-10','Collaboration',1,4),
  -- Zone C: Reading Lounge (2 rows × 4 cols = 8 desks)
  ('C-01','Reading Lounge',0,0),('C-02','Reading Lounge',0,1),('C-03','Reading Lounge',0,2),('C-04','Reading Lounge',0,3),
  ('C-05','Reading Lounge',1,0),('C-06','Reading Lounge',1,1),('C-07','Reading Lounge',1,2),('C-08','Reading Lounge',1,3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO activity_log (desk_id, event_type, message) VALUES
  (NULL, 'system', 'DeskGuard server started — background sweep active') ON CONFLICT DO NOTHING;
