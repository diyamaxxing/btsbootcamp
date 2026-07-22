// Content editor (#10) — not yet built. Ported as a stub, matching
// pages/admin.html's current unimplemented state. Deliberately outside the
// (site) route group: no Nav, no auth, no analytics — obscure by URL, not
// auth-gated, same as the original.
export default function AdminPage() {
  return (
    <>
      {/* add video form: all schema fields (id, title, date, era, type, url, members...) */}
      {/* edit existing entry by video ID */}
      {/* preview before save */}
      {/* writes to videos.json — mechanism not yet decided; api.js's old stub role was dropped in the migration, see CLAUDE.md */}
    </>
  );
}
