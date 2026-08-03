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
  /** Customer photo URLs attached to the review (Judge.me). */
  pictures?: string[];
  /** Verified-buyer flag from the review platform (Judge.me). */
  verified?: boolean;
};
