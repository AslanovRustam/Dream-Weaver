/**
 * Shared queries for the history feature. Both /api/history (user) and
 * /api/admin/history (super-admin viewing someone else) call into here.
 *
 * Two clients can drive these:
 *   - user-scoped (Authorization header) — RLS picks user_id automatically
 *   - service-role + explicit user_id — admin viewing another user
 *
 * We always pass explicit user_id when present and let RLS validate it
 * on user-scoped calls; the admin path skips RLS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const BULK_CARD_LIMIT = 20;

export interface HistoryListFilters {
  /** Pagination: number of cards to skip. */
  offset?: number;
  /** Page size, clamped to MAX_PAGE_SIZE. */
  limit?: number;
  /** Full-text query against search_tsv. Empty / whitespace = no filter. */
  q?: string;
  /** Preset filter (preset1..preset4). */
  presetId?: string;
  /** Show only favorites. */
  favoritesOnly?: boolean;
  /** "active" (default) | "trash" (soft-deleted, in grace window). */
  bucket?: "active" | "trash";
}

export interface HistoryCardListItem {
  id: string;
  name: string;
  preset_id: string;
  is_favorite: boolean;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  deleted_at: string | null;
  hard_delete_after: string | null;
  master: {
    id: string | null;
    image_url: string | null;
    width: number | null;
    height: number | null;
    upload_status: string | null;
  } | null;
  resize_count: number;
}

export interface HistoryListResult {
  items: HistoryCardListItem[];
  total: number;
  offset: number;
  limit: number;
}

interface CardRow {
  id: string;
  name: string;
  preset_id: string;
  is_favorite: boolean;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  deleted_at: string | null;
  hard_delete_after: string | null;
}

/**
 * Fetch a paginated, filtered list of cards for a user. Each item gets
 * its master row attached (via a second query, joined in-memory) and a
 * resize count. We split the queries to keep the SQL simple and easy
 * to index.
 */
export async function listHistoryCards(
  supa: SupabaseClient,
  userId: string,
  filters: HistoryListFilters = {},
): Promise<HistoryListResult> {
  const limit = Math.min(Math.max(Number(filters.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const bucket = filters.bucket === "trash" ? "trash" : "active";

  let query = supa
    .from("generation_cards")
    .select(
      "id, name, preset_id, is_favorite, created_at, last_activity_at, expires_at, deleted_at, hard_delete_after",
      { count: "exact" },
    )
    .eq("user_id", userId);

  if (bucket === "active") {
    query = query.is("deleted_at", null);
  } else {
    query = query.not("deleted_at", "is", null);
  }

  if (filters.presetId) {
    query = query.eq("preset_id", filters.presetId);
  }
  if (filters.favoritesOnly) {
    query = query.eq("is_favorite", true);
  }
  if (filters.q && filters.q.trim()) {
    // Postgres FTS: textSearch matches against the search_tsv column.
    // websearch type accepts plain user queries ("спорт лига").
    query = query.textSearch("search_tsv", filters.q.trim(), {
      type: "websearch",
      config: "russian",
    });
  }

  query = query.order("last_activity_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`listHistoryCards: ${error.message}`);

  const cards = (data ?? []) as CardRow[];
  if (cards.length === 0) {
    return { items: [], total: count ?? 0, offset, limit };
  }

  const cardIds = cards.map((c) => c.id);

  // Pull all generations rows for these cards in one round-trip.
  const { data: gens, error: genErr } = await supa
    .from("generations")
    .select("id, card_id, is_master, image_url, upload_status, width, height")
    .in("card_id", cardIds)
    .is("deleted_at", null);
  if (genErr) throw new Error(`listHistoryCards generations: ${genErr.message}`);

  type GenRow = {
    id: string;
    card_id: string;
    is_master: boolean;
    image_url: string | null;
    upload_status: string | null;
    width: number | null;
    height: number | null;
  };
  const genByCard = new Map<string, GenRow[]>();
  for (const g of (gens ?? []) as GenRow[]) {
    const arr = genByCard.get(g.card_id) ?? [];
    arr.push(g);
    genByCard.set(g.card_id, arr);
  }

  const items: HistoryCardListItem[] = cards.map((card) => {
    const list = genByCard.get(card.id) ?? [];
    const master = list.find((g) => g.is_master) ?? null;
    const resize_count = list.filter((g) => !g.is_master).length;
    return {
      id: card.id,
      name: card.name,
      preset_id: card.preset_id,
      is_favorite: card.is_favorite,
      created_at: card.created_at,
      last_activity_at: card.last_activity_at,
      expires_at: card.expires_at,
      deleted_at: card.deleted_at,
      hard_delete_after: card.hard_delete_after,
      master: master
        ? {
            id: master.id,
            image_url: master.image_url,
            width: master.width,
            height: master.height,
            upload_status: master.upload_status,
          }
        : null,
      resize_count,
    };
  });

  return { items, total: count ?? items.length, offset, limit };
}

export interface HistoryCardDetail {
  id: string;
  user_id: string;
  name: string;
  preset_id: string;
  form_snapshot: Record<string, unknown>;
  is_favorite: boolean;
  inspired_by_card_id: string | null;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  deleted_at: string | null;
  hard_delete_after: string | null;
  master: HistoryGenerationItem | null;
  resizes: HistoryGenerationItem[];
}

export interface HistoryGenerationItem {
  id: string;
  public_id: string | null;
  is_master: boolean;
  image_url: string | null;
  ftp_path: string | null;
  filename: string | null;
  width: number | null;
  height: number | null;
  upload_status: string | null;
  upload_attempts: number | null;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
}

/**
 * Fetch a single card with its master + every resize. Caller passes
 * userId to enforce ownership unless the caller is super-admin (in
 * which case pass null to skip the check).
 */
export async function getHistoryCard(
  supa: SupabaseClient,
  cardId: string,
  ownerUserId: string | null,
): Promise<HistoryCardDetail | null> {
  let cardQuery = supa
    .from("generation_cards")
    .select(
      "id, user_id, name, preset_id, form_snapshot, is_favorite, inspired_by_card_id, created_at, last_activity_at, expires_at, deleted_at, hard_delete_after",
    )
    .eq("id", cardId);
  if (ownerUserId) cardQuery = cardQuery.eq("user_id", ownerUserId);
  const { data: card, error } = await cardQuery.maybeSingle();
  if (error) throw new Error(`getHistoryCard: ${error.message}`);
  if (!card) return null;

  const { data: gens, error: genErr } = await supa
    .from("generations")
    .select(
      "id, public_id, is_master, image_url, ftp_path, filename, width, height, upload_status, upload_attempts, next_retry_at, last_error, created_at, meta",
    )
    .eq("card_id", cardId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (genErr) throw new Error(`getHistoryCard generations: ${genErr.message}`);

  const list = (gens ?? []) as HistoryGenerationItem[];
  const master = list.find((g) => g.is_master) ?? null;
  const resizes = list.filter((g) => !g.is_master);

  return {
    id: card.id,
    user_id: card.user_id,
    name: card.name,
    preset_id: card.preset_id,
    form_snapshot: (card.form_snapshot as Record<string, unknown>) ?? {},
    is_favorite: card.is_favorite,
    inspired_by_card_id: card.inspired_by_card_id,
    created_at: card.created_at,
    last_activity_at: card.last_activity_at,
    expires_at: card.expires_at,
    deleted_at: card.deleted_at,
    hard_delete_after: card.hard_delete_after,
    master,
    resizes,
  };
}

export { BULK_CARD_LIMIT };
