import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { apiJson } from "@/lib/apiJson";

export type MetaAdCommentPlatform = "facebook" | "instagram";

export type MetaAdComment = {
  id: string;
  message: string;
  createdAt: string | null;
  authorName: string;
  authorId: string | null;
  platform: MetaAdCommentPlatform;
  adId: string;
  adName: string;
  postId: string;
  pageId: string | null;
  canReply: boolean;
};

export type MetaAdCommentsResponse = {
  connected: boolean;
  accountName: string | null;
  comments: MetaAdComment[];
  adsScanned: number;
  needsReconnect: boolean;
  needsPages: boolean;
  note?: string;
};

export const META_AD_COMMENTS_KEY = ["marketing-ad-comments"] as const;

function profileQuery(businessProfileId: string | null | undefined): string {
  return businessProfileId
    ? `?business_profile_id=${encodeURIComponent(businessProfileId)}`
    : "";
}

export function useMetaAdComments(enabled = true) {
  const { enabled: authEnabled, user } = useAuth();
  const businessProfileId = useActiveBusinessProfileIdOptional();
  return useQuery<MetaAdCommentsResponse>({
    queryKey: [...META_AD_COMMENTS_KEY, user?.id ?? null, businessProfileId ?? null],
    queryFn: () =>
      apiJson<MetaAdCommentsResponse>(
        `/api/marketing/ad-comments${profileQuery(businessProfileId)}`,
        "Kunde inte ladda annonskommentarer."
      ),
    enabled: Boolean(authEnabled && enabled),
    staleTime: 60_000,
    meta: { silent: true },
  });
}

export function useReplyMetaAdComment() {
  const queryClient = useQueryClient();
  const businessProfileId = useActiveBusinessProfileIdOptional();
  return useMutation({
    mutationFn: (input: {
      commentId: string;
      message: string;
      platform: MetaAdCommentPlatform;
      pageId?: string | null;
    }) =>
      apiJson<{ ok: boolean; id?: string }>(
        `/api/marketing/ad-comments/reply${profileQuery(businessProfileId)}`,
        "Kunde inte skicka svar.",
        {
          method: "POST",
          body: {
            ...input,
            business_profile_id: businessProfileId,
          },
        }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: META_AD_COMMENTS_KEY });
    },
  });
}
