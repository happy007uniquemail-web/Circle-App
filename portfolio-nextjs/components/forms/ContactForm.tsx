/**
 * ContactForm - Client component for the portfolio contact form.
 *
 * Features:
 * - Uses React Hook Form with Zod resolution for validation
 * - Includes honeypot field for spam protection
 * - Includes Cloudflare Turnstile captcha
 * - Handles form submission via API route
 * - Shows appropriate feedback to the user
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { contactFormSchema, type ContactFormValues } from "@/src/lib/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

export interface ContactFormProps {
  /** Optional onSuccess callback */
  onSuccess?: (data: ContactFormValues) => void;
  /** Optional onError callback */
  onError?: (error: string) => void;
}

export function ContactForm({ onSuccess, onError }: ContactFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: "",
      email: "",
      message: "",
      website: "",
      captchaToken: "",
    },
  });

  const onSubmit = async (data: ContactFormValues) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...data,
          // captchaToken is already in data from form defaults
        }),
      });

      const result = await response.json();

      if (result.ok) {
        setSuccess(true);
        if (onSuccess) {
          onSuccess(data);
        }
        // Reset form after a brief delay
        setTimeout(() => {
          reset();
          router.push("/");
        }, 3000);
      } else {
        setError(result.error || "Failed to submit form");
        if (onError) {
          onError(result.error || "Failed to submit form");
        }
      }
    } catch (err) {
      setError("Failed to submit form. Please try again.");
      if (onError) {
        onError("Failed to submit form");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="max-w-md w-full space-y-4"
      novalidate
    >
      {/* Honeypot field - hidden, never shown to real users */}
      <input
        {...register("website", { valueAsEmpty: "" })}
        type="text"
        name="website"
        style={{
          position: "absolute",
          left: "-9999px",
          opacity: 0,
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
        aria-hidden="true"
        placeholder="Leave this field blank"
      />

      {/* Name field */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Name
        </label>
        <input
          {...register("name")}
          type="text"
          name="name"
          required
          placeholder="Your name"
          className="
            w-full px-3 py-2 border border-gray-300 rounded-md
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            transition-colors
          "
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">
            {errors.name.message}
          </p>
        )}
      </div>

      {/* Email field */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Email
        </label>
        <input
          {...register("email")}
          type="email"
          name="email"
          required
          placeholder="your@example.com"
          className="
            w-full px-3 py-2 border border-gray-300 rounded-md
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            transition-colors
          "
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Message field */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Message
        </label>
        <textarea
          {...register("message")}
          rows={4}
          name="message"
          required
          placeholder="Your message..."
          className="
            w-full px-3 py-2 border border-gray-300 rounded-md
            resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            transition-colors min-h-[80px]
          "
        />
        {errors.message && (
          <p className="mt-1 text-sm text-red-600">
            {errors.message.message}
          </p>
        )}
      </div>

      {/* Captcha field - Turnstile widget */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Security verification
        </label>
        <div
          id="turnstile"
          data-site-key={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "your-site-key"}
          data-size="compact"
        />
        {error && (
          <p className="mt-1 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="
          w-full py-2 px-4 bg-blue-600 text-white rounded-md
          hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors
        "
      >
        {isSubmitting
          ? "Sending..."
          : "Send Message"}
      </button>

      {/* Form feedback */}
      {success && (
        <p className="mt-2 text-sm text-green-600">
          Your message has been sent! I'll get back to you soon.
        </p>
      )}

      {error && !success && (
        <p className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}