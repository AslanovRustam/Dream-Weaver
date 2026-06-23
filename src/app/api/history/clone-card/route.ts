// POST /api/history/clone-card
// Body: { source_card_id: string, preset_id?: string, name?: string }
//
// Creates a new generation_cards row that re-uses the master image of
// `source_card_id` but lives under a new preset / category. Used when
// the user loads a master from history and then switches the preset on
// the main form — resizes from that point should land in the NEW
// preset's history, not bleed into the original card.
//
// Implementation: shallow copy. The new card's master row references
// the EXACT same FTP file (image_url / ftp_path) as the source's
// master — no new FTP upload. `public_id` is fresh so the row has a
// unique identity in the DB. `inspired_by_card_id` records the
// provenance for the audit trail.
//
// Retention note: two cards can share an ftp_path now. The retention
// worker still hard-deletes per row; physical file collision will
// happen if both cards expire. Acceptable for MVP since clones are
// rare. A future improvement is FTP-path ref-counting.
import { randomUUID } from "node:crypto";

import { authErrorResponse, getUserClient, requireUser } from "@/lib/auth-server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logAudit, logSystem } from "@/lib/logger";

type Body = {
  source_card_id?: string;
  preset_id?: string;
  name?: string;
};

export async function POST(request: Request) {
        try {
          const user = await requireUser(request);

          let body: Body;
          try {
            body = (await request.json()) as Body;
          } catch {
            return Response.json({ error: "Invalid JSON" }, { status: 400 });
          }

          const sourceCardId = (body.source_card_id || "").trim();
          if (!sourceCardId) {
            return Response.json({ error: "source_card_id required" }, { status: 400 });
          }

          // RLS check: confirm the caller owns the source card before
          // we let them clone it.
          const userSupa = getUserClient(user.accessToken);
          const { data: source, error: sourceErr } = await userSupa
            .from("generation_cards")
            .select("id, name, preset_id, form_snapshot")
            .eq("id", sourceCardId)
            .maybeSingle();
          if (sourceErr) {
            return Response.json({ error: sourceErr.message }, { status: 500 });
          }
          if (!source) {
            return Response.json({ error: "Source card not found" }, { status: 404 });
          }

          // Find the source's master generation so we can re-point the
          // new card at the same FTP file.
          const supa = getAdminClient();
          const { data: master, error: masterErr } = await supa
            .from("generations")
            .select("image_url, ftp_path, filename, width, height, upload_status")
            .eq("card_id", sourceCardId)
            .eq("is_master", true)
            .is("deleted_at", null)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (masterErr) {
            return Response.json({ error: masterErr.message }, { status: 500 });
          }
          if (!master?.image_url) {
            return Response.json(
              { error: "Source card has no usable master image" },
              { status: 400 },
            );
          }

          const newPreset = (body.preset_id || source.preset_id || "").trim();
          // Strip any prior "(новая категория)" suffix(es) from the source
          // name so cloning a clone doesn't accumulate the marker like
          // "Турнир НБА на Венере (новая категория) (новая категория)".
          const baseName = (source.name || "")
            .replace(/(?:\s*\(новая категория\))+\s*$/i, "")
            .trim();
          const cloneName = (body.name || `${baseName} (новая категория)`).trim().slice(0, 120);

          // Create the clone card.
          const { data: card, error: cardErr } = await supa
            .from("generation_cards")
            .insert({
              user_id: user.id,
              name: cloneName,
              preset_id: newPreset,
              form_snapshot: source.form_snapshot ?? {},
              inspired_by_card_id: sourceCardId,
            })
            .select("id")
            .single();
          if (cardErr || !card) {
            void logSystem({
              level: "error",
              category: "history",
              message: "clone-card: cards insert failed",
              user_id: user.id,
              context: { source_card_id: sourceCardId, new_preset: newPreset },
              error: cardErr,
            });
            return Response.json({ error: cardErr?.message || "clone failed" }, { status: 500 });
          }

          // Create the master generation row pointing at the shared FTP file.
          const { data: gen, error: genErr } = await supa
            .from("generations")
            .insert({
              user_id: user.id,
              model: "clone",
              quality: "low",
              tokens_input_text: 0,
              tokens_input_image: 0,
              tokens_output: 0,
              total_tokens: 0,
              cost_usd: 0,
              cost_credits: 0,
              card_id: card.id,
              is_master: true,
              public_id: randomUUID(),
              image_url: master.image_url,
              ftp_path: master.ftp_path,
              filename: master.filename,
              width: master.width,
              height: master.height,
              upload_status: master.upload_status ?? "success",
              meta: {
                kind: "card_clone_master",
                cloned_from_card_id: sourceCardId,
              },
            })
            .select("id")
            .single();
          if (genErr) {
            void logSystem({
              level: "error",
              category: "history",
              message: "clone-card: master row insert failed",
              user_id: user.id,
              context: { source_card_id: sourceCardId, new_card_id: card.id },
              error: genErr,
            });
            // Best-effort rollback of the empty card so we don't leave a
            // ghost row with no master.
            await supa.from("generation_cards").delete().eq("id", card.id);
            return Response.json(
              { error: genErr?.message || "master clone failed" },
              { status: 500 },
            );
          }

          void logAudit({
            user_id: user.id,
            action: "card.cloned_to_new_preset",
            resource_type: "card",
            resource_id: card.id,
            details: {
              source_card_id: sourceCardId,
              new_preset: newPreset,
              new_master_generation_id: gen?.id ?? null,
            },
          });

          // Bump activity so the new card shows at the top of /history.
          try {
            await supa.rpc("touch_card_activity", { p_card_id: card.id });
          } catch (e) {
            void logSystem({
              level: "warn",
              category: "history",
              message: "clone-card: touch_card_activity failed",
              user_id: user.id,
              context: { card_id: card.id },
              error: e,
            });
          }

          return Response.json({
            card_id: card.id,
            name: cloneName,
            preset_id: newPreset,
            master_generation_id: gen?.id ?? null,
          });
        } catch (err) {
          return authErrorResponse(err);
        }
      }
