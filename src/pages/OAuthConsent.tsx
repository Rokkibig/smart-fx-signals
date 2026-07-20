import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

// Local typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthDetails = {
  client?: { name?: string; client_name?: string; redirect_uris?: string[] };
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
  requested_scopes?: string[];
};
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        setNeedsLogin(true);
        return;
      }
      try {
        const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) {
          setError(error.message);
          return;
        }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load authorization");
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = approve
        ? await oauth.approveAuthorization(authorizationId)
        : await oauth.denyAuthorization(authorizationId);
      if (error) {
        setBusy(false);
        setError(error.message);
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setBusy(false);
        setError("No redirect returned by the authorization server.");
        return;
      }
      window.location.href = target;
    } catch (e: any) {
      setBusy(false);
      setError(e?.message ?? "Request failed");
    }
  }

  async function signIn() {
    try {
      const { lovable } = await import("@/integrations/lovable/index");
      // Return to this exact consent URL after Google sign-in.
      await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.href,
      });
    } catch (e: any) {
      setError(e?.message ?? "Sign-in failed");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect to FX Signal Suite</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          {needsLogin && !error && (
            <>
              <p className="text-sm text-muted-foreground">
                Sign in to continue authorizing this connection.
              </p>
              <Button onClick={signIn} className="w-full">Sign in with Google</Button>
            </>
          )}

          {!needsLogin && !details && !error && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}

          {details && (
            <>
              <p className="text-sm">
                <strong>{details.client?.name ?? details.client?.client_name ?? "An app"}</strong>{" "}
                wants to use FX Signal Suite as you. It will be able to call this app's
                enabled tools while you are signed in.
              </p>
              <p className="text-xs text-muted-foreground">
                This does not bypass this app's permissions or backend policies.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => decide(true)} disabled={busy} className="flex-1">
                  {busy ? "…" : "Approve"}
                </Button>
                <Button
                  onClick={() => decide(false)}
                  disabled={busy}
                  variant="outline"
                  className="flex-1"
                >
                  Deny
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
