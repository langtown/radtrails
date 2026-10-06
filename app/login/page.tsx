import type { Metadata } from "next";
import LoginOptions from "@/components/LoginOptions";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Ride and Develop.",
  robots: { index: false },
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return (
    <div className="grain flex min-h-[80vh] items-center bg-[#08080a] text-white">
      <div className="mx-auto w-full max-w-md px-5 py-20 md:px-8">
        <span className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">Welcome</span>
        <h1 className="display mt-4 text-4xl font-extrabold leading-[1.0] md:text-5xl">
          Sign <span className="serif-italic font-light">in</span>
        </h1>
        <p className="mt-4 text-white/55">
          Sign in to manage your rider or coach profile.
        </p>
        <LoginOptions />
      </div>
    </div>
  );
}
