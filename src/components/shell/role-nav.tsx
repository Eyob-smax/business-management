import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Notebook,
  Store,
  Utensils,
  Wallet,
} from "lucide-react";
import { BottomNav } from "./bottom-nav";

/** The bottom bar for whichever role is signed in. Used by shared routes. */
export function RoleNav({ role }: { role: "admin" | "staff" }) {
  if (role === "admin") {
    return (
      <BottomNav
        items={[
          { href: "/admin", label: "Home", icon: <LayoutDashboard className="size-[21px]" /> },
          {
            href: "/admin/analytics",
            label: "Reports",
            icon: <BarChart3 className="size-[21px]" />,
          },
          { href: "/admin/log", label: "Day log", icon: <Notebook className="size-[21px]" /> },
          { href: "/admin/expenses", label: "Money", icon: <Wallet className="size-[21px]" /> },
          { href: "/admin/menu", label: "Menu", icon: <Utensils className="size-[21px]" /> },
        ]}
      />
    );
  }

  return (
    <BottomNav
      items={[
        { href: "/staff", label: "Sell", icon: <Store className="size-[21px]" /> },
        {
          href: "/staff/shift",
          label: "My sales",
          icon: <ClipboardList className="size-[21px]" />,
        },
        { href: "/notes", label: "Notes", icon: <MessageSquare className="size-[21px]" /> },
      ]}
    />
  );
}
