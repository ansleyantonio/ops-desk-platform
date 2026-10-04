# Daily Dev Performance email

Managers can configure recipients, the daily ticket-hours target, and automatic delivery on **Dev Performance**. **Send test email** sends the selected UTC date to one test address with a `[TEST]` subject; it does not mark the daily report as sent. **Send report now** uses the saved recipients and marks that date as sent, so the scheduled job will not send it again.

Only completed ticket time entries whose `startedAt` falls on the report's UTC date are counted. Running timers are excluded. Reports include each configured developer and QA member and show whether they met the target. If ticket time data is absent, the report says it is unavailable.

Set these values in `/etc/opsdesk.env` (or the application's environment):

```text
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=account@example.com
SMTP_PASSWORD=replace-me
SMTP_FROM=OpsDesk <account@example.com>
PERFORMANCE_CRON_TOKEN=replace-with-a-long-random-secret
```

Install the timer after deploying the application:

```sh
sudo install -m 0750 deploy/opsdesk-performance-email /usr/local/sbin/opsdesk-performance-email
sudo install -m 0644 deploy/opsdesk-performance-email.service /etc/systemd/system/
sudo install -m 0644 deploy/opsdesk-performance-email.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now opsdesk-performance-email.timer
```

The timer calls the authenticated endpoint at 06:30 UTC each day. It reports the previous UTC date and skips Saturday and Sunday. Schedule ticket sync before 06:30 UTC. The dispatch endpoint requires `PERFORMANCE_CRON_TOKEN`. Automatic delivery also requires **Send automatically on weekdays** to be enabled in Dev Performance.
