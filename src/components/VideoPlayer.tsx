import { useEffect, useState } from 'react';
import { Video, Download } from 'lucide-react';
import { downloadMedia, getVideoUrl } from '../lib/media';

interface Props {
  refKey: string; // `vid:` key or data URL
  className?: string;
  poster?: boolean; // show first frame only until played
  downloadable?: boolean;
  label: string;
}

/**
 * Lazily resolves a video reference (IndexedDB → object URL) and renders a
 * metadata-only player (F-VID, F-OPT: no bytes fetched until user plays).
 */
export default function VideoPlayer({ refKey, className = '', poster = true, downloadable = false, label }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);
    getVideoUrl(refKey).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [refKey]);

  if (failed) {
    return (
      <div className={`grid place-items-center rounded-xl border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-500 backdrop-blur-md ${className}`}>
        <Video size={22} className="mb-1" /> Video unavailable
      </div>
    );
  }
  if (!url) {
    return <div className={`animate-pulse rounded-xl bg-slate-200 ${className}`} aria-label="Loading video…" />;
  }

  return (
    <div className="relative">
      <video
        src={poster ? `${url}#t=0.1` : url}
        controls
        preload="metadata"
        playsInline
        aria-label={label}
        className={`w-full rounded-xl border border-white/10 bg-black ${className}`}
      />
      {downloadable && (
        <button
          type="button"
          onClick={() => void downloadMedia(refKey, 'circle-video.mp4')}
          className="tap44 absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
          aria-label="Download video"
        >
          <Download size={15} />
        </button>
      )}
    </div>
  );
}
