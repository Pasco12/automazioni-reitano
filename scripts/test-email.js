require('dotenv').config();
const nodemailer = require('nodemailer');

async function main() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_TO'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`Configurazione mancante nel file .env: ${missing.join(', ')}`);
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.verify();
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: process.env.MAIL_TO,
    subject: 'Test email Reitano Automazioni',
    text: `Test email riuscito. Data: ${new Date().toLocaleString('it-IT')}`
  });

  console.log('Email test inviata correttamente.');
  console.log(`Message ID: ${info.messageId}`);
}

main().catch((error) => {
  console.error('Errore invio email test:');
  console.error(error.message);
  process.exit(1);
});
