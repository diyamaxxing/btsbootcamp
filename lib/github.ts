// Where the REAL, live user-generated data lives — never in this repo. See
// CLAUDE.md, "GitHub as the database."
export const DATA_OWNER = "diyamaxxing";
export const DATA_REPO = "bestofbootcamp";

export function rawContentUrl(path: string): string {
  return `https://raw.githubusercontent.com/${DATA_OWNER}/${DATA_REPO}/main/${path}`;
}
