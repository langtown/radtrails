import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import SmoothScroll from "@/components/SmoothScroll";
import Script from "next/script";
import { Lato, Inter, Bricolage_Grotesque, Space_Grotesk, Fraunces } from "next/font/google";
import { homePageMeta } from "@/lib/content/home";
import { site } from "@/lib/content/site";
import "./globals.css";

const lato = Lato({
  variable: "--font-lato",
  weight: ["400", "700", "900"],
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  weight: ["600", "700", "800"],
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-mono-display",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-serif",
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.domain),
  title: {
    default: homePageMeta.title,
    template: "%s",
  },
  description: homePageMeta.description,
  keywords: homePageMeta.keywords,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: homePageMeta.title,
    description: homePageMeta.description,
    url: site.domain,
    siteName: site.name,
    images: [
      {
        url: "/images/home/hero-china-peak.jpg",
        width: 1200,
        height: 630,
        alt: "Ride and Develop mountain bike team",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: homePageMeta.title,
    description: homePageMeta.description,
    images: ["/images/home/hero-china-peak.jpg"],
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${lato.variable} ${inter.variable} ${bricolage.variable} ${spaceGrotesk.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        {/* Google Tag Manager */}
        <Script
          id="gtm-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-WV65K6G7');`,
          }}
        />
        {/* Google Analytics */}
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-55LWQ8NG00" strategy="afterInteractive" />
        <Script
          id="gtag-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-55LWQ8NG00');`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <SmoothScroll />
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-WV65K6G7"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <NavBar />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
