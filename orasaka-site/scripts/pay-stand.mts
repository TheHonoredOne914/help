import { startPayStand } from "../src/lib/payments/pay-stand";

const stand = await startPayStand({
  port: Number(process.env.PORT ?? 0),
  shopId: process.env.PAY_STAND_SHOP_ID,
  secret: process.env.PAY_STAND_SECRET,
});
console.log(`pay-stand ${stand.url}`);
console.log("Локальный HTTP-стенд оплаты, не магазин ЮKassa. Рестарт процесса стирает платежи.");
console.log(`YOOKASSA_SHOP_ID=${stand.shopId}`);
console.log(`YOOKASSA_SECRET_KEY=${stand.secret}`);
console.log(`YOOKASSA_API_BASE=${stand.url}/v3`);
console.log("YOOKASSA_LOCAL_STAND=1");
console.log("YOOKASSA_MODE=test");
