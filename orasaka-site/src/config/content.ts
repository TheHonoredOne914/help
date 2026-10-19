import { banners, brand, type BrandImage } from "./brand";

/* Copy is limited to what the bot's own materials state; anything else must come from the backend. */

export const features = [
  { code: "01", title: "VLESS Reality", text: "Подключение по протоколу VLESS с Reality — так подписка настроена в боте." },
  { code: "02", title: "Happ и V2RayTun", text: "Ключ подписки импортируется в клиентские приложения Happ или V2RayTun." },
  { code: "03", title: "Личный кабинет", text: "Срок подписки, устройства и ключ подключения — в кабинете бота." },
  { code: "04", title: "Поддержка в Telegram", text: `Вопросы по подключению и оплате — в ${brand.telegramBot.handle}.` },
] as const;

export const devices = [
  { id: "android", name: "Android", app: "Happ", icon: "android" },
  { id: "ios", name: "iOS", app: "Happ", icon: "apple" },
  { id: "windows", name: "Windows", app: "Happ", icon: "windows" },
  { id: "macos", name: "macOS", app: "Happ", icon: "monitor" },
] as const;

export const sections: { href: string; title: string; text: string; image: BrandImage }[] = [
  { href: "/pricing", title: "Тарифы", text: "Сроки подписки из бота", image: banners.tariffs },
  { href: "/devices", title: "Устройства", text: "Android, iOS, Windows, macOS", image: banners.devices },
  { href: "/connect", title: "Инструкции", text: "Пошаговое подключение", image: banners.instructions },
  { href: "/account", title: "Кабинет", text: "Подписка, ключ, устройства", image: banners.cabinet },
  { href: "/support", title: "Поддержка", text: "Помощь в Telegram", image: banners.support },
];

export const steps = [
  { title: "Откройте бота", text: `Запустите ${brand.telegramBot.handle} в Telegram.` },
  { title: "Оформите подписку", text: "Выберите срок подписки в разделе тарифов бота и следуйте его подсказкам." },
  { title: "Импортируйте ключ", text: "Скопируйте ссылку подписки из кабинета и добавьте её в Happ или V2RayTun, затем подключитесь." },
] as const;

export type FaqItem = { q: string; a: string };

export const faqGroups: { id: string; title: string; items: FaqItem[] }[] = [
  {
    id: "subscription",
    title: "Подписка",
    items: [
      { q: "Где оформить подписку?", a: `В Telegram-боте ${brand.telegramBot.handle}. Оплата на этом сайте пока не подключена к реальным платёжным сервисам.` },
      { q: "Сколько стоит подписка?", a: "Актуальные сроки и цены показывает бот. На сайте тарифы появятся только после подключения к серверу тарифов — мы не публикуем цены вручную." },
      { q: "Есть ли пробный доступ?", a: "Условия пробного доступа, если он доступен, показывает бот. На сайте он появится только когда сервер сообщит о такой возможности." },
      { q: "Как продлить подписку?", a: "Продление оформляется в боте. После подключения сайта к серверу продлить можно будет и в личном кабинете — срок добавится к текущему." },
    ],
  },
  {
    id: "connect",
    title: "Подключение",
    items: [
      { q: "Какие приложения нужны?", a: "Бот выдаёт ключ для приложений Happ и V2RayTun. Подробные шаги для каждой платформы — в разделе «Подключение»." },
      { q: "Сколько устройств можно подключить?", a: "Лимит устройств зависит от тарифа и указывается в боте. Подключённые устройства видны в личном кабинете." },
      { q: "Можно ли выбрать страну сервера?", a: "Список доступных серверов и их статус показывает бот. Сайт не публикует географию серверов отдельно." },
      { q: "Не получается подключиться — что делать?", a: `Напишите в поддержку через ${brand.telegramBot.handle}: опишите устройство, приложение и что происходит при подключении.` },
    ],
  },
  {
    id: "payment",
    title: "Оплата",
    items: [
      { q: "Какие способы оплаты есть на сайте?", a: "Сейчас никакие: оплата на сайте отключена до согласования с платёжными провайдерами. В демо-версии работает только тестовая имитация без списания денег." },
      { q: "Можно ли оплатить Telegram Stars?", a: "Оплата Stars возможна только внутри Telegram-бота, по правилам Telegram." },
      { q: "Я вернулся со страницы оплаты, но доступа нет", a: "Статус подтверждается сервером у платёжного сервиса, а не страницей возврата. Если оплата прошла, доступ выдаётся автоматически — повторно платить не нужно." },
    ],
  },
  {
    id: "account",
    title: "Аккаунт и данные",
    items: [
      { q: "Как войти в кабинет на сайте?", a: "Вход через Telegram появится после согласования авторизации с сервером бота. Сейчас кабинет полностью доступен в боте; на сайте — демо-режим." },
      { q: "Можно ли передавать ссылку подписки?", a: "Нет. Ссылка подписки открывает доступ к вашему тарифу — не публикуйте и не пересылайте её." },
    ],
  },
];

export const faqHighlights: FaqItem[] = [faqGroups[0].items[0], faqGroups[0].items[1], faqGroups[1].items[0], faqGroups[2].items[0], faqGroups[1].items[3]];
