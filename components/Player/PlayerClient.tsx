"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Comment, Era, PendingComment, Video } from "@/lib/types";
import { fmtViews, ytId } from "@/lib/format";
import { buildRecommendations } from "@/lib/recommendations";
import { loadComments, commentsForVideo, pendingLocalComments } from "@/lib/comments";
import { Carousel } from "@/components/Carousel";
import { CommentSidebar } from "./CommentSidebar";

export function PlayerClient() {
  const searchParams = useSearchParams();
  const recordId = searchParams.get("id");

  const [videos, setVideos] = useState<Video[] | null>(null);
  const [eras, setEras] = useState<Era[] | null>(null);
  const [comments, setComments] = useState<(Comment | PendingComment)[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/videos.json").then((r) => r.json()),
      fetch("/data/eras.json").then((r) => r.json()),
      loadComments(),
    ])
      .then(([v, e, allComments]) => {
        setVideos(v);
        setEras(e);
        const video = v.find((x: Video) => x.id === recordId);
        if (video) {
          // Local echoes (this browser's own not-yet-live comments) go
          // first, ahead of whatever the live fetch currently has.
          const localPending = pendingLocalComments(allComments, video.id);
          setComments([...localPending, ...commentsForVideo(allComments, video.id)]);
        }
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  const video = videos?.find((v) => v.id === recordId) ?? null;

  useEffect(() => {
    if (video) document.title = `${video.title} — BTS Bootcamp`;
  }, [video]);

  if (error) return <p>Error: {error}</p>;
  if (!videos || !eras) return <p>Loading...</p>;
  if (!video) return <p>Video not found: {recordId}</p>;

  const id = ytId(video.url);
  const recs = buildRecommendations(video, videos, eras);
  const metaLine = [video.type, video.era, video.air_date].filter(Boolean).join(" · ");

  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-7 md:grid-cols-[1fr_320px]">
        <div className="aspect-video min-w-0">
          <iframe
            src={`https://www.youtube.com/embed/${id}?autoplay=1`}
            allow="autoplay; encrypted-media"
            allowFullScreen
            className="block h-full w-full border-0"
          />
        </div>
        <CommentSidebar
          videoId={video.id}
          comments={comments}
          onPosted={(c) => setComments((prev) => [c, ...prev])}
        />
      </div>

      <div className="mb-8 flex max-w-[860px] flex-col gap-1.5">
        <h1 className="text-[17px] leading-[1.4]">{video.title}</h1>
        <p className="text-[13px] text-muted-2">{metaLine}</p>
        {video.members?.length ? <p className="text-xs text-faint">{video.members.join(", ")}</p> : null}
        {video.view_count ? (
          <p className="text-xs text-faint-2">
            {fmtViews(video.view_count)} views · {(video.like_count || 0).toLocaleString()} likes
          </p>
        ) : null}
        {video.description ? <p className="mt-1 text-[13px] leading-[1.5] text-muted-2">{video.description}</p> : null}
      </div>

      <div>
        {recs.map((r) => (
          <Carousel key={r.title} title={r.title} videos={r.videos} thumbnailFor={(v) => {
            const ytid = ytId(v.url);
            return ytid ? `https://img.youtube.com/vi/${ytid}/mqdefault.jpg` : v.thumbnail;
          }} />
        ))}
      </div>
    </>
  );
}
