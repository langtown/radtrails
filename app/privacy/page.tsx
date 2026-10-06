import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${site.name} collects, uses, and protects your information.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="grain bg-[#08080a] text-white">
      <div className="mx-auto max-w-3xl px-5 py-24 md:px-8 md:py-32">
        <span className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">Legal</span>
        <h1 className="display mt-5 text-4xl font-extrabold leading-[1.0] md:text-6xl">Privacy Policy</h1>
        <p className="mt-4 text-sm text-white/55">Last updated {site.legal.policiesUpdated}</p>

        <div className="mt-12 space-y-10 text-[15px] leading-relaxed text-white/70 md:text-base [&_h2]:display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mb-3 [&_a]:text-[#a8bd6a] [&_a]:underline [&_a]:underline-offset-4 [&_ul]:mt-3 [&_ul]:space-y-2 [&_li]:ml-5 [&_li]:list-disc">
          <section>
            <p>
              {site.legalName} (&ldquo;{site.name},&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) operates {site.domain}. We
              respect your privacy and collect only what we need to run the site and our programs. This policy explains
              what we collect, how we use it, and the choices you have.
            </p>
          </section>

          <section>
            <h2>Information we collect</h2>
            <ul>
              <li>
                <strong className="text-white">Account information.</strong> When you sign in with Google, we receive your
                name, email address, Google profile picture, and a unique Google account identifier. We do not receive your
                Google password.
              </li>
              <li>
                <strong className="text-white">Profile content.</strong> Information you choose to add to your rider or
                coach profile — display name, photo, bio, sponsors, and social links.
              </li>
              <li>
                <strong className="text-white">Usage data.</strong> Through Google Analytics and Google Tag Manager, we
                collect standard analytics such as pages visited, approximate location, device and browser type, and
                referring links, via cookies.
              </li>
              <li>
                <strong className="text-white">Messages.</strong> If you contact us, we keep the information you send.
              </li>
            </ul>
          </section>

          <section>
            <h2>How we use your information</h2>
            <ul>
              <li>To operate the site and your account, and to display approved profiles on our public pages.</li>
              <li>To review and moderate profile content before it is published.</li>
              <li>To respond to your inquiries and share team or program updates you&apos;ve asked for.</li>
              <li>To understand and improve how the site is used.</li>
            </ul>
          </section>

          <section>
            <h2>Donations and payment processing</h2>
            <p>
              Donations are processed by Givelify on their own platform. We never see or store your payment card details.
              Any information you provide during a donation is governed by Givelify&apos;s privacy policy, not this one.
            </p>
          </section>

          <section>
            <h2>Cookies and analytics</h2>
            <p>
              We use cookies set by Google Analytics and Google Tag Manager to measure site usage. You can block or delete
              cookies in your browser settings, and you can opt out of Google Analytics using the{" "}
              <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">
                Google Analytics opt-out add-on
              </a>
              . Blocking cookies will not break the site.
            </p>
          </section>

          <section>
            <h2>How we share information</h2>
            <p>
              We do not sell your personal information. We share it only with service providers that help us run the
              site — such as Google (sign-in and analytics), Cloudflare (hosting), and Givelify (donations) — and when
              required by law. Content you mark as public (an approved profile) is, by design, visible to anyone.
            </p>
          </section>

          <section>
            <h2>Children&apos;s privacy</h2>
            <p>
              Our programs include minors. We do not knowingly collect personal information from children under 13 online
              without verifiable parental consent. A minor&apos;s name, photo, or bio is published only with a
              parent or guardian&apos;s consent, and parents may contact us at any time to review, update, or remove it.
            </p>
          </section>

          <section>
            <h2>Your choices and rights</h2>
            <p>
              You can edit or request deletion of your profile and account information at any time. Depending on where you
              live (for example, under the California Consumer Privacy Act or the EU&apos;s GDPR), you may have the right to
              access, correct, delete, or port your personal information, and to opt out of certain processing. To make a
              request, email us at <a href={`mailto:${site.email}`}>{site.email}</a>.
            </p>
          </section>

          <section>
            <h2>Data retention and security</h2>
            <p>
              We keep personal information for as long as your account is active or as needed to operate our programs and
              meet legal obligations, then delete or anonymize it. We use reasonable safeguards to protect your
              information, though no method of transmission or storage is perfectly secure.
            </p>
          </section>

          <section>
            <h2>Changes to this policy</h2>
            <p>
              We may update this policy from time to time. We will revise the &ldquo;last updated&rdquo; date above when we
              do, and significant changes will be noted on this page.
            </p>
          </section>

          <section>
            <h2>Contact us</h2>
            <p>
              {site.legalName}
              <br />
              {site.address}
              <br />
              <a href={`mailto:${site.email}`}>{site.email}</a> &middot; <a href={site.phoneHref}>{site.phone}</a>
            </p>
            <p className="mt-6">
              See also our <Link href="/terms">Terms of Use</Link>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
