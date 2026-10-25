/**
 * Validation schemas using Zod for type-safe form validation.
 * The same schema is used on the client (React Hook Form resolver) and on the server (Route Handler).
 */

import { z } from "zod";

/**
 * Contact form submission schema.
 * - name: 2-80 characters
 * - email: valid email format
 * - message: 10-2000 characters
 * - website: honeypot field, must be empty
 * - captchaToken: required string
 */
export const contactFormSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be at most 80 characters"),
  email: z.string().email("Enter a valid email address"),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message must be at most 2000 characters"),
  // Honeypot field: must be empty to pass validation
  website: z.string().optional().default(""),
  captchaToken: z.string().nonempty("Captcha token is required"),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

/**
 * Prisma ContactMessage model shape (for reference).
 * See prisma/schema.prisma for the full definition.
 */
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  ipHash?: string;
  createdAt: Date;
  status: string;
}