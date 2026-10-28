import nodemailer from "nodemailer";

export type SmtpMessage = {
  host: string;
  port: number;
  from: string;
  to: string;
  subject: string;
  text: string;
  user?: string;
  pass?: string;
  /** Implicit TLS (port 465). Otherwise STARTTLS is required. */
  secure?: boolean;
  /** PEM CA. Production omits this and uses the system trust store. */
  ca?: string;
  timeoutMs?: number;
  /** Test-only escape. Public boot rejects SMTP_INSECURE. */
  insecure?: boolean;
};

function safeAddress(value: string): string {
  if (!/^[^<>\r\n\s]+@[^<>\r\n\s]+$/.test(value)) throw new Error("smtp address");
  return value;
}

/** nodemailer: TLS certificate check, AUTH, timeouts, multiline replies. The body is the code; do not log it. */
export async function sendSmtp(opts: SmtpMessage): Promise<void> {
  const from = safeAddress(opts.from);
  const to = safeAddress(opts.to);
  if (/[\r\n]/.test(opts.subject)) throw new Error("smtp subject");
  const secure = opts.secure ?? opts.port === 465;
  const timeout = opts.timeoutMs ?? 10_000;
  const transport = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure,
    requireTLS: secure ? false : true,
    auth: opts.user ? { user: opts.user, pass: opts.pass ?? "" } : undefined,
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout,
    tls: {
      rejectUnauthorized: !opts.insecure,
      ca: opts.ca,
      servername: opts.host,
    },
  });
  try {
    await transport.sendMail({
      from,
      to,
      subject: opts.subject,
      text: opts.text,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  } finally {
    transport.close();
  }
}
