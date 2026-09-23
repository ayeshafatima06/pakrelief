import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter: any = null;
let isSimulatorMode = false;
let currentProvider = 'uninitialized';

// Initialize Nodemailer transporter
async function getTransporter(): Promise<{ mailer: any; isSimulator: boolean; provider: string }> {
  if (transporter) {
    return { mailer: transporter, isSimulator: isSimulatorMode, provider: currentProvider };
  }

  // 1. Check for Direct Gmail App Password credentials
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD
        }
      });
      isSimulatorMode = false;
      currentProvider = `Gmail SMTP (${process.env.GMAIL_USER})`;
      console.log(`[EmailService] Configured direct Gmail SMTP for ${process.env.GMAIL_USER}`);
      return { mailer: transporter, isSimulator: false, provider: currentProvider };
    } catch (e) {
      console.warn('[EmailService] Failed to initialize Gmail service transport:', e);
    }
  }

  // 2. Check for Generic Custom SMTP
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;

  if (host && user && pass) {
    try {
      transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
      });
      isSimulatorMode = false;
      currentProvider = `Custom SMTP (${host}:${port})`;
      console.log(`[EmailService] Configured live SMTP transport for ${host}`);
      return { mailer: transporter, isSimulator: false, provider: currentProvider };
    } catch (e) {
      console.warn('[EmailService] Failed to initialize custom SMTP transport:', e);
    }
  }

  // 3. Fallback: Ethereal Email test account for real SMTP email dispatch
  try {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    isSimulatorMode = true;
    currentProvider = 'Ethereal SMTP Test Server';
    console.log(`[EmailService] Created real test SMTP transporter with account: ${testAccount.user}`);
    return { mailer: transporter, isSimulator: true, provider: currentProvider };
  } catch (err) {
    console.warn('[EmailService] Failed to create Ethereal account, falling back to direct JSON transport:', err);
    transporter = nodemailer.createTransport({
      jsonTransport: true
    });
    isSimulatorMode = true;
    currentProvider = 'Local JSON Stream';
    return { mailer: transporter, isSimulator: true, provider: currentProvider };
  }
}

export async function sendOtpEmail(toEmail: string, otpCode: string): Promise<{
  success: boolean;
  previewUrl?: string | false;
  messageId?: string;
  isSimulator: boolean;
  provider: string;
}> {
  try {
    const { mailer, isSimulator, provider } = await getTransporter();

    const fromAddress = process.env.GMAIL_USER || process.env.SMTP_USER || 'noreply@pakrelief.gov.pk';

    const info = await mailer.sendMail({
      from: `"PakRelief Disaster Verification" <${fromAddress}>`,
      to: toEmail,
      subject: `PakRelief Verification Code: ${otpCode} (Expires in 1 minute)`,
      text: `Your PakRelief One-Time Password is: ${otpCode}\n\nThis verification code expires in exactly 1 minute (60 seconds) from issue. If you did not request this code, please disregard this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="background-color: #064e3b; padding: 16px; border-radius: 8px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 1px;">PakRelief</h1>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #a7f3d0;">Official National Disaster Relief Platform</p>
          </div>

          <div style="padding: 24px 0; text-align: center;">
            <p style="color: #475569; font-size: 14px; margin-bottom: 8px;">Your One-Time Password (OTP) for account verification is:</p>
            <div style="display: inline-block; background-color: #f0fdf4; border: 2px dashed #059669; padding: 14px 28px; border-radius: 8px; margin: 12px 0;">
              <span style="font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #064e3b; font-family: monospace;">${otpCode}</span>
            </div>
            <p style="color: #dc2626; font-size: 13px; font-weight: bold; margin-top: 12px;">
              ⏱ This code expires in exactly 1 minute (60 seconds).
            </p>
            <p style="color: #64748b; font-size: 12px; margin-top: 4px;">
              Enter this code in your PakRelief verification screen to complete your registration.
            </p>
          </div>

          <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
            <p style="margin: 0;">This is an automated transmission by PakRelief Statutory Consortium.</p>
            <p style="margin: 4px 0 0 0;">National Disaster Management Authority (NDMA) &bull; Islamabad, Pakistan</p>
          </div>
        </div>
      `
    });

    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) {
      console.log(`[EmailService] OTP sent to ${toEmail}. Real email preview URL: ${preview}`);
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: preview,
      isSimulator,
      provider
    };
  } catch (err: any) {
    console.error(`[EmailService] Error sending OTP email to ${toEmail}:`, err);
    return {
      success: false,
      isSimulator: isSimulatorMode,
      provider: currentProvider
    };
  }
}
