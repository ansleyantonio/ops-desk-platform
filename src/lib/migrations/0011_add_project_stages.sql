CREATE TABLE IF NOT EXISTS project_stages (
  project_id VARCHAR(64) NOT NULL,
  stage_id VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  color VARCHAR(32) NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, stage_id),
  INDEX idx_project_stages_current (project_id, is_current),
  CONSTRAINT fk_project_stages_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
