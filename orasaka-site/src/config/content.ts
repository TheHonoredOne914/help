import { catalogPriceLine } from "@/lib/catalog";
import { banners, brand, type BrandImage } from "./brand";

/* Copy is limited to what the bot's own materials state; anything else must come from the backend. */

export const features = [
  { code: "01", title: "Подписка под рукой", text: "Срок и статус читаются из кабинета. Нет активной подписки — это не пустая история покупок." },
  { code: "02", title: "Покупки в одном месте", text: "Заказы сайта и история Telegram показываются вместе: сумма, валюта, источник и статус." },
  { code: "03", title: "Устройства под контролем", text: "Список устройств берётся из ответа сервиса. Число регистраций — не «сейчас онлайн». Если онлайн не пришёл, статус так и подписан." },
] as const;

export const devices = [
  { id: "android", name: "Android", app: "Happ", icon: "android" },
  { id: "ios", name: "iOS", app: "Happ", icon: "apple" },
  { id: "windows", name: "Windows", app: "Happ", icon: "windows" },
  { id: "macos", name: "macOS", app: "Happ", icon: "monitor" },
] as const;

export const sections: { href: string; title: string; text: string; image: BrandImage }[] = [
  { href: "/pricing", title: "Тарифы", text: "Четыре срока, полная цена", image: banners.tariffs },
  { href: "/devices", title: "Устройства", text: "Android, iOS, Windows, macOS", image: banners.devices },
  { href: "/connect", title: "Инструкции", text: "Пошаговое подключение", image: banners.instructions },
  { href: "/account", title: "Кабинет", text: "Подписка и доступ в боте", image: banners.cabinet },
  { href: "/support", title: "Поддержка", text: "Помощь в Telegram", image: banners.support },
];

export const steps = [
  { title: "Выберите срок", text: "Четыре срока одного продукта. Полная цена видна до оплаты." },
  { title: "Оформите подписку", text: "Пока оплата на сайте не готова — в Telegram. Когда магазин и выдача готовы, основной путь на сайте." },
  { title: "Добавьте подключение", text: "Ссылку из кабинета или бота добавьте в приложение из инструкции и подключитесь." },
] as const;

export type FaqItem = { q: string; a: string; link?: { href: string; label: string } };

export const PAY_OFF = "Оформление подписки доступно в Telegram. Оплата на сайте включается, когда готовы магазин и выдача.";

export function faqGroupsFor(buyOnSite: boolean): { id: string; title: string; items: FaqItem[] }[] {
  const buy = buyOnSite
    ? "Оформить подписку можно на сайте: сумма берётся на сервере по выбранному сроку. Рядом остаётся Telegram."
    : PAY_OFF;
  const renew = buyOnSite
    ? "Продление — новый срок для уже существующей подписки, из кабинета или бота. Как именно срок прибавляется к текущему, сайт напишет после утверждения правила."
    : "Продлить доступ можно в Telegram-боте. Правило, как новый срок стыкуется с текущим, публикуется после утверждения.";
  const methods = buyOnSite
    ? "На сайте показываются только методы, которые реально подключены к магазину. Покупка в Telegram остаётся."
    : "Сейчас подписка покупается в Telegram. Способы ЮKassa на сайте появятся после подключения магазина, и только те, что у магазина включены.";
  return [
    {
      id: "subscription",
      title: "Подписка",
      items: [
        { q: "Сколько стоит подписка?", a: `${catalogPriceLine()}.`, link: { href: "/pricing", label: "Тарифы" } },
        { q: "Как оформить подписку?", a: buy },
        { q: "Как продлить доступ?", a: renew },
      ],
    },
    {
      id: "connect",
      title: "Подключение",
      items: [
        { q: "Какие приложения нужны?", a: "Инструкции сайта ведут в Happ и V2RayTun. Своего приложения ORASAKA нет.", link: { href: "/connect", label: "Подключение" } },
        { q: "Можно ли выбрать страну?", a: "В приложении выбирается локация из тех, что есть у сервиса. Полный список сайт не публикует, пока его нет в подтверждённой конфигурации." },
        { q: "Не получается подключиться?", a: `Напишите в поддержку через ${brand.telegramBot.handle}: устройство, приложение и что происходит при подключении.`, link: { href: "/support", label: "Поддержка" } },
      ],
    },
    {
      id: "payment",
      title: "Оплата",
      items: [
        { q: "Какие способы оплаты доступны?", a: methods },
        { q: "Я вернулся со страницы оплаты, но доступа нет", a: "Возврат на сайт оплату не доказывает. Статус заказа читает сервер. Если оплата уже есть, а доступ ещё выдаётся, кабинет так и пишет." },
      ],
    },
    {
      id: "account",
      title: "Аккаунт",
      items: [
        { q: "Как войти в кабинет на сайте?", a: "Код на email или подтверждённый Telegram id. Первый подтверждённый email создаёт аккаунт. Ранее оплаченная подписка находится по этому id, не по username." },
        { q: "Можно ли передавать ссылку подписки?", a: "Нет. Ссылка открывает доступ к вашему тарифу." },
      ],
    },
  ];
}

export const faqGroups = faqGroupsFor(false);
export const faqHighlights: FaqItem[] = [
  faqGroups[0].items[0],
  faqGroups[0].items[1],
  faqGroups[0].items[2],
  faqGroups[1].items[0],
  faqGroups[2].items[0],
];
