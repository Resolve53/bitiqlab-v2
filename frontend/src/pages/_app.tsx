import type { AppProps } from "next/app";
import { useState } from "react";
import "@/styles/globals.css";

// Sidebar Navigation
function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (open: boolean) => void }) {
  const { useRouter } = require("next/router");
  const router = useRouter();

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: "📊" },
    { label: "Strategies", href: "/strategies", icon: "⚡" },
    { label: "Analysis", href: "/analysis", icon: "📈" },
    { label: "Settings", href: "/settings", icon: "⚙️" },
  ];

  return (
    <div
      className={`fixed left-0 top-0 h-screen bg-slate-950 border-r border-slate-800 transition-all duration-300 ${
        isOpen ? "w-64" : "w-20"
      } z-40`}
    >
      {/* Logo */}
      <div className="h-16 border-b border-slate-800 flex items-center justify-between px-4 gap-3">
        <div className={`flex items-center gap-2 ${!isOpen && "hidden"}`}>
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">⚡</span>
          </div>
          <span className="text-lg font-bold text-white">Bitiq</span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 hover:bg-slate-800 rounded-lg transition text-slate-400"
        >
          {isOpen ? "←" : "→"}
        </button>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2">
        {navItems.map((item) => (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
              router.pathname === item.href
                ? "bg-blue-900/50 text-blue-300 border border-blue-700"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            {isOpen && <span className="flex-1 text-left">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800 p-4">
        <button
          className={`w-full px-4 py-2 text-sm font-semibold transition ${
            isOpen
              ? "bg-slate-800 hover:bg-slate-700 text-white rounded-lg"
              : "text-slate-400 hover:text-white"
          }`}
        >
          {isOpen ? "Logout" : "🚪"}
        </button>
      </div>
    </div>
  );
}

export default function App({ Component, pageProps }: AppProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <main
        className={`flex-1 transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}
      >
        <Component {...pageProps} />
      </main>
    </div>
  );
}
