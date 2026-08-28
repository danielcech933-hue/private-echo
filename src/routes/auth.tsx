import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfile } from "@/services/contact-service";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Ciphra secure messenger" },
      {
        name: "description",
        content: "Sign in to Ciphra. Your encryption keys are generated on this device after login.",
      },
      { property: "og:title", content: "Sign in — Ciphra secure messenger" },
      { property: "og:description", content: "Sign in to your end-to-end encrypted account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  useEffect(() => {
    let mounted = true;

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || event !== "SIGNED_IN" || !session) return;
      void finishAuthentication();
    });

    void supabase.auth
      .getUser()
      .then(({ data: user, error }) => {
        if (!mounted) return;
        if (error) {
          toast.error(error.message);
          return;
        }
        if (user.user) void finishAuthentication();
      })
      .catch((error: unknown) => {
        if (mounted) toast.error(error instanceof Error ? error.message : "Unable to check session");
      })
      .finally(() => {
        if (mounted) setCheckingSession(false);
      });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };

    async function finishAuthentication() {
      if (!mounted) return;
      setBusy(true);
      try {
        const pending = window.sessionStorage.getItem("ciphra-pending-handle");
        if (pending) {
          await ensureProfile(pending);
          window.sessionStorage.removeItem("ciphra-pending-handle");
        }
        await navigate({ to: "/messages", replace: true });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Signed in, but account setup failed");
      } finally {
        if (mounted) {
          setBusy(false);
          setCheckingSession(false);
        }
      }
    }
  }, [navigate]);

  async function signIn() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) toast.error(error.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function signUp() {
    if (handle.trim().length < 3) {
      toast.error("Pick a handle with at least 3 characters");
      return;
    }
    if (password.length < 6) {
      toast.error("Use a password with at least 6 characters");
      return;
    }

    setBusy(true);
    window.sessionStorage.setItem("ciphra-pending-handle", handle.trim().toLowerCase());
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      if (!data.session) {
        setAwaitingConfirm(true);
        toast.success("Confirmation email sent");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account creation failed");
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        Checking secure session…
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.3em] uppercase">
          <Lock className="size-4 text-primary" /> Ciphra
        </div>

        {awaitingConfirm ? (
          <div className="mt-8 rounded-xl border border-border bg-card p-6 text-card-foreground">
            <h1 className="text-lg font-semibold">Check your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Confirm your address to finish creating the account. After confirmation, return to Ciphra and sign in.
            </p>
            <Button className="mt-6 w-full" variant="outline" onClick={() => setAwaitingConfirm(false)}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="signin" className="mt-8">
            <TabsList className="w-full">
              <TabsTrigger value="signin" className="flex-1">
                Sign in
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">
                Create account
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6 space-y-4">
              <Field label="Email" value={email} onChange={setEmail} type="email" />
              <Field label="Password" value={password} onChange={setPassword} type="password" />
              <Button className="w-full" disabled={busy} onClick={() => void signIn()}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="mt-6 space-y-4">
              <Field
                label="Handle"
                value={handle}
                onChange={setHandle}
                placeholder="your public identifier"
              />
              <Field label="Email" value={email} onChange={setEmail} type="email" />
              <Field label="Password" value={password} onChange={setPassword} type="password" />
              <Button className="w-full" disabled={busy} onClick={() => void signUp()}>
                {busy ? "Creating account…" : "Create account"}
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
