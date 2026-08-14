CREATE TABLE IF NOT EXISTS project_members (
  project_id VARCHAR(64) NOT NULL,
  member_id VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (project_id, member_id),
  INDEX idx_project_members_member_id (member_id),
  CONSTRAINT fk_project_members_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_members_member
    FOREIGN KEY (member_id) REFERENCES team_members(id) ON DELETE CASCADE
);

INSERT IGNORE INTO project_members (project_id, member_id, sort_order, created_at)
SELECT p.id, a.member_id, a.sort_order, p.updated_at
FROM projects p
INNER JOIN team_assignments a ON a.team_id = p.team_id
WHERE p.deleted_at IS NULL
  AND a.role IN ('dev', 'qa');
