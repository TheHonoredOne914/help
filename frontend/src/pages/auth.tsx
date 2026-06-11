import { useState, useEffect } from "react";
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

export default function AuthPage() {
  const [, navigate] = useLocation();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const authRedirectUrl = () => {
    const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    return new URL("/auth", appUrl).toString();
  };

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && session) {
      navigate("/");
    }
  }, [session, loading, navigate]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setAuthLoading(true);
    // Use explicit app URL if configured, otherwise fall back to current origin.
    // In production, set VITE_APP_URL to your deployed domain (e.g. https://bestdel.app).
    // This MUST match the "Site URL" and "Redirect URLs" in your Supabase dashboard,
    // and the authorized redirect URIs in Google Cloud Console OAuth client.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authRedirectUrl() },
    });
    if (error) {
      setError(error.message);
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }
    setError(null);
    setMessage(null);
    setAuthLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: authRedirectUrl(),
        },
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage("Check your email to confirm your account.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        navigate("/");
      }
    }
    setAuthLoading(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {isSignUp ? "Create account" : "Welcome back"}
          </CardTitle>
          <CardDescription>
            {isSignUp ? "Sign up to get started" : "Sign in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google OAuth */}
          <Button
            variant="outline"
            className="w-full relative py-6"
            onClick={handleGoogleSignIn}
            disabled={authLoading}
          >
            {authLoading ? (
              <Loader2 className="absolute left-4 h-5 w-5 animate-spin" />
            ) : (
              <FcGoogle className="absolute left-4 w-5 h-5" />
            )}
            <span className="text-sm font-medium">Continue with Google</span>
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Email + Password */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEmailAuth()}
              disabled={authLoading}
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
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {message && (
            <p className="text-sm text-green-500">{message}</p>
          )}

          <Button
            className="w-full"
            onClick={handleEmailAuth}
            disabled={authLoading}
          >
            {authLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {isSignUp ? "Create account" : "Sign in"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              className="text-foreground underline-offset-4 hover:underline font-medium"
              onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
