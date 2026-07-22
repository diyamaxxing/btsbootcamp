"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MEMBERS, type Era, type Video } from "@/lib/types";
import { byScore } from "@/lib/scoreVideo";
import { Card } from "@/components/Card";
import { EraRail } from "@/components/EraRail";

interface FilterState {
  types: Set<string>;
  members: Set<string>;
  eraFrom: string | null;
  eraTo: string | null;
  yearFrom: string | null;
  yearTo: string | null;
  search: string;
}

function parseParams(params: URLSearchParams): FilterState {
  const types = new Set<string>();
  const members = new Set<string>();
  (params.get("types") || "").split(",").filter(Boolean).forEach((t) => types.add(t));
  (params.get("members") || "").split(",").filter(Boolean).forEach((m) => members.add(m));
  return {
    types,
    members,
    eraFrom: params.get("eraFrom") || null,
    eraTo: params.get("eraTo") || null,
    yearFrom: params.get("yearFrom") || null,
    yearTo: params.get("yearTo") || null,
    search: params.get("search") || "",
  };
}

function isFiltered(state: FilterState): boolean {
  return !!(
    state.types.size ||
    state.members.size ||
    state.eraFrom ||
    state.eraTo ||
    state.yearFrom ||
    state.yearTo ||
    state.search
  );
}

