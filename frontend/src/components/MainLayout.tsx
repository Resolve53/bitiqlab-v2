import { ReactNode, useState } from "react";
import { useRouter } from "next/router";

interface MainLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function MainLayout({ children, title }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-black">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Premium Sidebar */}
      <div
        className={`fixed left-0 top-0 h-screen w-64 bg-gradient-to-b from-slate-900 via-slate-950 to-black border-r border-slate-800/50 transition-all duration-300 z-40 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <SidebarContent sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      </div>

      {/* Main Content */}
      <main className="flex-1 w-full md:ml-64 transition-all duration-300">
        {/* Mobile Header */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800/50 px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-800/50 rounded-lg transition text-slate-300 hover:text-white"
          >
            <span className="text-2xl">☰</span>
          </button>
          <h1 className="text-lg font-bold text-white flex-1 ml-4">{title || "Bitiq Lab"}</h1>
        </div>

        {/* Premium Page Header */}
        {title && (
          <header className="hidden md:block border-b border-slate-800/50 bg-gradient-to-b from-slate-950 to-black/50 backdrop-blur sticky top-0 z-30">
            <div className="px-8 py-8">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                {title}
              </h1>
              <p className="text-slate-400 text-sm mt-2">Autonomous Trading & Strategy Research Platform</p>
            </div>
          </header>
        )}

        {/* Content with proper spacing */}
        <div className="pt-20 md:pt-0 px-4 md:px-8 lg:px-10 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function SidebarContent({
  sidebarOpen,
  setSidebarOpen,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}) {
  const router = useRouter();

  const navItems = [
    { label: "Dashboard", href: "/", icon: "📊", color: "from-cyan-500 to-blue-500" },
    { label: "Live Signals", href: "/live-signals", icon: "📡", color: "from-blue-500 to-purple-500" },
    { label: "Active Trades", href: "/active-trades", icon: "💹", color: "from-purple-500 to-pink-500" },
    { label: "Trade History", href: "/trade-history", icon: "📋", color: "from-pink-500 to-red-500" },
    { label: "Strategies", href: "/strategies", icon: "⚡", color: "from-orange-500 to-yellow-500" },
    { label: "On-Chain", href: "/on-chain", icon: "🔗", color: "from-green-500 to-cyan-500" },
    { label: "Calendar", href: "/calendar", icon: "📅", color: "from-indigo-500 to-blue-500" },
    { label: "Backtest", href: "/backtest", icon: "🧪", color: "from-violet-500 to-purple-500" },
    { label: "AI Generate", href: "/strategies/claude-generate", icon: "🤖", color: "from-cyan-500 to-teal-500" },
  ];

  return (
    <>
      {/* Premium Logo Section */}
      <div className="h-20 border-b border-slate-800/50 flex items-center px-4 gap-3 bg-gradient-to-r from-slate-900/50 to-transparent">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
          ⚡
        </div>
        <div>
          <p className="text-white font-bold text-lg">Bitiq Lab</p>
          <p className="text-xs text-slate-500">Enterprise Edition</p>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="p-1 hover:bg-slate-800/50 rounded-lg transition text-slate-400 md:hidden ml-auto"
        >
          ✕
        </button>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = router.pathname === item.href;
          return (
            <button
              key={item.href}
              onClick={() => {
                router.push(item.href);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group relative overflow-hidden ${
                isActive
                  ? "bg-gradient-to-r from-slate-800/80 to-slate-700/50 text-white border border-slate-700/50 shadow-lg shadow-blue-500/10"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border border-transparent"
              }`}
            >
              <span className="text-xl relative z-10">{item.icon}</span>
              <span className="flex-1 text-left font-medium text-sm relative z-10">{item.label}</span>
              {isActive && (
                <div className={`absolute inset-0 bg-gradient-to-r ${item.color} opacity-0 group-hover:opacity-5 transition-opacity rounded-lg`}></div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-4 my-4 h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent"></div>

      {/* Premium Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 to-transparent border-t border-slate-800/50">
        <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-lg p-3 mb-3 text-center">
          <p className="text-xs text-slate-300 font-medium">Version 1.0</p>
          <p className="text-xs text-slate-500">Enterprise Edition</p>
        </div>
        <button className="w-full px-4 py-2 text-sm font-semibold transition-all duration-200 bg-gradient-to-r from-red-600/80 to-red-700/80 hover:from-red-600 hover:to-red-700 text-white rounded-lg hover:shadow-lg hover:shadow-red-500/20 border border-red-500/30 hover:border-red-500/50">
          Logout
        </button>
      </div>
    </>
  );
}
