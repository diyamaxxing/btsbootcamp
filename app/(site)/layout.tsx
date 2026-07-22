import Script from "next/script";
import { AuthProvider } from "@/hooks/useAuth";
import { Nav } from "@/components/Nav";

// GA4 Measurement ID — see the original js/analytics.js's comment: replace
// with your own from analytics.google.com (Admin > Data Streams > your
// site). Loaded on every page in this group, matching every original page
// except pages/admin.html and pages/data.html (see the root layout).
const GA_MEASUREMENT_ID = "G-CMKTEM5XGY";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {GA_MEASUREMENT_ID && !GA_MEASUREMENT_ID.includes("XXXX") && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}');
            `}
          </Script>
        </>
      )}
      <AuthProvider>
        <Nav />
        <main className="p-5">{children}</main>
      </AuthProvider>
    </>
  );
}
