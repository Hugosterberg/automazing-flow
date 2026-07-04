import { Link } from "react-router-dom";
import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ContentIdeasLinkCard() {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          Content ideas
        </CardTitle>
        <CardDescription>
          Generate post ideas in Content, attach media, and publish in one flow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" size="sm">
          <Link to="/content?tab=create">Open Content →</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
