declare module "nodemailer" {
  interface Options {
    host: string;
    port: number;
    secure: boolean;
    requireTLS: boolean;
    auth?: { user: string; pass: string };
    connectionTimeout: number;
    greetingTimeout: number;
    socketTimeout: number;
    tls: { rejectUnauthorized: boolean; ca?: string; servername: string };
  }
  interface Mail {
    from: string;
    to: string;
    subject: string;
    text: string;
    disableFileAccess: boolean;
    disableUrlAccess: boolean;
  }
  interface Transport {
    sendMail(mail: Mail): Promise<unknown>;
    close(): void;
  }
  const nodemailer: {
    createTransport(opts: Options): Transport;
  };
  export default nodemailer;
}
