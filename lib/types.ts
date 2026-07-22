// Schema documented in CLAUDE.md ("Video Schema") — kept in sync with
// scripts/build_videos_json.py's output, not redefined independently.

export interface Video {
  id: string;
  title: string;
  upload_date: string | null;
  air_date: string | null;
  era: string | null;
  type: string;
  series: string;
  episode: number | null;
  url: string;
  source: "youtube" | "okru";
  thumbnail: string;
  members: string[];
  tags: string[];
  song: string | null;
  subtitles: string | null;
  duration_sec: number | null;
  description: string | null;
  status: "active" | "private";
  view_count: number;
  like_count: number;
}

export interface Era {
  id: string;
  name: string;
  start: string;
}

export interface Comment {
  video_id: string;
  parent_comment_id: string | null;
  username: string;
  comment: string;
  posted_at: string;
}

// Local-echo-only shape — a comment this browser just submitted, merged
// into the display ahead of the live fetch. See hooks/useComments.ts.
export interface PendingComment {
  video_id: string;
  username: string;
  comment: string;
  pending: true;
}

export interface UserProfile {
  username: string;
  pin: string | null;
  favoriteMember: string | null;
  armyType: "new" | "veteran" | null;
  createdAt: string;
}

export const MEMBERS = ["RM", "Jin", "Suga", "J-Hope", "Jimin", "V", "Jungkook"] as const;
export type Member = (typeof MEMBERS)[number];
