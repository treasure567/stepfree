import type { Metadata } from "next";
import { AccountScreen } from "@/features/account/account-screen";
import "@/features/account/account.css";

export const metadata: Metadata = {
  title: "Your accessibility profile | StepFree",
  description: "Save mobility needs and recent step-free journeys with StepFree.",
};

export default function AccountPage() {
  return <AccountScreen />;
}
