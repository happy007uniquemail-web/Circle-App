import { Link, useParams } from 'react-router-dom';
import CommentList from '../components/CommentList';
import PostCard from '../components/PostCard';
import { FeedSkeleton } from '../components/Skeleton';
import { useActions, useAppState, useDataReady } from '../lib/store';

/** `/p/:id` — single post detail with its comment thread (POST-5, ENG-2). */
export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const state = useAppState();
  const actions = useActions();
  const ready = useDataReady();
  const post = state.posts.find((p) => p.id === id);

  if (!ready && !post) return <FeedSkeleton n={1} />;

  if (!post || post.deletedAt) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-lg font-bold">Post unavailable</h1>
        <p className="mt-1 text-sm text-slate-600">This post was deleted by its author or an admin.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={() => void actions.refresh()} className="btn-ghost">Retry</button>
          <Link to="/home" className="btn-primary inline-flex">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Post by its author</h1>
      <PostCard item={{ post, reposterId: null, repostedAt: null }} />
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Comments</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <CommentList post={post} />
    </div>
  );
}
