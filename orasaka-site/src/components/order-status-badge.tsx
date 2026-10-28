"use client";

import { ORDER_STATUS_META, type OrderStatus } from "@/lib/order-status";
import { useDict } from "./locale-provider";
import { Badge } from "./ui";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status];
  return <Badge tone={meta.tone}>{useDict().status[status]}</Badge>;
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
