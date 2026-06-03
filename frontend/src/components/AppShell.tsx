import { ReactNode, useState } from "react";
import ConnectionBanner from "@/components/ConnectionBanner";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";

const MAIN_NAV = [
  { label: "Dashboard", href: "/dashboard", icon: "◆" },
  { label: "Strategies", href: "/strategies", icon: "◇", matchPrefix: "/strategies" },
  { label: "Paper Trading", href: "/paper-trading", icon: "○" },
  { label: "Trade History", href: "/trade-history", icon: "▤" },
  { label: "Live Signals", href: "/live-signals", icon: "◎" },
  { label: "On-Chain", href: "/on-chain", icon: "⬡" },
  { label: "Calendar", href: "/calendar", icon: "▦" },
  { label: "Backtest", href: "/backtest", icon: "▣" },
  { label: "Analysis", href: "/analysis", icon: "◈" },
  { label: "Settings", href: "/settings", icon: "⚙" },
];

const STRATEGY_SUB_NAV = [
  { label: "All strategies", href: "/strategies" },
  { label: "Compare", href: "/strategies/compare" },
  { label: "Create (AI)", href: "/strategies/claude-generate" },
  { label: "Create (manual)", href: "/strategies/new" },
  { label: "Pine debug", href: "/strategies/debug-pinescript" },
];

function isActive(pathname: string, href: string, matchPrefix?: string): boolean {
  if (matchPrefix) {
    return pathname.startsWith(matchPrefix);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-400 max-w-2xl">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(true);
  const pathname = router.pathname;
  const inStrategies = pathname.startsWith("/strategies");
  const strategyIdMatch = pathname.match(/^\/strategies\/([^/]+)/);
  const strategyId = strategyIdMatch?.[1];
  const isStrategyDetail =
    strategyId &&
    !["compare", "new", "claude-generate", "debug-pinescript"].includes(
      strategyId
    );

  return (
    <div className="flex min-h-screen bg-[#0a0e17] text-slate-100">
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-slate-800/80 bg-[#070b12] transition-all duration-200 ${
          open ? "w-60" : "w-[4.5rem]"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-800/80 px-4">
          {open && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 text-sm font-bold text-white">
                B
              </span>
              <span className="font-semibold text-white">Bitiq Lab</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Toggle sidebar"
          >
            {open ? "‹" : "›"}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {MAIN_NAV.map((item) => {
            const active = isActive(pathname, item.href, item.matchPrefix);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                }`}
              >
                <span className="w-5 text-center text-xs opacity-80">
                  {item.icon}
                </span>
                {open && <span>{item.label}</span>}
              </Link>
            );
          })}

          {inStrategies && open && (
            <div className="mt-6 pt-4 border-t border-slate-800/80">
              <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Strategy tools
              </p>
              {STRATEGY_SUB_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm transition ${
                    pathname === item.href
                      ? "text-cyan-300 bg-slate-800/80"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              {isStrategyDetail && (
                <>
                  <p className="px-3 mt-4 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    This strategy
                  </p>
                  <Link
                    href={`/strategies/${strategyId}/analysis`}
                    className={`block rounded-lg px-3 py-2 text-sm ${
                      pathname.includes("/analysis")
                        ? "text-cyan-300 bg-slate-800/80"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Analysis
                  </Link>
                  <Link
                    href={`/strategies/${strategyId}/trades`}
                    className={`block rounded-lg px-3 py-2 text-sm ${
                      pathname.includes("/trades")
                        ? "text-cyan-300 bg-slate-800/80"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Trade log
                  </Link>
                </>
              )}
            </div>
          )}
        </nav>

        <div className="border-t border-slate-800/80 p-3 space-y-2">
          {open && user && (
            <p className="px-2 text-xs text-slate-400 truncate" title={user.email}>
              Signed in as <span className="text-cyan-300 font-medium">{user.username || user.email}</span>
            </p>
          )}
          <button
            type="button"
            onClick={() => logout()}
            className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition ${
              open
                ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {open ? "Sign out" : "⎋"}
          </button>
          {open && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-xs text-amber-200/90">
              TradingView MCP is optional. Prices use Binance; reconnect TV when
              your subscription is active.
            </div>
          )}
        </div>
      </aside>

      <div
        className={`flex-1 transition-all duration-200 ${
          open ? "ml-60" : "ml-[4.5rem]"
        }`}
      >
        <main className="min-h-screen px-4 py-6 sm:px-8 sm:py-8 max-w-7xl mx-auto">
          <ConnectionBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
