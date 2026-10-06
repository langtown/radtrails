import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: `The terms that govern your use of ${site.name}'s website.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="grain bg-[#08080a] text-white">
      <div className="mx-auto max-w-3xl px-5 py-24 md:px-8 md:py-32">
        <span className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">Legal</span>
        <h1 className="display mt-5 text-4xl font-extrabold leading-[1.0] md:text-6xl">Terms of Use</h1>
        <p className="mt-4 text-sm text-white/55">Last updated {site.legal.policiesUpdated}</p>

        <div className="mt-12 space-y-10 text-[15px] leading-relaxed text-white/70 md:text-base [&_h2]:display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mb-3 [&_a]:text-[#a8bd6a] [&_a]:underline [&_a]:underline-offset-4 [&_ul]:mt-3 [&_ul]:space-y-2 [&_li]:ml-5 [&_li]:list-disc">
          <section>
            <p>
              These Terms of Use govern your access to and use of {site.domain}, operated by {site.legalName} (&ldquo;
              {site.name},&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;). By using the site, you agree to these terms. If you
              do not agree, please do not use the site.
            </p>
          </section>

          <section>
            <h2>Your account</h2>
            <p>
              Some features require signing in with Google. You are responsible for the activity on your account and for
              providing accurate information. You may stop using your account at any time, and we may suspend accounts that
              violate these terms.
            </p>
          </section>

          <section>
            <h2>Content you submit</h2>
            <p>
              You keep ownership of the profile content you submit (name, photo, bio, sponsors, links). By submitting it,
              you grant us a non-exclusive license to display it on the site in connection with our programs. You agree
              that you have the right to everything you upload — in particular, you must own or be licensed to use any
              photo you post, and must have consent from anyone pictured. Do not upload copyrighted images (including
              watermarked or stock photos) that you are not licensed to use. We review profile content and may edit or
              remove anything that is inaccurate, unlawful, or inappropriate.
            </p>
          </section>

          <section>
            <h2>Acceptable use</h2>
            <ul>
              <li>Don&apos;t use the site unlawfully, or to harass, impersonate, or harm others.</li>
              <li>Don&apos;t upload malware, attempt to breach security, or disrupt the service.</li>
              <li>Don&apos;t scrape, copy, or misuse others&apos; personal information from the site.</li>
            </ul>
          </section>

          <section>
            <h2>Donations</h2>
            <p>
              {site.name} is a {site.legal.taxStatus} nonprofit organization, and donations are tax-deductible to the
              extent allowed by law. Donations are processed by Givelify and are subject to Givelify&apos;s terms.
              Contributions are generally non-refundable; if you believe a donation was made in error, contact us at{" "}
              <a href={`mailto:${site.email}`}>{site.email}</a> and we&apos;ll work with you in good faith.
            </p>
          </section>

          <section>
            <h2>Our content</h2>
            <p>
              The site&apos;s design, text, logos, and graphics (other than content submitted by users or provided by
              third parties such as sponsors) belong to {site.name} and may not be copied or reused without permission.
            </p>
          </section>

          <section>
            <h2>Third-party links and services</h2>
            <p>
              The site links to third-party services such as Givelify and social media. We are not responsible for their
              content or practices, and your use of them is governed by their own terms and policies.
            </p>
          </section>

          <section>
            <h2>Disclaimers</h2>
            <p>
              The site is provided &ldquo;as is&rdquo; without warranties of any kind. We do our best to keep information
              accurate and the site available, but we do not guarantee that it will be error-free or uninterrupted.
            </p>
          </section>

          <section>
            <h2>Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, {site.name} will not be liable for any indirect, incidental, or
              consequential damages arising from your use of the site.
            </p>
          </section>

          <section>
            <h2>Governing law</h2>
            <p>
              These terms are governed by the laws of the State of California, without regard to its conflict-of-law rules.
            </p>
          </section>

          <section>
            <h2>Changes</h2>
            <p>
              We may update these terms from time to time. Continued use of the site after changes take effect means you
              accept the updated terms.
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
              See also our <Link href="/privacy">Privacy Policy</Link>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
