/**
 * Home page - Portfolio Website Home
 *
 * Includes:
 * - Hero section
 * - About section
 * - Skills section
 * - Projects grid
 * - Experience section
 * - Contact form
 * - SEO metadata
 */

import Metadata from "next/metadata";
import Image from "next/image";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { ContactForm } from "@/components/forms/ContactForm";
import type { ContactFormValues } from "@/src/lib/validations";

export default function HomePage() {
  const { theme, setTheme } = useTheme();

  const handleSubmit = async (data: ContactFormValues) => {
    // Submit via the API route
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (result.ok) {
      alert("Message sent successfully! I'll get back to you soon.");
    } else {
      alert("Failed to send message: " (result.error || "Unknown error"));
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-background via-gray-50 to-gray-100 py-24 md:py-32 relative">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid max-w-2xl">
            <div className="flex flex-col items-center md:flex-row md:items-start gap-6">
              <div>
                <h1 className="text-5xl md:text-6xl font-bold tracking-tighter mb-4">
                  "Hello, I'm Khushi"
                </h1>
                <p className="text-lg text-muted-foreground mb-8 max-w-md">
                  Full-Stack Developer building performant, accessible web experiences.
                </p>

                {/* Contact Form in Hero */}
                <ContactForm onSuccess={() => alert("Success!")} onError={(err) => alert(err)} />
              </div>

              {/* Theme toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTheme("light")}
                  className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                  aria-label="Light theme"
                >
                  {theme === "system" || theme === "light" ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                  aria-label="Dark theme"
                >
                  {theme === "dark" ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-4">About Me</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            I'm a full-stack developer passionate about building clean, maintainable
            software and beautiful user interfaces. I love working with modern
            stacks and constantly learning new technologies.
          </p>
        </div>
      </section>

      {/* Skills Section */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-4xl font-bold mb-6">Skills</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="p-4 rounded-md bg-white shadow-sm">
              <h3 className="font-medium">Next.js</h3>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-2">
                <div className="h-full bg-primary rounded-full" style={{ width: "80%" }} />
              </div>
            </div>
            <div className="p-4 rounded-md bg-white shadow-sm">
              <h3 className="font-medium">TypeScript</h3>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-2">
                <div className="h-full bg-primary rounded-full" style={{ width: "90%" }} />
              </div>
            </div>
            <div className="p-4 rounded-md bg-white shadow-sm">
              <h3 className="font-medium">React</h3>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-2">
                <div className="h-full bg-primary rounded-full" style={{ width: "75%" }} />
              </div>
            </div>
            <div className="p-4 rounded-md bg-white shadow-sm">
              <h3 className="font-medium">Tailwind CSS</h3>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-2">
                <div className="h-full bg-primary rounded-full" style={{ width: "70%" }} />
              </div>
            </div>
            <div className="p-4 rounded-md bg-white shadow-sm">
              <h3 className="font-medium">Prisma</h3>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-2">
                <div className="h-full bg-primary rounded-full" style={{ width: "60%" }} />
              </div>
            </div>
            <div className="p-4 rounded-md bg-white shadow-sm">
              <h3 className="font-medium">PostgreSQL</h3>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-2">
                <div className="h-full bg-primary rounded-full" style={{ width: "65%" }} />
              </div>
            </div>
            <div className="p-4 rounded-md bg-white shadow-sm">
              <h3 className="font-medium">Git</h3>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-2">
                <div className="h-full bg-primary rounded-full" style={{ width: "85%" }} />
              </div>
            </div>
            <div className="p-4 rounded-md bg-white shadow-sm">
              <h3 className="font-medium">Vercel</h3>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-2">
                <div className="h-full bg-primary rounded-full" style={{ width: "75%" }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-4xl font-bold mb-6">Featured Projects</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Project cards would go here - populated from MDX content */}
            <article className="p-6 rounded-md bg-white shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-xl font-medium mb-2">Project Name</h3>
              <p className="text-muted-foreground text-sm">Description goes here</p>
              <div className="mt-4 flex gap-2">
                <Link
                  href="/projects/project-name"
                  className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
                >
                  Live Demo
                </Link>
                <Link
                  href="https://github.com/khushihadhikari/project-name"
                  className="px-3 py-1.5 text-sm hover:underline"
                >
                  GitHub
                </Link>
              </div>
            </article>

            <article className="p-6 rounded-md bg-white shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-xl font-medium mb-2">Another Project</h3>
              <p className="text-muted-foreground text-sm">Another project description</p>
              <div className="mt-4 flex gap-2">
                <Link
                  href="/projects/another-project"
                  className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
                >
                  Live Demo
                </Link>
                <Link
                  href="https://github.com/khushihadhikari/another-project"
                  className="px-3 py-1.5 text-sm hover:underline"
                >
                  GitHub
                </Link>
              </div>
            </article>

            <article className="p-6 rounded-md bg-white shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-xl font-medium mb-2">Third Project</h3>
              <p className="text-muted-foreground text-sm">Third project description</p>
              <div className="mt-4 flex gap-2">
                <Link
                  href="/projects/third-project"
                  className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
                >
                  Live Demo
                </Link>
                <Link
                  href="https://github.com/khushihadhikari/third-project"
                  className="px-3 py-1.5 text-sm hover:underline"
                >
                  GitHub
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Experience Section */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-4xl font-bold mb-6">Experience</h2>
          <div>
            <div className="flex items-start gap-4">
              <div className="w-1 h-1 rounded-full bg-primary flex-shrink-0"></div>
              <div>
                <h3 className="font-medium">Full-Stack Developer</h3>
                <p className="text-muted-foreground text-sm">Portfolio Website Project</p>
                <p className="mt-1 text-sm">
                  Building personal portfolio with Next.js, TypeScript, and Tailwind CSS.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-24 md:py-32 bg-gradient-to-b from-gray-900 to-gray-800 text-white">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid max-w-2xl">
            <div>
              <h2 className="text-5xl font-bold mb-4">Get In Touch</h2>
              <p className="text-muted-foreground mb-8 max-w-md">
                Have a project in mind or just want to say hi? Fill out the form below
                and I'll get back to you within 48 hours.
              </p>
            </div>
            <ContactForm />
          </div>
        </div>
      </section>
    </main>
  );
}