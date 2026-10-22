import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Renders text with hashtags as links (F-HAS) and http(s) URLs as anchors.
 * React escapes the text nodes; only our own elements are markup.
 */
export default function RichText({ text, className = '' }: { text: string; className?: string }): ReactNode {
  const parts = text.split(/(#[\p{L}\p{N}_]+|https?:\/\/[^\s]+)/gu);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('#') && part.length > 1) {
          const tag = part.slice(1).toLowerCase();
          return (
            <Link
              key={i}
              to={`/hashtag/${encodeURIComponent(tag)}`}
              className="font-medium text-brand-600 hover:underline"
            >
              {part}
            </Link>
          );
        }
        if (/^https?:\/\//i.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-brand-600 hover:underline"
            >
              {part}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}
