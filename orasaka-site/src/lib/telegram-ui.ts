export type TelegramUi =
  | { kind: "off" }
  | { kind: "double" }
  | { kind: "oidc"; clientId: string }
  | { kind: "widget"; botUsername: string };
