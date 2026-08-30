"use client";
import * as React from "react";
import { Link } from "@/i18n/routing";
import { RefreshCw, Store } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/** The two things worth doing from the offline page. */
export function OfflineActions() {
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
          Go to the till
        </Button>
      </Link>

      <Button
        variant="secondary"
        size="lg"
        block
        icon={<RefreshCw className="size-4" />}
        onClick={() => window.location.reload()}
      >
        {online ? "Try again" : "Still offline - try anyway"}
      </Button>
    </div>
  );
}
