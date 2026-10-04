import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentUser } from "@/lib/auth.functions";
import { dispatchPerformanceEmail, getPerformanceEmailConfig, updatePerformanceEmailConfig } from "@/lib/performance-email.functions";

export function PerformanceEmailPanel() {
  const [allowed, setAllowed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [recipients, setRecipients] = useState("");
  const [targetHours, setTargetHours] = useState(8);
  const [testTo, setTestTo] = useState("");
  const [date, setDate] = useState(new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  const [lastSentDate, setLastSentDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void getCurrentUser().then(async (user) => {
      if (!user?.permissions.includes("teams:manage")) return;
      const config = await getPerformanceEmailConfig();
      if (!active) return;
      setAllowed(true);
      setEnabled(config.enabled);
      setRecipients(config.recipients.join(", "));
      setTargetHours(config.targetHours);
      setLastSentDate(config.lastSentDate);
    }).catch((error) => { console.error("Could not load performance email settings", error); if (active) setNotice("Could not load email settings."); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  if (!loaded || !allowed) return null;

  const save = async () => {
    setBusy(true); setNotice("");
    try {
      const config = await updatePerformanceEmailConfig({ data: { enabled, recipients, targetHours } });
      setRecipients(config.recipients.join(", "));
      setNotice("Email settings saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save email settings."); }
    finally { setBusy(false); }
  };
  const send = async (test: boolean) => {
    setBusy(true); setNotice("");
    try {
      const result = await dispatchPerformanceEmail({ data: { date, ...(test ? { testTo: testTo.trim() } : {}) } });
      setNotice(result.sent ? `${test ? "Test" : "Daily report"} sent to ${result.recipientCount} recipient${result.recipientCount === 1 ? "" : "s"}.` : result.reason || "No email sent.");
      if (result.sent && !test) setLastSentDate(date);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not send email."); }
    finally { setBusy(false); }
  };

  return <section aria-label="Daily performance emails" className="rounded-[1.5rem] border border-border/70 bg-card/55 p-5">
    <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Mail className="h-5 w-5" /></div><div><h2 className="font-semibold">Daily performance emails</h2><p className="mt-1 text-sm text-muted-foreground">Send developer and QA ticket hours against a daily target. Automatic reports cover the previous UTC weekday and send at 06:30 UTC after ticket sync.</p></div></div>
    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(240px,2fr)_minmax(130px,1fr)_minmax(170px,1fr)]">
      <label className="space-y-1.5 text-xs">Recipients (comma separated)<Input type="text" value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder="manager@example.com" /></label>
      <label className="space-y-1.5 text-xs">Daily target (hours)<Input type="number" min="0.25" max="24" step="0.25" value={targetHours} onChange={(event) => setTargetHours(Number(event.target.value))} /></label>
      <label className="space-y-1.5 text-xs">Report date (UTC)<Input type="date" max={new Date().toISOString().slice(0, 10)} value={date} onChange={(event) => setDate(event.target.value)} /></label>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />Send automatically on weekdays</label><Button size="sm" disabled={busy} onClick={() => void save()}>Save settings</Button><Button size="sm" variant="outline" disabled={busy || !recipients.trim()} onClick={() => void send(false)}>Send report now</Button></div>
    <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border/70 pt-4"><label className="min-w-56 space-y-1.5 text-xs">Test email address<Input type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="you@example.com" /></label><Button size="sm" variant="outline" disabled={busy || !testTo.trim()} onClick={() => void send(true)}>Send test email</Button></div>
    <p className="mt-3 text-xs text-muted-foreground">Completed ticket time entries count toward the target; running timers do not. {lastSentDate ? `Last scheduled or manual report: ${lastSentDate}.` : "No report has been sent yet."}</p>
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
  </section>;
}
