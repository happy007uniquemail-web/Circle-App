import { useState, type FormEvent } from 'react';
import { Film, Send, X } from 'lucide-react';
import { LIMITS } from '../types';
import { extractHashtags } from '../lib/format';
import { putVideo, validateVideo } from '../lib/media';
import { currentUserProfile, useActions, useAppState } from '../lib/store';
import Avatar from './Avatar';
import ImageUploader from './ImageUploader';
import { toast } from './Toast';

interface VideoDraft {
  ref: string;
  name: string;
  seconds: number;
}

/**
 * Home composer (POST-1/2, F-VID, F-HAS, MOD-4):
 * 1–500 chars + up to 4 photos **or** one ≤60 s video, with live hashtag preview.
 */
export default function PostComposer() {
  const state = useAppState();
  const actions = useActions();
  const me = currentUserProfile(state);
  const [body, setBody] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [video, setVideo] = useState<VideoDraft | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const remaining = LIMITS.postMax - body.length;
  const canPost = body.trim().length > 0 || images.length > 0 || !!video;
  const tags = extractHashtags(body);

  async function attachVideo(file: File | undefined) {
    if (!file) return;
    const check = await validateVideo(file);
    if (!check.ok) return toast(check.error, 'error');
    const ref = await putVideo(file);
    setImages([]); // video XOR photos
    setVideo({ ref, name: file.name, seconds: Math.round(check.duration) });
    toast(`Video attached (${check.duration.toFixed(1)}s).`, 'success');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (me?.isSuspended) return toast('Your account is suspended — posting is disabled.', 'error');
    setBusy(true);
    const result = await actions.createPost(body, video ? [] : images, video?.ref ?? null);
    setBusy(false);
    if (!result.ok) return toast(result.error ?? 'Could not create post.', 'error');
    setBody('');
    setImages([]);
    setVideo(null);
    toast('Posted!', 'success');
  }

  return (
    <form onSubmit={submit} className="card p-4">
      <div className="flex gap-3">
        <Avatar src={me.avatarUrl} name={me.displayName} size={40} />
        <div className="min-w-0 flex-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, LIMITS.postMax))}
            placeholder="What’s happening? #hashtags welcome"
            rows={2}
            aria-label={`Post text, ${remaining} characters remaining`}
            className="w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-slate-400"
          />

          {video && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm backdrop-blur-md">
              <Film size={15} className="text-brand-600" />
              <span className="min-w-0 flex-1 truncate">{video.name}</span>
              <span className="text-xs text-slate-400">{video.seconds}s</span>
              <button type="button" aria-label="Remove video" onClick={() => setVideo(null)} className="rounded-full p-1 text-slate-400 hover:bg-slate-200">
                <X size={14} />
              </button>
            </div>
          )}

          {!video && (
            <div className="mt-1">
              <ImageUploader value={images} onChange={setImages} label="none" />
            </div>
          )}

          {tags.length > 0 && (
            <p className="mt-1.5 truncate text-xs text-brand-600">
              {tags.map((t) => `#${t}`).join(' ')}
            </p>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <div className="flex items-center gap-1">
              {!video && (
                <span className="text-xs tabular-nums text-slate-400">{remaining} left</span>
              )}
              <label
                className={`cursor-pointer rounded-full p-2 transition ${video ? 'text-slate-300' : 'text-brand-600 hover:bg-brand-50'}`}
                title={video ? 'Remove the video to add photos' : `Attach a video (≤${LIMITS.videoMaxSeconds}s, ≤${Math.round(LIMITS.videoMaxBytes / 1048576)} MB)`}
              >
                <Film size={18} />
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  hidden
                  disabled={!!video}
                  onChange={(e) => {
                    void attachVideo(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <button type="submit" disabled={busy || !canPost} className="btn-primary px-4 py-1.5">
              <Send size={15} /> Post
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
