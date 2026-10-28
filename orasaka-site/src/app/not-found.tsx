import { ButtonLink, Container } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="py-28 text-center">
      <p className="font-mono text-sm tracking-[0.3em] text-accent">ERROR 404</p>
      <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Страница не найдена</h1>
      <p className="mx-auto mt-4 max-w-md text-muted">Возможно, адрес изменился. Вернитесь на главную.</p>
      <ButtonLink href="/" className="mt-8">
        На главную
      </ButtonLink>
    </Container>
  );
}
