const paths: Record<string, React.ReactNode> = {
  android: (
    <>
      <path d="M6 10a6 6 0 0 1 12 0v7H6z" />
      <path d="M8.5 4.5 7 3M15.5 4.5 17 3" />
      <circle cx="9.5" cy="8" r="0.6" fill="currentColor" />
      <circle cx="14.5" cy="8" r="0.6" fill="currentColor" />
      <path d="M9 17v3M15 17v3" />
    </>
  ),
  apple: (
    <>
      <path d="M16.5 13.5c0 3-2 6-3.5 6-1 0-1.4-.6-2.5-.6s-1.6.6-2.5.6C6.5 19.5 4.5 16 4.5 13c0-3 1.8-4.8 3.8-4.8 1.1 0 1.8.7 2.7.7s1.4-.7 2.8-.7c1 0 2.1.5 2.9 1.5" />
      <path d="M12.5 5.5c.3-1.4 1.4-2.4 2.6-2.5-.1 1.4-1.2 2.6-2.6 2.5Z" />
    </>
  ),
  windows: (
    <>
      <path d="M4 5.5 11 4.5v7H4zM13 4.2l7-1v8.3h-7zM4 13h7v6.5l-7-1zM13 13h7v7.8l-7-1z" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
};

export function PlatformIcon({ name, className = "size-6" }: { name: string; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      {paths[name] ?? paths.monitor}
    </svg>
  );
}
