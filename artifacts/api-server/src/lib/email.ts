import nodemailer, { type Transporter } from "nodemailer";

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: process.env["BREVO_SMTP_HOST"] ?? "smtp-relay.brevo.com",
    port: Number(process.env["BREVO_SMTP_PORT"] ?? 587),
    secure: false,
    auth: {
      user: process.env["BREVO_SMTP_USER"] ?? "",
      pass: process.env["BREVO_SMTP_PASS"] ?? "",
    },
  });
  return cachedTransporter;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const from = process.env["BREVO_FROM_EMAIL"] ?? "no-reply@collabry.co";
  await getTransporter().sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
