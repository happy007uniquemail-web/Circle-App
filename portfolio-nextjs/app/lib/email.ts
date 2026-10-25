/**
 * Email sending helper using Resend.
 *
 * Requires the following environment variables:
 * - RESEND_API_KEY: Your Resend API key
 * - CONTACT_TO_EMAIL: The destination email address (Khushi's email)
 * - CONTACT_FROM_EMAIL: A verified sender address in Resend
 */

import resend from "resend";

const apiKey = process.env.RESEND_API_KEY;
const toEmail = process.env.CONTACT_TO_EMAIL;
const fromEmail = process.env.CONTACT_FROM_EMAIL;

if (!apiKey) {
  console.warn("RESEND_API_KEY environment variable is not set");
}
if (!toEmail) {
  console.warn("CONTACT_TO_EMAIL environment variable is not set");
}
if (!fromEmail) {
  console.warn("CONTACT_FROM_EMAIL environment variable is not set");
}

const resendClient = apiKey ? new resend.Resend(apiKey) : null;

/**
 * Sends a contact form submission email.
 * @param data The validated form data
 * @param ipHash Hashed IP address of the submitter
 * @returns Promise resolving to the Resend response
 */
export async function sendContactEmail(
  data: {
    name: string;
    email: string;
    message: string;
    website?: string;
  },
  ipHash?: string
) {
  if (!resendClient) {
    throw new Error("Resend client not initialized - missing API key");
  }

  if (!toEmail) {
    throw new Error("Recipient email not configured");
  }

  if (!fromEmail) {
    throw new Error("Sender email not configured");
  }

  const { data: emailData, error } = await resendClient.emails.send({
    from: fromEmail,
    to: toEmail,
    subject: `New contact form submission from ${data.name}`,
    html: `
      <h3>New Portfolio Contact Form Submission</h3>
      <p><strong>Name:</strong> ${data.name}</p>
      <p><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
      <p><strong>Message:</strong></p>
      <p>${data.message.replace(/\n/g, "<br>")}</p>
      ${data.website ? `<p><strong>Website (honeypot):</strong> ${data.website}</p>` : ""}
      ${ipHash ? `<p><strong>IP Hash:</strong> ${ipHash}</p>` : ""}
    `,
    text: `
New contact form submission from ${data.name}
Email: ${data.email}
Message: ${data.message}
IP Hash: ${ipHash || "not provided"}
`,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  return emailData;
}