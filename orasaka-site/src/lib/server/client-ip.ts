/**
 * nginx in front of the app, app port not reachable from the internet:
 *   proxy_set_header X-Forwarded-For $remote_addr;
 * That replaces the client header. Do not use $proxy_add_x_forwarded_for.
 * TRUST_PROXY=1 is the only value that reads the header, and only when it is
 * a single address. A list is ignored, so a spoofed prefix cannot open a new limit.
 */
const SINGLE_IP = /^(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9A-Fa-f:]{2,})$/;

export function clientIp(input: { trustProxy: boolean; forwardedFor: string | null; peerAddress: string | null }): string {
  if (input.trustProxy) {
    const value = (input.forwardedFor ?? "").trim();
    if (!value || value.includes(",") || !SINGLE_IP.test(value)) return "untrusted-forwarded";
    return value;
  }
  const peer = (input.peerAddress ?? "").trim();
  if (peer && !peer.includes(",") && SINGLE_IP.test(peer)) return peer;
  return "direct-peer";
}
