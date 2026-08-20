const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
// Nastavuje CI při buildu (fly.io build arg); lokálně není k dispozici.
const buildSha = process.env.NEXT_PUBLIC_BUILD_SHA;
const isDev = process.env.NODE_ENV !== "production";

export function AppVersion({ className }: { className?: string }) {
  const label = `v${version}${isDev ? "-dev" : ""}`;
  const sha = buildSha ? buildSha.slice(0, 7) : isDev ? "dev" : null;

  return (
    <span
      className={`text-[11px] text-muted-foreground/70 tabular-nums ${className ?? ""}`}
      title={sha ? `build ${sha}` : undefined}
    >
      {label}
      {sha ? <span className="ml-1 opacity-60">({sha})</span> : null}
    </span>
  );
}
