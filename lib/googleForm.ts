// Submits form data directly to a Google Form's response endpoint via a
// hidden iframe, so the visitor never leaves the page and no visible
// redirect happens. A real <form> POST (not fetch/XHR) is required because
// Google's formResponse endpoint sends no CORS headers — a fetch() call
// would be blocked from reading the response even though the submission
// itself would succeed; a form POST targeting a hidden iframe sidesteps
// that entirely since the browser doesn't apply CORS to form submissions
// the same way. Shared by useAuth's createUser() and lib/comments.ts's
// createComment() — previously js/comments.js reused js/auth.js's copy as
// an implicit global; this is the explicit version of that dependency.
//
// Deliberately does NOT resolve on the iframe's "load" event. Appending a
// src-less iframe fires an immediate load event for its initial blank
// document, before form.submit() has navigated it anywhere — listening for
// "load" resolves (and removes the iframe) on that premature blank-page
// event, not the real submission, which can abort the actual POST entirely
// if the iframe target no longer exists by the time the navigation would
// have started. Confirmed live: submissions silently vanished this way. A
// fixed delay before cleanup sidesteps the race — this pipeline already
// treats every write as "accepted, not confirmed" (no write here gets a
// real success signal anyway, since the response page is cross-origin and
// unreadable regardless), so trading event-based timing for a safe fixed
// wait costs nothing real. Preserve this exactly — it is a deliberate fix
// for a confirmed race, not simplifiable/cleanup-able dead code.
export function submitToGoogleForm(actionUrl: string, fields: Record<string, string>): Promise<void> {
  return new Promise((resolve) => {
    const iframeName = `gform-target-${Date.now()}`;
    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    const form = document.createElement("form");
    form.action = actionUrl;
    form.method = "POST";
    form.target = iframeName;
    form.style.display = "none";

    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
    form.remove();

    setTimeout(() => {
      iframe.remove();
      resolve();
    }, 1500);
  });
}
