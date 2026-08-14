CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  owner VARCHAR(255) NOT NULL DEFAULT '',
  phase VARCHAR(32) NOT NULL,
  start_date VARCHAR(32) NOT NULL DEFAULT '',
  target_date VARCHAR(32) NOT NULL DEFAULT '',
  uat_start_date VARCHAR(32) NULL,
  uat_end_date VARCHAR(32) NULL,
  priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  status ENUM('planning', 'active', 'on_hold', 'completed') NOT NULL DEFAULT 'active',
  deleted_at BIGINT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_modules (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  assignee VARCHAR(255) NULL,
  effort_days INT NULL,
  status ENUM('not_started', 'in_progress', 'completed', 'blocked') NOT NULL,
  planned_start VARCHAR(32) NULL,
  planned_end VARCHAR(32) NULL,
  uat ENUM('pending', 'in_progress', 'passed', 'failed') NOT NULL,
  uat_planned_start VARCHAR(32) NULL,
  uat_planned_end VARCHAR(32) NULL,
  uat_actual_start VARCHAR(32) NULL,
  uat_actual_end VARCHAR(32) NULL,
  notes TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  INDEX idx_project_modules_project_id (project_id),
  CONSTRAINT fk_project_modules_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_risks (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  severity ENUM('low', 'medium', 'high') NOT NULL,
  mitigation TEXT NULL,
  resolved TINYINT(1) NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  INDEX idx_project_risks_project_id (project_id),
  CONSTRAINT fk_project_risks_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
