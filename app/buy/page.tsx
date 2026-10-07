import type { Metadata } from "next";
import BuyForm from "@/components/BuyForm";
import { COMPANY } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Get Family Documents",
  description: `Every family paper in one private app on your phone. By ${COMPANY}.`,
};

// Public page (no login) where a new family picks a plan and sends us their details.
export default function BuyPage() {
  return <BuyForm upiId={process.env.UPI_ID ?? ""} />;
}
