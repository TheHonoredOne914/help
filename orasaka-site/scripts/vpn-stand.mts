import { startVpnStand } from "../src/lib/vpn/stand";

const stand = await startVpnStand({
  port: Number(process.env.PORT ?? 0),
  token: process.env.VPN_API_TOKEN,
  clientId: process.env.TELEGRAM_LOGIN_CLIENT_ID,
  clientSecret: process.env.TELEGRAM_LOGIN_CLIENT_SECRET,
});
console.log(`vpn-stand ${stand.url}`);