export function BrowseClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [videos, setVideos] = useState<Video[] | null>(null);
  const [eras, setEras] = useState<Era[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Parsed once from the URL the page loaded with — thereafter this state
  // is the source of truth and pushes one-directionally to the URL (see the
  // effect below), same as the original's readFromURL()-once/pushToURL()
  // pattern.
  const [state, setState] = useState<FilterState>(() => parseParams(searchParams));
  const [openMenu, setOpenMenu] = useState<"type" | "member" | null>(null);

  useEffect(() => {
    Promise.all([fetch("/data/videos.json").then((r) => r.json()), fetch("/data/eras.json").then((r) => r.json())])
      .then(([v, e]) => {
        setVideos(v);
        setEras(e);
      })
      .catch((err) => setError(err.message));
  }, []);

  // Every checkbox/dropdown change updates the URL via replace, not push —
  // pushState here would fill browser history with one entry per filter
  // tweak, making back-button navigation useless.
  useEffect(() => {
    const p = new URLSearchParams();
    if (state.types.size) p.set("types", [...state.types].join(","));
    if (state.members.size) p.set("members", [...state.members].join(","));
    if (state.eraFrom) p.set("eraFrom", state.eraFrom);
    if (state.eraTo) p.set("eraTo", state.eraTo);
    if (state.yearFrom) p.set("yearFrom", state.yearFrom);
    if (state.yearTo) p.set("yearTo", state.yearTo);
    if (state.search) p.set("search", state.search);
    const qs = p.toString();
    router.replace(qs ? `/browse?${qs}` : "/browse", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    function closeMenus() {
      setOpenMenu(null);
    }
    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, []);

  if (error) return <p>Error: {error}</p>;
  if (!videos || !eras) return <p>Loading...</p>;

  // Folds in tags (Fancam, Music Show, etc.) alongside type — otherwise
  // tag-only categories would match videos in filtering but never get a
  // checkbox to select them from.
  const allTypes = [...new Set(videos.flatMap((v) => [v.type, ...(v.tags || [])]))].sort();
  const years = [...new Set(videos.filter((v) => v.air_date).map((v) => v.air_date!.slice(0, 4)))].sort();

  function eraIndex(name: string | null): number {
    if (!eras) return -1;
    return eras.findIndex((e) => e.name === name);
  }

  function applyFilters(): Video[] {
    const fromIdx = state.eraFrom ? eraIndex(state.eraFrom) : -Infinity;
    const toIdx = state.eraTo ? eraIndex(state.eraTo) : Infinity;

    return videos!
      .filter((v) => {
        if (v.status !== "active") return false;
        if (state.types.size && !state.types.has(v.type) && !(v.tags || []).some((t) => state.types.has(t))) {
          return false;
        }
        // Excludes full-group (all 7) videos from a member-filtered search —
        // otherwise every group MV/bomb/etc. would flood results for every
        // single member.
        if (state.members.size) {
          const members = v.members || [];
          if (members.length === 7 || !members.some((m) => state.members.has(m))) return false;
        }

        if (state.eraFrom || state.eraTo) {
          const idx = eraIndex(v.era);
          if (idx === -1 || idx < fromIdx || idx > toIdx) return false;
        }

        const year = v.air_date ? parseInt(v.air_date.slice(0, 4)) : null;
        if (state.yearFrom && (!year || year < parseInt(state.yearFrom))) return false;
        if (state.yearTo && (!year || year > parseInt(state.yearTo))) return false;

        if (state.search) {
          const term = state.search.toLowerCase();
          const inTitle = (v.title || "").toLowerCase().includes(term);
          const inSong = (v.song || "").toLowerCase().includes(term);
          if (!inTitle && !inSong) return false;
        }

        return true;
      })
      .sort(byScore);
  }

  const filtered = isFiltered(state) ? applyFilters() : [];

  function toggleSetValue(key: "types" | "members", value: string) {
    setState((s) => {
      const next = new Set(s[key]);
      next.has(value) ? next.delete(value) : next.add(value);
      return { ...s, [key]: next };
    });
  }

  function clearAll() {
    setState({ types: new Set(), members: new Set(), eraFrom: null, eraTo: null, yearFrom: null, yearTo: null, search: "" });
  }

  function toggleEra(eraName: string) {
    setState((s) =>
      s.eraFrom === eraName && s.eraTo === eraName
        ? { ...s, eraFrom: null, eraTo: null }
        : { ...s, eraFrom: eraName, eraTo: eraName }
    );
  }

  const tags: { label: string; onClear: () => void }[] = [];
  state.types.forEach((t) => tags.push({ label: t, onClear: () => toggleSetValue("types", t) }));
  state.members.forEach((m) => tags.push({ label: m, onClear: () => toggleSetValue("members", m) }));
  if (state.eraFrom) tags.push({ label: `Era from: ${state.eraFrom}`, onClear: () => setState((s) => ({ ...s, eraFrom: null })) });
  if (state.eraTo) tags.push({ label: `Era to: ${state.eraTo}`, onClear: () => setState((s) => ({ ...s, eraTo: null })) });
  if (state.yearFrom) tags.push({ label: `From ${state.yearFrom}`, onClear: () => setState((s) => ({ ...s, yearFrom: null })) });
  if (state.yearTo) tags.push({ label: `To ${state.yearTo}`, onClear: () => setState((s) => ({ ...s, yearTo: null })) });
  if (state.search) tags.push({ label: `Search: ${state.search}`, onClear: () => setState((s) => ({ ...s, search: "" })) });

  const disclaimer =
    state.types.has("Run BTS") && state.types.size === 1
      ? "Run BTS originally aired on V LIVE and is not sorted by era."
      : undefined;

  return (
    <>
      <EraRail eras={eras} videos={videos} mode="toggle" selectedEra={state.eraFrom === state.eraTo ? state.eraFrom : null} onToggle={toggleEra} />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setOpenMenu((m) => (m === "type" ? null : "type"))}
            className="border border-line-strong px-3.5 py-1.5 text-[13px] whitespace-nowrap text-ink-dim"
          >
            Type {state.types.size > 0 && (
              <span className="mr-1 inline-block rounded-full bg-ink px-1.5 text-[10px] font-bold text-base">
                {state.types.size}
              </span>
            )}
            ▾
          </button>
          {openMenu === "type" && (
            <div className="absolute top-[calc(100%+4px)] left-0 z-100 min-w-[180px] border border-line-strong bg-surface py-2">
              {allTypes.map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 px-3.5 py-1.5 text-[13px] whitespace-nowrap text-ink-dim hover:bg-elevated">
                  <input
                    type="checkbox"
                    checked={state.types.has(t)}
                    onChange={() => toggleSetValue("types", t)}
                    className="accent-ink"
                  />
                  {t}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setOpenMenu((m) => (m === "member" ? null : "member"))}
            className="border border-line-strong px-3.5 py-1.5 text-[13px] whitespace-nowrap text-ink-dim"
          >
            Member {state.members.size > 0 && (
              <span className="mr-1 inline-block rounded-full bg-ink px-1.5 text-[10px] font-bold text-base">
                {state.members.size}
              </span>
            )}
            ▾
          </button>
          {openMenu === "member" && (
            <div className="absolute top-[calc(100%+4px)] left-0 z-100 min-w-[180px] border border-line-strong bg-surface py-2">
              {MEMBERS.map((m) => (
                <label key={m} className="flex cursor-pointer items-center gap-2 px-3.5 py-1.5 text-[13px] whitespace-nowrap text-ink-dim hover:bg-elevated">
                  <input
                    type="checkbox"
                    checked={state.members.has(m)}
                    onChange={() => toggleSetValue("members", m)}
                    className="accent-ink"
                  />
                  {m}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] tracking-[0.08em] text-faint-2 uppercase">Era</label>
            <select
              value={state.eraFrom ?? ""}
              onChange={(e) => setState((s) => ({ ...s, eraFrom: e.target.value || null }))}
              className="border border-line-strong bg-base px-2.5 py-1.5 text-[13px] text-ink-dim"
            >
              <option value="">From</option>
              {eras.map((e) => (
                <option key={e.id} value={e.name}>
                  {e.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-ghost">→</span>
            <select
              value={state.eraTo ?? ""}
              onChange={(e) => setState((s) => ({ ...s, eraTo: e.target.value || null }))}
              className="border border-line-strong bg-base px-2.5 py-1.5 text-[13px] text-ink-dim"
            >
              <option value="">To</option>
              {eras.map((e) => (
                <option key={e.id} value={e.name}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-[11px] tracking-[0.08em] text-faint-2 uppercase">Year</label>
            <select
              value={state.yearFrom ?? ""}
              onChange={(e) => setState((s) => ({ ...s, yearFrom: e.target.value || null }))}
              className="border border-line-strong bg-base px-2.5 py-1.5 text-[13px] text-ink-dim"
            >
              <option value="">From</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <span className="text-xs text-ghost">→</span>
            <select
              value={state.yearTo ?? ""}
              onChange={(e) => setState((s) => ({ ...s, yearTo: e.target.value || null }))}
              className="border border-line-strong bg-base px-2.5 py-1.5 text-[13px] text-ink-dim"
            >
              <option value="">To</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {tags.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {tags.map((tag, i) => (
            <span key={i} className="flex items-center gap-1.5 border border-line-hover bg-elevated px-2.5 py-1 text-xs text-ink-dim">
              {tag.label}
              <button type="button" onClick={tag.onClear} className="p-0 text-sm text-muted-2">
                ×
              </button>
            </span>
          ))}
          <button type="button" onClick={clearAll} className="ml-1 text-xs text-faint-2 underline">
            Clear all
          </button>
        </div>
      ) : (
        <p className="mb-4 text-[13px] text-ghost italic">Select filters above to search the archive.</p>
      )}

      {isFiltered(state) &&
        (filtered.length ? (
          <>
            <div className="mb-4 text-[13px] text-faint-2">{filtered.length.toLocaleString()} videos</div>
            {disclaimer && <p className="mb-2.5 text-[11px] text-faint-2 italic">{disclaimer}</p>}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
              {filtered.map((v) => (
                <Card key={v.id} video={v} variant="grid" />
              ))}
            </div>
          </>
        ) : (
          <p className="py-5 text-faint-2">No videos match these filters.</p>
        ))}
    </>
  );
}
