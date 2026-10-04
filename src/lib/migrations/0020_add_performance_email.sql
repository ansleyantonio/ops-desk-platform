CREATE TABLE IF NOT EXISTS performance_email_settings (
  id TINYINT PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  recipients TEXT NOT NULL,
  target_hours DECIMAL(5,2) NOT NULL DEFAULT 8,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS performance_email_deliveries (
  report_date DATE PRIMARY KEY,
  status ENUM('sending', 'sent') NOT NULL,
  updated_at BIGINT NOT NULL,
  sent_at BIGINT NULL
);
