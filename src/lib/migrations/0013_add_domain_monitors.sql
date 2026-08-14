CREATE TABLE IF NOT EXISTS domain_monitors (
  id VARCHAR(64) PRIMARY KEY,
  hostname VARCHAR(253) NOT NULL,
  ssl_expires_at BIGINT NULL,
  domain_expires_at BIGINT NULL,
  ssl_issuer VARCHAR(255) NULL,
  registrar VARCHAR(255) NULL,
  checked_at BIGINT NULL,
  ssl_error TEXT NULL,
  domain_error TEXT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY uq_domain_monitors_hostname (hostname),
  INDEX idx_domain_monitors_ssl_expiry (ssl_expires_at),
  INDEX idx_domain_monitors_domain_expiry (domain_expires_at)
);
