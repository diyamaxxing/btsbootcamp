// Replace with your GA4 Measurement ID from analytics.google.com (Admin > Data Streams > your site)
const GA_MEASUREMENT_ID = 'G-CMKTEM5XGY';

(function () {
  if (!GA_MEASUREMENT_ID || GA_MEASUREMENT_ID.includes('XXXX')) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);
})();
