"use client"

import { useStoreUser } from "@/hooks/use-store-user"; //Custom hook to sync/store user in DB
import { SignInButton, SignedOut, SignUpButton, UserButton, SignedIn} from "@clerk/nextjs";
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation" // To check current route
import React from "react"
import {BarLoader} from 'react-spinners'
import { Authenticated, Unauthenticated } from "convex/react";
import { Button } from "./ui/button";
import { LayoutDashboard } from "lucide-react";

const Header =() => {
  const  {isLoading} = useStoreUser();
  const path = usePathname();

  return (
  <header className="fixed top-0 w-full border-b bg-white/95 backdrop-blur z-50 supports-[backdrop-filter]:bg-white/60">
    <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
      {/* Logo clickable to homepage */}
      <Link href="/" className="flex items-center gap-2">
        <Image
          src={"/logos/logo-s.png"}
          alt="SplitGenie Logo"
          width={200}
          height={60}
          className="h-11 w-auto object-contain"
        />
      </Link>

      {/* Show Features + How It Works links ONLY when path === "/" */}
      {path === "/" && (
        <div className="hidden md:flex items-center gap-6">
          <Link
            href="#features"
            className="text-sm font-medium hover:text-green-600 transition"
          >
            Features
          </Link>

          <Link
            href="#how-it-works"
            className="text-sm font-medium hover:text-green-600 transition"
          >
            How It Works
          </Link>
        </div>
      )}

      {/* Right side of header = Auth Buttons OR User Menu */}
      <div className="flex items-center gap-4">
        {/* When user IS logged in */}
        <Authenticated>
          {/* Dashboard button visible for logged in users */}
          <Link href="/dashboard">
            <Button
              variant="outline"
              className="hidden md:inline-flex items-center gap-2 hover:text-green-600 hover:border-green-600 transition"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Button>
            {/* Mobile icon button */}
            <Button variant="ghost" className="md:hidden w-10 h-10 p-0">
              <LayoutDashboard className="h-4 w-4" />
            </Button>
          </Link>

          {/* Clerk user dropdown (profile/logout) */}
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-10 h-10",
                userButtonPopoverCard: "shadow-xl",
                userPreviewMainIdentifier: "font-semibold",
              },
            }}
            afterSignOutUrl="/"
          />
        </Authenticated>

        {/* When user is NOT logged in */}
        <Unauthenticated>
          {/* Sign in button */}
          <SignInButton>
            <Button variant="ghost">Sign In</Button>
          </SignInButton>

          {/* Sign up button */}
          <SignUpButton>
            <Button className="bg-green-600 hover:bg-green-700 border-none">
              Get Started
            </Button>
          </SignUpButton>
        </Unauthenticated>
      </div>
    </nav>

    {/* Top loading bar when user syncing/loading */}
    {isLoading && <BarLoader width={"100%"} color="#36d7b7"/>}

  </header>
  );
}
export default Header;
