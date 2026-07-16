import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Compass, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    document.title = t("notFound.documentTitle");
  }, [location.pathname, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-8 text-center glow-border">
        <div className="inline-flex items-center justify-center rounded-full bg-primary/10 p-3">
          <Compass className="h-6 w-6 text-primary" aria-hidden />
        </div>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">404</h1>
          <p className="text-sm text-muted-foreground">
            {t("notFound.description", { path: location.pathname })}
          </p>
        </div>
        <Button asChild className="mx-auto">
          <Link to="/">
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden />
            {t("notFound.backHome")}
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
