// ── Shared nav: home/browse links, search, persistent login state ──────────
//
// Every page that wants the standard nav puts an empty <nav id="site-nav">
// in its markup and calls renderNav({ depth }) — depth is the relative path
// back to the repo root ("" on mainmuster.html, "../" on everything under
// pages/), the same convention every other relative path on this site
// already follows (no URL-sniffing).
//
// Depends on auth.js being loaded first on the page — getSession() is
// reused as a global, same pattern comments.js already relies on.

function renderNav({ depth }) {
  const nav = document.getElementById("site-nav");
  if (!nav) return;

  const session = getSession();
  const authLink = session
    ? `<a href="${depth}pages/profile.html" class="nav-auth">${session}</a>`
    : `<a href="${depth}pages/profile.html" class="nav-auth">Log in</a>`;

  nav.innerHTML = `
    <a href="${depth}mainmuster.html"><strong>BTS Bootcamp</strong></a>
    <a href="${depth}pages/index.html">Browse</a>
    <form id="nav-search-form">
      <input id="nav-search-input" type="text" placeholder="Search videos…" />
    </form>
    ${authLink}
  `;

  // Always a real navigation to the browse page, never live/in-place
  // filtering — matches how every other page transition on this site is a
  // full reload, not client-side routing. A fresh search also intentionally
  // replaces whatever filter state happened to be active on that page
  // rather than merging with it.
  document.getElementById("nav-search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const term = document.getElementById("nav-search-input").value.trim();
    if (!term) return;
    window.location.href = `${depth}pages/index.html?search=${encodeURIComponent(term)}`;
  });
}
