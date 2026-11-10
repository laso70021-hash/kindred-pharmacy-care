import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, LogOut } from "lucide-react";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { PharmacyService } from "@/lib/pharmacy-service";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard | Swahivo Pharmacy AI" },
      { name: "description", content: "Platform administration for Swahivo Pharmacy AI: pharmacies, stock, sales and AI insights." },
      { property: "og:title", content: "Admin Dashboard | Swahivo Pharmacy AI" },
      { property: "og:description", content: "Platform administration for Swahivo Pharmacy AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const { isLoading, isSuperAdmin, profile, signOut } = useAuth();
  const { data: plans = [] } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: () => PharmacyService.getPlans(),
    enabled: isSuperAdmin,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F6FA] flex items-center justify-center text-sm font-semibold text-slate-500">
        Loading dashboard…
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight mb-2">Administrator access required</h1>
        <p className="text-slate-400 text-sm max-w-md mb-6">
          You're signed in as {profile?.email}, but this account isn't a platform administrator yet. Ask an
          existing administrator to grant you access.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate({ to: "/" })}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold text-sm transition-colors"
          >
            Back to website
          </button>
          <button
            onClick={() => void signOut()}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm flex items-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <ViewSwitcher current="admin" />
      <AdminDashboard onBackToLanding={() => navigate({ to: "/" })} plans={plans} />
    </div>
  );
}
