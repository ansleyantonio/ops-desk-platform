ALTER TABLE projects
  ADD COLUMN team_id VARCHAR(64) NULL AFTER owner,
  ADD COLUMN pm_id VARCHAR(64) NULL AFTER team_id;

CREATE TABLE IF NOT EXISTS team_members (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  role ENUM('pm', 'dev', 'qa') NOT NULL,
  title VARCHAR(255) NULL,
  manager_id VARCHAR(64) NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_team_members_role (role),
  INDEX idx_team_members_manager_id (manager_id)
);

CREATE TABLE IF NOT EXISTS project_teams (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  pm_id VARCHAR(64) NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_project_teams_pm_id (pm_id)
);

CREATE TABLE IF NOT EXISTS team_assignments (
  team_id VARCHAR(64) NOT NULL,
  member_id VARCHAR(64) NOT NULL,
  role ENUM('pm', 'dev', 'qa') NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, member_id),
  INDEX idx_team_assignments_member_id (member_id),
  CONSTRAINT fk_team_assignments_team
    FOREIGN KEY (team_id) REFERENCES project_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_team_assignments_member
    FOREIGN KEY (member_id) REFERENCES team_members(id) ON DELETE CASCADE
);
