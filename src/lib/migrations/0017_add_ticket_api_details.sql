CREATE TABLE IF NOT EXISTS ticket_api_details (
  ticket_id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  activities JSON NOT NULL,
  time_entries JSON NOT NULL,
  synced_at BIGINT NOT NULL,
  INDEX idx_ticket_api_details_project (project_id)
);
