CREATE TABLE IF NOT EXISTS project_tags (
  project_id VARCHAR(64) NOT NULL,
  tag ENUM('education', 'internal_tools', 'b2c', 'websites') NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (project_id, tag),
  INDEX idx_project_tags_tag (tag),
  CONSTRAINT fk_project_tags_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
