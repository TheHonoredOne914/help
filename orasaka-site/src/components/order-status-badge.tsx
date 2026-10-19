import { ORDER_STATUS_META, type OrderStatus } from "@/lib/order-status";
import { Badge } from "./ui";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
