import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import "@lovable.dev/cloud-auth-js/styles.css";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In | Swahivo Pharmacy AI" },
      { name: "description", content: "Sign in or create your Swahivo Pharmacy AI account." },
      { property: "og:title", content: "Sign In | Swahivo Pharmacy AI" },
      { property: "og:description", content: "Sign in or create your Swahivo Pharmacy AI account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const labelClass = "block text-xs font-bold text-slate-700 uppercase mb-1";

function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user) navigate({ to: "/admin", replace: true });
  }, [isLoading, user, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/admin", replace: true });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/admin", data: { full_name: fullName } },
        });
        if (error) throw error;
        if (data.session) {
          navigate({ to: "/admin", replace: true });
        } else {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setNotice("If that email has an account, a reset link is on its way.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const handleOAuth = async (provider: "google" | "lovable") => {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin + "/auth" });
    if (result.error) {
      toast.error(result.error.message || "Sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/admin", replace: true });
  };

  const heading = mode === "signin" ? "Sign In to Swahivo" : mode === "signup" ? "Create your account" : "Reset your password";

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/60 via-white to-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <span className="text-2xl font-black leading-none">+</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-black tracking-tight text-blue-900 leading-none">SWAHIVO</span>
            <span className="text-[10px] font-bold tracking-widest text-blue-600 uppercase">Pharmacy AI</span>
          </div>
        </Link>

        <h1 className="font-bold text-slate-900 text-lg pt-1">{heading}</h1>

        {notice && (
          <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            {notice}
          </div>
        )}

        {mode !== "forgot" && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void handleOAuth("google")}
              className="w-full h-11 rounded-xl border border-[#747775] bg-white text-[#1F1F1F] text-sm font-medium flex items-center justify-center gap-[10px] px-3 hover:bg-slate-50 transition-colors"
            >
              <GoogleLogo />
              Continue with Google
            </button>
            <button type="button" className="lovable-auth-button w-full" onClick={() => void handleOAuth("lovable")}>
              Continue with Lovable
            </button>
            <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-400 uppercase pt-1">
              <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className={labelClass} htmlFor="fullName">Full name</label>
              <input id="fullName" className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
            </div>
          )}
          <div>
            <label className={labelClass} htmlFor="email">Email Address</label>
            <input id="email" type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@pharmacy.com" />
          </div>
          {mode !== "forgot" && (
            <div>
              <label className={labelClass} htmlFor="password">Password</label>
              <input id="password" type="password" required minLength={6} className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          {mode === "signin" && (
            <div className="text-xs text-right">
              <button type="button" onClick={() => setMode("forgot")} className="text-blue-600 hover:underline font-semibold">
                Forgot password?
              </button>
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-sm shadow-md transition-all"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Send reset link"}
          </button>
        </form>

        <div className="text-center text-xs text-slate-500">
          {mode === "signin" ? (
            <>
              New to Swahivo?{" "}
              <button onClick={() => setMode("signup")} className="text-blue-600 font-semibold hover:underline">Create an account</button>
            </>
          ) : (
            <button onClick={() => setMode("signin")} className="text-blue-600 font-semibold hover:underline">Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  );
}
