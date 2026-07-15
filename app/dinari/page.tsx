"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@crossmint/client-sdk-react-ui";
import { DinariDashboard } from "@/components/dinari/Dashboard";

export default function DinariPage() {
  const { status: authStatus } = useAuth();
  const { wallet } = useWallet();
  
  // Redirect to home if not logged in
  useEffect(() => {
    if (authStatus !== "logged-in" && authStatus !== "initializing") {
      window.location.href = "/";
    }
  }, [authStatus]);
  
  if (authStatus === "initializing" || !wallet) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );
  }
  
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <DinariDashboard />
    </main>
  );
}