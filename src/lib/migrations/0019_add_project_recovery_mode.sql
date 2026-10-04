ALTER TABLE recovery_tasks
  MODIFY COLUMN committed_completion_date VARCHAR(32) NULL;

CREATE TABLE IF NOT EXISTS project_recovery_modes (
  project_id VARCHAR(64) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  reason TEXT NULL,
  enabled_by VARCHAR(64) NULL,
  enabled_at BIGINT NOT NULL,
  disabled_by VARCHAR(64) NULL,
  disabled_at BIGINT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (project_id),
  INDEX idx_project_recovery_active (active, updated_at),
  CONSTRAINT fk_project_recovery_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_recovery_enabled_by
    FOREIGN KEY (enabled_by) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_project_recovery_disabled_by
    FOREIGN KEY (disabled_by) REFERENCES app_users(id) ON DELETE SET NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recovery_events (
  id VARCHAR(64) NOT NULL,
  project_id VARCHAR(64) NOT NULL,
  task_id VARCHAR(64) NULL,
  event_type VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64) NULL,
  actor_name VARCHAR(255) NULL,
  details JSON NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_recovery_events_project (project_id, created_at),
  INDEX idx_recovery_events_task (task_id, created_at),
  CONSTRAINT fk_recovery_events_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
