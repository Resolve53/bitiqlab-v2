import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "📊" },
  { label: "Strategies", href: "/strategies", icon: "⚡" },
  { label: "Analysis", href: "/analysis", icon: "📈" },
  { label: "Settings", href: "/settings", icon: "⚙️" },
];

export default function Sidebar() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-screen bg-slate-950 border-r border-slate-800 transition-all duration-300 ${
          isOpen ? "w-64" : "w-20"
        } z-40`}
      >
        {/* Logo/Brand */}
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

        {/* Navigation Items */}
        <nav className="p-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                router.pathname === item.href
                  ? "bg-blue-900/50 text-blue-300 border border-blue-700"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
              }`}
              title={!isOpen ? item.label : ""}
            >
              <span className="text-xl">{item.icon}</span>
              {isOpen && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800 p-4">
          <button className={`w-full px-4 py-2 text-sm font-semibold transition ${
            isOpen
              ? "bg-slate-800 hover:bg-slate-700 text-white rounded-lg"
              : "text-slate-400 hover:text-white"
          }`}>
            {isOpen ? "Logout" : "🚪"}
          </button>
        </div>
      </div>

      {/* Main content offset */}
      <div className={`transition-all duration-300 ${isOpen ? "ml-64" : "ml-20"}`}>
        {/* This will be filled by the layout */}
      </div>
    </>
  );
}
