UPDATE projects
SET team_id = NULL,
    updated_at = UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000
WHERE team_id IS NOT NULL;
