import {
  ArrowRight,
  Broadcast,
  Eye,
  EyeSlash,
  GitBranch,
  GlobeHemisphereWest,
  LockKey,
  ShieldCheck,
  UsersThree,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/auth.functions";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Access console | OpsDesk" },
      { name: "description", content: "Secure access to the OpsDesk operations workspace." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await login({ data: { email, password } });
      if (!result.ok) {
        setError("That email and password combination was not recognised.");
        return;
      }
      window.location.assign("/");
    } catch (cause) {
      console.error("Login failed", cause);
      setError("OpsDesk could not sign you in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[#161e20] text-[#edf3f1] [font-family:Geist,'Plus_Jakarta_Sans',sans-serif]">
      <div className="pointer-events-none fixed inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(216,234,230,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(216,234,230,.8)_1px,transparent_1px)] [background-size:56px_56px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_64%_28%,rgba(82,139,139,.16),transparent_31%),radial-gradient(circle_at_10%_90%,rgba(82,139,139,.08),transparent_28%)]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#78aaa5]/55 to-transparent" />

      <div className="relative mx-auto grid min-h-[100dvh] max-w-[1600px] grid-rows-[auto_1fr] px-4 py-4 sm:grid-rows-[auto_1fr_auto] sm:px-8 sm:py-7 lg:px-12 lg:py-9 xl:px-16">
        <header className="login-reveal flex items-center justify-between border-b border-white/[0.09] pb-4 sm:pb-5 [--reveal-delay:0ms]">
          <div className="flex items-center gap-3.5">
            <BrandMark />
            <div className="leading-none">
              <div className="text-[13px] font-extrabold uppercase tracking-[0.18em]">OpsDesk</div>
              <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-white/38">
                Operations command layer
              </div>
            </div>
          </div>
          <div className="hidden items-center gap-3 font-mono text-[9px] uppercase tracking-[0.16em] text-white/38 sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#73aaa5] opacity-30" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#73aaa5]" />
            </span>
            Authorization gateway online
          </div>
          <div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.14em] text-white/38 sm:hidden">
            <span className="h-1.5 w-1.5 rounded-full bg-[#73aaa5]" />
            Secure
          </div>
        </header>

        <div className="grid items-start gap-6 py-5 sm:items-center sm:gap-10 sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(390px,490px)] lg:gap-12 xl:gap-20">
          <section
            className="relative hidden min-h-[620px] lg:flex lg:flex-col lg:justify-between lg:py-8"
            aria-label="OpsDesk workspace map"
          >
            <div className="login-reveal relative max-w-[620px] [--reveal-delay:80ms]">
              <div className="mb-5 flex items-center gap-4">
                <span className="font-mono text-[10px] font-semibold tracking-[0.22em] text-[#7eb1ac]">
                  COMMAND ACCESS / 01
                </span>
                <span className="h-px w-16 bg-[#75a8a3]/35" />
              </div>
              <h1 className="max-w-[610px] text-5xl font-semibold leading-[0.98] tracking-[-0.06em] text-[#edf3f1] xl:text-[4.5rem]">
                See the whole operation. Move the right work.
              </h1>
              <p className="mt-6 max-w-[500px] text-sm leading-7 text-white/46">
                One protected command layer for delivery, people, pipeline dates, technology, and
                domain health.
              </p>
            </div>

            <AccessTopology />

            <div className="login-reveal relative grid grid-cols-[1.2fr_.8fr] border-t border-white/[0.09] pt-5 [--reveal-delay:420ms]">
              <SignalLine
                label="Workspace controls"
                value="Role-aware access active"
                icon={<ShieldCheck size={16} weight="duotone" />}
              />
              <SignalLine
                label="Session layer"
                value="Secure and encrypted"
                icon={<LockKey size={16} weight="duotone" />}
              />
            </div>
          </section>

          <section className="login-reveal relative mx-auto w-full max-w-[490px] [--reveal-delay:180ms]">
            <MobileSignalRail />
            <div className="absolute -left-3 top-9 hidden h-[calc(100%-4.5rem)] w-px bg-gradient-to-b from-transparent via-[#79aaa5]/35 to-transparent xl:block" />
            <div className="relative overflow-hidden rounded-[1.45rem] border border-white/[0.11] bg-[#e9efed] text-[#182224] shadow-[0_42px_110px_rgba(4,11,12,.32),inset_0_1px_0_rgba(255,255,255,.72)] sm:rounded-[2rem]">
              <div className="flex items-center justify-between border-b border-[#1d2a2c]/10 px-5 py-3.5 sm:px-8 sm:py-4">
                <div className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[#5f7071]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4f8d88]" />
                  Identity checkpoint
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#849190]">
                  OD-AUTH-01
                </span>
              </div>

              <div className="px-5 pb-5 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.19em] text-[#568681]">
                      Restricted workspace
                    </div>
                    <h2 className="mt-2.5 text-[1.8rem] font-semibold leading-none tracking-[-0.05em] text-[#182224] sm:mt-3 sm:text-[2.35rem]">
                      Identify yourself.
                    </h2>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#1d2a2c]/12 bg-white/45 text-[#4f817d] shadow-[inset_0_1px_0_rgba(255,255,255,.9)] sm:h-11 sm:w-11">
                    <LockKey size={19} weight="duotone" />
                  </div>
                </div>
                <p className="mt-2.5 text-[12px] leading-5 text-[#657575] sm:mt-3 sm:text-[13px] sm:leading-6">
                  Enter your credentials to open the operations command layer.
                </p>

                <form className="mt-5 space-y-4 sm:mt-7 sm:space-y-5" onSubmit={submit}>
                  <div className="space-y-2">
                    <Label
                      htmlFor="email"
                      className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#526263]"
                    >
                      Email address
                    </Label>
                    <Input
                      id="email"
                      autoComplete="email"
                      inputMode="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-11 rounded-xl border-[#bdcac8] bg-white/58 px-4 text-[13px] text-[#182224] shadow-[inset_0_1px_0_rgba(255,255,255,.72)] transition-[border-color,background-color,box-shadow] duration-300 placeholder:text-[#899695] hover:bg-white/72 focus-visible:border-[#5c918c] focus-visible:bg-white/82 focus-visible:ring-[#5c918c]/25 sm:h-12"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="password"
                      className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#526263]"
                    >
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="h-11 rounded-xl border-[#bdcac8] bg-white/58 px-4 pr-12 text-[13px] text-[#182224] shadow-[inset_0_1px_0_rgba(255,255,255,.72)] transition-[border-color,background-color,box-shadow] duration-300 hover:bg-white/72 focus-visible:border-[#5c918c] focus-visible:bg-white/82 focus-visible:ring-[#5c918c]/25 sm:h-12"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-[#71807f] transition-[color,background-color,transform] duration-300 hover:bg-[#dce5e2] hover:text-[#243334] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c918c]/40 sm:right-1.5 sm:top-1.5"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeSlash size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="border-l-2 border-[#a9554d] bg-[#a9554d]/8 px-4 py-3 text-[12px] leading-5 text-[#8a403a]"
                    >
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="group relative h-11 w-full overflow-hidden rounded-xl bg-[#223b3e] px-5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#edf5f2] shadow-[0_12px_24px_rgba(26,50,53,.16)] transition-[background-color,transform] duration-300 hover:bg-[#2b4a4d] active:translate-y-px disabled:opacity-70 sm:h-12 sm:text-[12px]"
                  >
                    <span className="relative flex w-full items-center justify-between">
                      {submitting ? "Verifying identity" : "Enter command layer"}
                      <ArrowRight
                        size={16}
                        weight="bold"
                        className="transition-transform duration-300 group-hover:translate-x-1"
                      />
                    </span>
                    {submitting && (
                      <span className="login-progress absolute inset-x-0 bottom-0 h-0.5 bg-[#7db2ac]" />
                    )}
                  </Button>
                </form>

                <div className="mt-5 grid grid-cols-[auto_1fr] gap-3 border-t border-[#1d2a2c]/10 pt-4 sm:mt-6 sm:pt-5">
                  <ShieldCheck className="mt-0.5 text-[#568681]" size={18} weight="duotone" />
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#455556]">
                      Demo access loaded
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-[#71807f] sm:text-[11px] sm:leading-5">
                      Administrator credentials are pre-filled for this demonstration.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between px-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white/30 sm:mt-4 sm:text-[9px] sm:tracking-[0.14em]">
              <span>Session logging active</span>
              <span>RBAC / Enabled</span>
            </div>
          </section>
        </div>

        <footer className="login-reveal hidden items-center justify-between border-t border-white/[0.09] pt-4 font-mono text-[9px] uppercase tracking-[0.14em] text-white/28 sm:flex [--reveal-delay:520ms]">
          <span>OpsDesk secure environment</span>
          <span className="hidden sm:inline">Projects · People · Pipeline · Infrastructure</span>
        </footer>
      </div>
    </main>
  );
}

function MobileSignalRail() {
  const signals = [
    { label: "Projects", icon: <GitBranch size={14} /> },
    { label: "People", icon: <UsersThree size={14} /> },
    { label: "Domains", icon: <GlobeHemisphereWest size={14} /> },
    { label: "Signals", icon: <Broadcast size={14} /> },
  ];

  return (
    <div className="mb-4 lg:hidden">
      <div className="mb-3 flex items-center gap-3 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-[#7eb1ac]">
        Command access / mobile
        <span className="h-px flex-1 bg-[#75a8a3]/20" />
      </div>
      <div className="grid grid-cols-4 divide-x divide-white/[0.08] border-y border-white/[0.08] py-3">
        {signals.map((signal) => (
          <div
            key={signal.label}
            className="flex min-w-0 flex-col items-center gap-1.5 px-1 text-[#78a9a5]"
          >
            {signal.icon}
            <span className="max-w-full truncate font-mono text-[7px] font-semibold uppercase tracking-[0.08em] text-white/38 min-[380px]:text-[8px]">
              {signal.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccessTopology() {
  return (
    <div className="login-reveal relative ml-[3%] h-[220px] w-[min(88%,720px)] shrink-0 overflow-hidden [--reveal-delay:260ms]">
      <div className="absolute left-[32%] top-[27%] h-28 w-28 rounded-full border border-[#7aaca7]/20" />
      <div className="absolute left-[27.5%] top-[9%] h-48 w-48 rounded-full border border-dashed border-[#7aaca7]/10" />
      <div className="absolute left-[35%] top-[40%] flex h-12 w-12 items-center justify-center rounded-full border border-[#7caca8]/30 bg-[#203033] text-[#8dbab6] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
        <Broadcast size={18} weight="duotone" />
        <span className="absolute h-full w-full animate-ping rounded-full border border-[#7caca8]/15" />
      </div>

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 720 220"
        fill="none"
        aria-hidden="true"
      >
        <path className="login-path" d="M274 118 C190 118 166 56 84 56" />
        <path className="login-path [animation-delay:350ms]" d="M274 118 C188 128 158 188 72 188" />
        <path className="login-path [animation-delay:700ms]" d="M318 118 C412 114 444 48 542 48" />
        <path
          className="login-path [animation-delay:1050ms]"
          d="M318 118 C418 124 476 182 650 182"
        />
        <circle cx="84" cy="56" r="3" fill="#79aaa5" fillOpacity=".8" />
        <circle cx="72" cy="188" r="3" fill="#79aaa5" fillOpacity=".8" />
        <circle cx="542" cy="48" r="3" fill="#79aaa5" fillOpacity=".8" />
        <circle cx="650" cy="182" r="3" fill="#79aaa5" fillOpacity=".8" />
      </svg>

      <TopologyNode className="left-0 top-2" label="Portfolio" icon={<GitBranch size={14} />} />
      <TopologyNode className="bottom-0 left-0" label="People" icon={<UsersThree size={14} />} />
      <TopologyNode
        className="right-[16%] top-0"
        label="Domain watch"
        icon={<GlobeHemisphereWest size={14} />}
      />
      <TopologyNode
        className="bottom-1 right-0"
        label="Delivery signals"
        icon={<Broadcast size={14} />}
      />

      <div className="login-scan-line pointer-events-none absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[#7cafaa]/45 to-transparent" />
    </div>
  );
}

function TopologyNode({
  className,
  icon,
  label,
}: {
  className: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className={`absolute flex items-center gap-2.5 ${className}`}>
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-[#7fb0ab]">
        {icon}
      </span>
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-white/50">
        {label}
      </span>
    </div>
  );
}

function SignalLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-[#76a9a4]">{icon}</span>
      <div>
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">
          {label}
        </div>
        <div className="mt-1.5 text-[11px] font-medium text-white/62">{value}</div>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-[1.05rem] border border-white/12 bg-[#e7efed] text-[#192426] shadow-[inset_0_1px_0_rgba(255,255,255,.75)]">
      <span className="text-[11px] font-black tracking-[-0.08em]">OD</span>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-[#639995]" />
    </div>
  );
}
