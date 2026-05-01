import { ReactNode, useState } from "react";
import { useRouter } from "next/router";

interface MainLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function MainLayout({ children, title }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-screen bg-slate-950 border-r border-slate-800 transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-20"
        } z-40`}
      >
        <SidebarContent sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      </div>

      {/* Main Content */}
      <main
        className={`flex-1 transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}
      >
        {/* Header */}
        {title && (
          <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-30">
            <div className="px-6 lg:px-8 py-6">
              <h1 className="text-3xl font-bold text-white">{title}</h1>
            </div>
          </header>
        )}

        {/* Content */}
        <div className="p-6 lg:p-8">{children}</div>
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
    { label: "Dashboard", href: "/", icon: "📊" },
    { label: "Strategies", href: "/strategies", icon: "⚡" },
    { label: "Analysis", href: "/analysis", icon: "📈" },
    { label: "Settings", href: "/settings", icon: "⚙️" },
  ];

  return (
    <>
      {/* Logo/Brand */}
      <div className="h-16 border-b border-slate-800 flex items-center justify-between px-4 gap-3">
        <div className={`flex items-center gap-2 ${!sidebarOpen && "hidden"}`}>
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">⚡</span>
          </div>
          <span className="text-lg font-bold text-white">Bitiq</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1 hover:bg-slate-800 rounded-lg transition text-slate-400"
        >
          {sidebarOpen ? "←" : "→"}
        </button>
      </div>

      {/* Navigation Items */}
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
            title={!sidebarOpen ? item.label : ""}
          >
            <span className="text-xl">{item.icon}</span>
            {sidebarOpen && <span className="flex-1 text-left">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800 p-4">
        <button
          className={`w-full px-4 py-2 text-sm font-semibold transition ${
            sidebarOpen
              ? "bg-slate-800 hover:bg-slate-700 text-white rounded-lg"
              : "text-slate-400 hover:text-white"
          }`}
        >
          {sidebarOpen ? "Logout" : "🚪"}
        </button>
      </div>
    </>
  );
}
