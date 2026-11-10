import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import LandingPage from "@/components/landing/LandingPage";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { PharmacyService } from "@/lib/pharmacy-service";
import { useAuth } from "@/hooks/useAuth";

const title = "Swahivo Pharmacy AI - Run Your Pharmacy Smarter with AI";
const description =
  "A complete pharmacy management system for pharmacies, chains and suppliers. Manage stock, sales, prescriptions, expiry, orders and deliveries — online and offline.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
  }),
  component: Home,
});

const stats = { pharmacies: 500, suppliers: 50, medicines: "1M+", accuracy: "98%" };

function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: plans = [] } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: () => PharmacyService.getPlans(),
  });

  return (
    <div className="relative">
      <ViewSwitcher current="landing" />
      <LandingPage
        onOpenDashboard={() => navigate({ to: "/admin" })}
        onSignIn={() => navigate({ to: "/auth" })}
        isSignedIn={Boolean(user)}
        plans={plans}
        stats={stats}
      />
    </div>
  );
}
