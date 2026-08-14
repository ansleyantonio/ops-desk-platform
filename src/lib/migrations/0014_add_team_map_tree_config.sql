CREATE TABLE IF NOT EXISTS team_map_tree_config (
  config_key VARCHAR(64) PRIMARY KEY,
  config_json LONGTEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
