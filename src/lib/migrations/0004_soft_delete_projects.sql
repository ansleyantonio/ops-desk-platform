ALTER TABLE projects
  ADD COLUMN deleted_at BIGINT NULL AFTER status;
