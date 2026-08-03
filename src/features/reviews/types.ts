export type ReviewItem = {
  id: string;
  author: string;
  rating?: number;
  /** Review headline (Judge.me reviews often carry one). */
  title?: string;
  text: string;
  createdAt?: string;
  url?: string;
  source?: string;
  /** Customer photos attached to the review (Judge.me): thumbnail + full-size. */
  pictures?: Array<{ thumb: string; full: string }>;
  /** Verified-buyer flag from the review platform (Judge.me). */
  verified?: boolean;
};
