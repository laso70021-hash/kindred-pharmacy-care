import { Link } from "@tanstack/react-router";

export function ViewSwitcher({ current }: { current: "landing" | "admin" | "account" }) {
  const base = "px-3 py-1 rounded-xl transition-all";
  const active = "bg-blue-600 text-white shadow-sm";
  const idle = "text-slate-300 hover:text-white hover:bg-slate-800";
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-slate-900/90 text-white backdrop-blur-md px-3 py-2 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-2 text-xs font-bold">
      <span className="text-[10px] text-slate-400 font-normal">Switch Screen:</span>
      <Link to="/" className={`${base} ${current === "landing" ? active : idle}`}>
        Public Landing
      </Link>
      <Link to="/account" className={`${base} ${current === "account" ? active : idle}`}>
        My Account
      </Link>
      <Link to="/admin" className={`${base} ${current === "admin" ? active : idle}`}>
        Admin Dashboard
      </Link>
    </div>
  );
}
