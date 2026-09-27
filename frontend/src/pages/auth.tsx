import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FcGoogle } from "react-icons/fc";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  evaluatePasswordStrength,
  passwordStrengthLabel,
} from "@/lib/password-strength";
import { cn } from "@/lib/utils";

function explainSignupEmailGap(errorMessage?: string | null): string {
  const msg = (errorMessage ?? "").toLowerCase();
  if (msg.includes("not authorized") || msg.includes("email address not authorized")) {
    return "Supabase default mail only delivers to project team emails. Add custom SMTP (Auth → SMTP) or use a team email.";
  }
  if (msg.includes("rate") || msg.includes("over_email_send_rate_limit")) {
    return "Default Supabase email is capped (~2/hour). Configure custom SMTP for real delivery.";
  }
  return "If no email arrives: confirm the address, check spam, and set custom SMTP in Supabase (built-in mail is not for production).";
}

export default function AuthPage() {
  const [, navigate] = useLocation();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(() => {
    if (typeof window === "undefined") return false;
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    return new URLSearchParams(hash).get("type") === "recovery";
  });
  const [newPassword, setNewPassword] = useState("");

  const strength = useMemo(
    () => evaluatePasswordStrength(recoveryMode ? newPassword : password),
    [newPassword, password, recoveryMode],
  );

  const authRedirectUrl = () => {
    const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    return new URL("/auth", appUrl).toString();
  };

  useEffect(() => {
    if (!loading && session && !recoveryMode) {
      navigate("/chat");
    }
  }, [session, loading, navigate, recoveryMode]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setError(null);
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: authRedirectUrl() },
      });
      if (error) setError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }
    if (isSignUp && !strength.ok) {
      setError(`Password is ${passwordStrengthLabel(strength.level).toLowerCase()}. ${strength.hints[0] ?? "Use a stronger password."}`);
      return;
    }
    setError(null);
    setMessage(null);
    setPendingConfirmEmail(null);
    setAuthLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: authRedirectUrl(),
          },
        });

        if (error) {
          setError(`${error.message} ${explainSignupEmailGap(error.message)}`);
        } else if (data.session) {
          setMessage("Account created. You're signed in.");
          navigate("/chat");
        } else if ((data.user?.identities?.length ?? 0) === 0) {
          setError("An account with this email may already exist. Sign in, or use Forgot password if you never got a confirmation email.");
        } else {
          setPendingConfirmEmail(email.trim());
          setMessage(
            `Confirmation email requested for ${email.trim()}. ${explainSignupEmailGap()}`,
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          setError(error.message);
        } else {
          navigate("/chat");
        }
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    const target = pendingConfirmEmail || email.trim();
    if (!target) {
      setError("Enter your email first.");
      return;
    }
    setAuthLoading(true);
    setError(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: target,
      options: { emailRedirectTo: authRedirectUrl() },
    });
    if (error) {
      setError(`${error.message} ${explainSignupEmailGap(error.message)}`);
    } else {
      setMessage(`Resent confirmation to ${target}. ${explainSignupEmailGap()}`);
    }
    setAuthLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Enter your email above, then click Forgot password.");
      return;
    }
    setAuthLoading(true);
    setError(null);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl(),
    });
    if (error) {
      setError(`${error.message} ${explainSignupEmailGap(error.message)}`);
    } else {
      setMessage(`Password reset requested for ${email.trim()}. ${explainSignupEmailGap()}`);
    }
    setAuthLoading(false);
  };

  const handleUpdatePassword = async () => {
    if (!strength.ok) {
      setError(`Password is ${passwordStrengthLabel(strength.level).toLowerCase()}. ${strength.hints[0] ?? "Use a stronger password."}`);
      return;
    }
    setAuthLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setError(error.message);
        return;
      }
      setRecoveryMode(false);
      setMessage("Password updated.");
      navigate("/chat");
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center overflow-y-auto bg-[var(--paper)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--slate)]" />
      </div>
    );
  }

  const strengthBarClass =
    strength.level === "too_weak"
      ? "bg-destructive"
      : strength.level === "weak"
        ? "bg-amber-500"
        : strength.level === "fair"
          ? "bg-[var(--navy)]"
          : "bg-[var(--status-success)]";

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-8 overflow-y-auto bg-[var(--paper)] p-4">
      <div className="brand-masthead welcome-greeting">
        <h1 className="brand-masthead-title">BestDel</h1>
        <div className="order-paper-rule welcome-rule" aria-hidden />
        <p className="welcome-hints text-sm text-[var(--slate)]">
          Indian Mock Parliament research desk
        </p>
      </div>

      <Card className="w-full max-w-sm border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-semibold tracking-tight text-[var(--ink)]">
            {recoveryMode ? "Choose a new password" : isSignUp ? "Create account" : "Sign in"}
          </CardTitle>
          <CardDescription>
            {recoveryMode
              ? "Set a new password for this account."
              : isSignUp
              ? "Create an account to save archives and research runs."
              : "Sign in to continue to your archives."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {recoveryMode ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUpdatePassword()}
                  disabled={authLoading}
                  className="rounded-md"
                  autoComplete="new-password"
                />
                {newPassword.length > 0 && (
                  <div className="space-y-1.5" aria-live="polite">
                    <div className="flex items-center justify-between gap-2 text-xs text-[var(--slate)]">
                      <span>Password strength</span>
                      <span className="font-medium text-[var(--ink)]">{passwordStrengthLabel(strength.level)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                      <div
                        className={cn("h-full transition-all", strengthBarClass)}
                        style={{ width: `${(strength.score / 4) * 100}%` }}
                      />
                    </div>
                    {!strength.ok && strength.hints[0] ? (
                      <p className="text-xs text-[var(--slate)]">{strength.hints[0]}</p>
                    ) : null}
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {message && <p className="text-sm text-[var(--status-success)]">{message}</p>}
              <Button
                className="w-full"
                onClick={handleUpdatePassword}
                loading={authLoading}
                disabled={authLoading || (newPassword.length > 0 && !strength.ok)}
              >
                Update password
              </Button>
            </>
          ) : (
            <>
          <Button
            variant="outline"
            className="relative w-full"
            onClick={handleGoogleSignIn}
            loading={authLoading}
            disabled={authLoading}
          >
            {!authLoading && <FcGoogle className="absolute left-4 h-5 w-5" />}
            <span className="text-sm font-medium">Continue with Google</span>
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[var(--surface)] px-2 text-[var(--slate)]">or</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                const value = e.target.value;
                setEmail(value);
                if (pendingConfirmEmail && value.trim() !== pendingConfirmEmail) {
                  setPendingConfirmEmail(null);
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && handleEmailAuth()}
              disabled={authLoading}
              className="rounded-md"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEmailAuth()}
              disabled={authLoading}
              className="rounded-md"
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
            {isSignUp && password.length > 0 && (
              <div className="space-y-1.5" aria-live="polite">
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--slate)]">
                  <span>Password strength</span>
                  <span className="font-medium text-[var(--ink)]">{passwordStrengthLabel(strength.level)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                  <div
                    className={cn("h-full transition-all", strengthBarClass)}
                    style={{ width: `${(strength.score / 4) * 100}%` }}
                  />
                </div>
                {!strength.ok && strength.hints[0] ? (
                  <p className="text-xs text-[var(--slate)]">{strength.hints[0]}</p>
                ) : null}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-[var(--status-success)]">{message}</p>}

          <Button
            className="w-full"
            onClick={handleEmailAuth}
            loading={authLoading}
            disabled={authLoading || (isSignUp && password.length > 0 && !strength.ok)}
          >
            {isSignUp ? "Create account" : "Sign in"}
          </Button>

          {!isSignUp && (
            <p className="text-center">
              <button
                type="button"
                className="text-sm font-medium text-[var(--navy)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline disabled:opacity-50"
                onClick={handleForgotPassword}
                disabled={authLoading}
              >
                Forgot password?
              </button>
            </p>
          )}

          {isSignUp && pendingConfirmEmail && (
            <p className="text-center">
              <button
                type="button"
                className="text-sm text-[var(--slate)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline disabled:opacity-50"
                onClick={handleResendConfirmation}
                disabled={authLoading}
              >
                Resend confirmation email
              </button>
            </p>
          )}

          <p className="text-center text-sm text-[var(--slate)]">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              className="font-medium text-[var(--navy)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setMessage(null);
                setPendingConfirmEmail(null);
              }}
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
