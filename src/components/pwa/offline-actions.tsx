"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { RefreshCw, Store } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/** The two things worth doing from the offline page. */
export function OfflineActions() {
  const t = useTranslations("OfflinePage");
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <div className="space-y-2.5">
      <Link href="/staff" className="block">
        <Button variant="primary" size="lg" block icon={<Store className="size-4" />}>
          {t("goToTill")}
        </Button>
      </Link>

      <Button
        variant="secondary"
        size="lg"
        block
        icon={<RefreshCw className="size-4" />}
        onClick={() => window.location.reload()}
      >
        {online ? t("tryAgain") : t("stillOffline")}
      </Button>
    </div>
  );
}
