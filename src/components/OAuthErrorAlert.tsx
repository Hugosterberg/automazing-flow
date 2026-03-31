import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OAuthErrorDetails } from "@/lib/oauthErrors";

type OAuthErrorAlertProps = {
  details: OAuthErrorDetails;
  message: string;
  onDismiss: () => void;
};

export function OAuthErrorAlert({ details, message, onDismiss }: OAuthErrorAlertProps) {
  return (
    <Card className="bg-destructive/10 border-destructive/30">
      <CardContent className="py-3 px-4 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-destructive">{message}</p>
          <div className="space-y-1 text-xs text-destructive/90">
            <p><span className="font-medium">Error:</span> <code>{details.code}</code></p>
            <p><span className="font-medium">Status code:</span> <code>{details.statusCode || "not provided"}</code></p>
            <p><span className="font-medium">Exception:</span> <code>{details.exception || "not provided"}</code></p>
            {details.hint && (
              <p><span className="font-medium">Hint:</span> {details.hint}</p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </CardContent>
    </Card>
  );
}
