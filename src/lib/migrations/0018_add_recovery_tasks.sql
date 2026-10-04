CREATE TABLE IF NOT EXISTS recovery_tasks (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  task_id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NULL,
  pm_id VARCHAR(64) NULL,
  tech_lead_id VARCHAR(64) NULL,
  original_estimate_days DECIMAL(8,2) NULL,
  committed_completion_date VARCHAR(32) NOT NULL,
  actual_completion_date VARCHAR(32) NULL,
  qa_rejection_count INT UNSIGNED NOT NULL DEFAULT 0,
  scope_changed TINYINT(1) NOT NULL DEFAULT 0,
  blocker_raised_date VARCHAR(32) NULL,
  resource_reassigned TINYINT(1) NOT NULL DEFAULT 0,
  root_cause ENUM(
    'developer_performance',
    'estimate_incorrect',
    'requirement_changed',
    'technical_complexity',
    'dependency_blocker',
    'resource_reassignment',
    'qa_issue',
    'pm_planning',
    'stakeholder_delay',
    'infrastructure',
    'other'
  ) NULL,
  status ENUM('green', 'amber', 'red') NOT NULL DEFAULT 'green',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY uq_recovery_project_task (project_id, task_id),
  INDEX idx_recovery_project (project_id),
  INDEX idx_recovery_status (status),
  INDEX idx_recovery_owner (owner_id),
  INDEX idx_recovery_pm (pm_id),
  INDEX idx_recovery_tech_lead (tech_lead_id),
  CONSTRAINT fk_recovery_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_recovery_owner
    FOREIGN KEY (owner_id) REFERENCES team_members(id) ON DELETE SET NULL,
  CONSTRAINT fk_recovery_pm
    FOREIGN KEY (pm_id) REFERENCES team_members(id) ON DELETE SET NULL,
  CONSTRAINT fk_recovery_tech_lead
    FOREIGN KEY (tech_lead_id) REFERENCES team_members(id) ON DELETE SET NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
