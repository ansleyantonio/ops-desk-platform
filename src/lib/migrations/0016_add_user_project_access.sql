CREATE TABLE IF NOT EXISTS app_user_projects (
  user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  project_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, project_id),
  INDEX idx_app_user_projects_project (project_id),
  CONSTRAINT fk_app_user_projects_user
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_user_projects_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
