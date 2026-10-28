import { EmptyState } from "./states";
import { ButtonLink } from "./ui";

export function MissingOrder() {
  return (
    <EmptyState title="Номер заказа не указан">
      <p>Откройте заказ из истории покупок в кабинете или выберите тариф заново.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/account">В кабинет</ButtonLink>
        <ButtonLink href="/pricing" variant="secondary">
          К тарифам
        </ButtonLink>
      </div>
    </EmptyState>
  );
}
