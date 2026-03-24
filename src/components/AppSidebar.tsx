"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Patients", icon: "group", href: "/" },
  { label: "Rounding", icon: "clinical_notes", href: "/rounding" },
  { label: "Analytics", icon: "monitoring", href: "/analytics" },
  { label: "Settings", icon: "settings", href: "/settings" },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="hidden md:flex flex-col h-screen w-64 fixed left-0 top-0 bg-slate-50 z-40">
      {/* Logo */}
      <div className="px-6 py-8">
        <div
          className="font-extrabold text-2xl tracking-tight mb-10"
          style={{
            fontFamily: "var(--font-headline)",
            color: "var(--color-primary)",
          }}
        >
          Roundscribe
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1">
          {navItems.map(({ label, icon, href }) => {
            const active = isActive(href);
            return (
              <Link
                key={label}
                href={href}
                className={`flex items-center gap-3 px-4 py-3 rounded-l-lg ml-2 text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-white font-bold shadow-sm"
                    : "text-slate-600 hover:translate-x-1"
                }`}
                style={
                  active
                    ? { color: "var(--color-primary)" }
                    : { color: "#475569" }
                }
              >
                <span className="material-symbols-outlined">{icon}</span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Physician info + CTA */}
      <div className="mt-auto px-6 py-8 border-t border-slate-200/50">
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden text-sm font-bold"
            style={{
              backgroundColor: "var(--color-primary-container)",
              color: "var(--color-on-primary-container)",
            }}
          >
            DM
          </div>
          <div className="flex flex-col">
            <span
              className="text-sm font-bold"
              style={{ color: "var(--color-primary)" }}
            >
              Dr. Miller
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Internal Medicine
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span className="material-symbols-outlined text-sm">help</span>
            <span>Support</span>
          </span>
          <span className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span className="material-symbols-outlined text-sm">info</span>
            <span>Help</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
