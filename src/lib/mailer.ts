import nodemailer from "nodemailer";
import { ENV } from "../config/env";

const transporter = nodemailer.createTransport({
  host: ENV.SMTP_HOST,
  port: ENV.SMTP_PORT,
  secure: ENV.SMTP_SECURE, // false -> 587 STARTTLS; true -> 465 SSL
  auth: {
    user: ENV.SMTP_USER,
    pass: ENV.SMTP_PASS,
  },
  // Endurecer un poco sin romper certificados válidos
  tls: {
    minVersion: "TLSv1.2",
  },
  // timeouts razonables
  connectionTimeout: 20_000,
  greetingTimeout: 20_000,
  socketTimeout: 20_000,
});

function appUrl(path: string, token: string) {
  const trimmed = path.endsWith("/")
    ? path.slice(0, -1)
    : path;
  const sep = trimmed.includes("/:") ? "" : "/"; // si usas /:token, ya incluirá la barra
  return `${ENV.APP_PUBLIC_URL}${trimmed}${sep}${encodeURIComponent(token)}`;
}

/** Email de verificación */
export async function sendVerificationEmail(to: string, token: string) {
  const verifyUrl = appUrl(ENV.EMAIL_VERIFY_ROUTE, token);

  await transporter.sendMail({
    from: ENV.EMAIL_FROM,
    to,
    subject: `${ENV.APP_NAME} – Verifica tu correo`,
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
        <h2>${ENV.APP_NAME}</h2>
        <p>Gracias por registrarte. Para activar tu cuenta, verifica tu correo haciendo clic en el botón:</p>
        <p style="margin:16px 0">
          <a href="${verifyUrl}"
             style="display:inline-block;background:#06b6d4;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">
            Verificar correo
          </a>
        </p>
        <p>O copia y pega este enlace en tu navegador:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <hr/>
        <small>Si no creaste esta cuenta, ignora este mensaje.</small>
      </div>
    `,
  });
}

/** Email de restablecimiento de contraseña */
export async function sendPasswordResetEmail(to: string, token: string) {
  const resetUrl = appUrl(ENV.PASSWORD_RESET_ROUTE, token);

  await transporter.sendMail({
    from: ENV.EMAIL_FROM,
    to,
    subject: `${ENV.APP_NAME} – Restablece tu contraseña`,
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
        <h2>${ENV.APP_NAME}</h2>
        <p>Solicitaste restablecer tu contraseña. Abre el siguiente enlace para continuar:</p>
        <p style="margin:16px 0">
          <a href="${resetUrl}"
             style="display:inline-block;background:#0ea5e9;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">
            Restablecer contraseña
          </a>
        </p>
        <p>O copia y pega este enlace en tu navegador:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <hr/>
        <small>Si no fuiste tú, puedes ignorar este correo.</small>
      </div>
    `,
  });
}