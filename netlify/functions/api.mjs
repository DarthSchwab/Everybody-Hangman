// Everybody Hangman — API (Netlify Function + Netlify Blobs)
// Le prof crée une "salle" ; chaque élève réserve SA case depuis son téléphone
// et reçoit un jeton secret : sans ce jeton, impossible d'écrire dans une case.
// Les mots ne sont renvoyés qu'au prof (clé admin).
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

export const config = { path: "/api/:action" };

const MAX_STUDENTS = 16;
const MAX_WORD = 30;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans I, L, O, 0, 1

const store = () => getStore({ name: "hangman", consistency: "strong" });
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const err = (msg, status = 400) => json({ error: msg }, status);
const secret = () => randomBytes(16).toString("hex");
const cleanCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
const cleanName = (n) => String(n || "").trim().slice(0, 40);

function cleanWord(w) {
  const s = String(w || "").trim().replace(/\s+/g, " ");
  if (!s) return { ok: true, word: "" };
  if (s.length > MAX_WORD) return { ok: false, msg: `${MAX_WORD} caractères maximum.` };
  if (!/^[\p{L}][\p{L} '’-]*$/u.test(s)) return { ok: false, msg: "Uniquement des lettres (espaces, tirets et apostrophes acceptés)." };
  return { ok: true, word: s };
}

const kMeta = (c) => `rooms/${c}/meta`;
const kClaim = (c, i) => `rooms/${c}/claim/${i}`;
const kWord = (c, r, i) => `rooms/${c}/r${r}/word/${i}`;

async function loadMeta(s, code) {
  return code ? await s.get(kMeta(code), { type: "json" }) : null;
}
async function loadClaims(s, code, n) {
  return Promise.all(Array.from({ length: n }, (_, i) => s.get(kClaim(code, i), { type: "json" })));
}
async function loadWords(s, code, round, n) {
  return Promise.all(Array.from({ length: n }, (_, i) => s.get(kWord(code, round, i), { type: "json" })));
}
function isAdmin(meta, key) {
  return meta && key && meta.adminKey === key;
}

export default async (req, context) => {
  const action = context.params.action;
  const s = store();
  const url = new URL(req.url);
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return err("JSON invalide"); }
  }
  const code = cleanCode(body.code || url.searchParams.get("code"));

  try {
    switch (action) {
      // ---------- PROF ----------
      case "create": {
        const names = (body.names || []).map(cleanName).slice(0, MAX_STUDENTS);
        if (!names.some(Boolean)) return err("Aucun prénom.");
        for (let tries = 0; tries < 10; tries++) {
          const bytes = randomBytes(4);
          const c = Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
          const meta = { adminKey: secret(), names, round: 1, locked: false, created: Date.now() };
          const res = await s.setJSON(kMeta(c), meta, { onlyIfNew: true });
          if (res.modified) { return json({ code: c, adminKey: meta.adminKey }); }
        }
        return err("Impossible de créer la salle, réessaie.", 500);
      }

      case "admin": {
        const meta = await loadMeta(s, code);
        if (!isAdmin(meta, url.searchParams.get("key"))) return err("Accès refusé", 403);
        const n = meta.names.length;
        const [claims, words] = await Promise.all([loadClaims(s, code, n), loadWords(s, code, meta.round, n)]);
        return json({
          names: meta.names, round: meta.round, locked: meta.locked,
          claimed: claims.map(Boolean),
          words: words.map((w) => (w && w.word) || ""),
        });
      }

      case "setnames": {
        const meta = await loadMeta(s, code);
        if (!isAdmin(meta, body.key)) return err("Accès refusé", 403);
        const names = (body.names || []).map(cleanName).slice(0, MAX_STUDENTS);
        // Si un prénom change à une position, on libère cette case.
        const n = Math.max(names.length, meta.names.length);
        for (let i = 0; i < n; i++) {
          if ((names[i] || "") !== (meta.names[i] || "")) {
            await s.delete(kClaim(code, i));
            await s.delete(kWord(code, meta.round, i));
          }
        }
        meta.names = names;
        await s.setJSON(kMeta(code), meta);
        return json({ ok: true });
      }

      case "setword": { // le prof saisit lui-même le mot d'un élève sans téléphone
        const meta = await loadMeta(s, code);
        if (!isAdmin(meta, body.key)) return err("Accès refusé", 403);
        const i = Number(body.index);
        if (!(i >= 0 && i < meta.names.length)) return err("Case inconnue");
        const cw = cleanWord(body.word);
        if (!cw.ok) return err(cw.msg);
        if (cw.word) await s.setJSON(kWord(code, meta.round, i), { word: cw.word, by: "prof" });
        else await s.delete(kWord(code, meta.round, i));
        return json({ ok: true });
      }

      case "release": {
        const meta = await loadMeta(s, code);
        if (!isAdmin(meta, body.key)) return err("Accès refusé", 403);
        const i = Number(body.index);
        await s.delete(kClaim(code, i));
        await s.delete(kWord(code, meta.round, i));
        return json({ ok: true });
      }

      case "lock": {
        const meta = await loadMeta(s, code);
        if (!isAdmin(meta, body.key)) return err("Accès refusé", 403);
        meta.locked = !!body.locked;
        await s.setJSON(kMeta(code), meta);
        return json({ ok: true });
      }

      case "newround": {
        const meta = await loadMeta(s, code);
        if (!isAdmin(meta, body.key)) return err("Accès refusé", 403);
        meta.round += 1;
        meta.locked = false;
        await s.setJSON(kMeta(code), meta);
        return json({ ok: true, round: meta.round });
      }

      // ---------- ÉLÈVE ----------
      case "room": { // infos publiques : prénoms + cases prises. Jamais les mots.
        const meta = await loadMeta(s, code);
        if (!meta) return err("Salle introuvable. Vérifie le code.", 404);
        const n = meta.names.length;
        const claims = await loadClaims(s, code, n);
        const out = { names: meta.names, claimed: claims.map(Boolean), round: meta.round, locked: meta.locked };
        const i = Number(url.searchParams.get("index"));
        const token = url.searchParams.get("token");
        if (token && i >= 0 && i < n) {
          out.mine = !!(claims[i] && claims[i].token === token);
          if (out.mine) {
            const w = await s.get(kWord(code, meta.round, i), { type: "json" });
            out.myWord = (w && w.word) || "";
          }
        }
        return json(out);
      }

      case "claim": {
        const meta = await loadMeta(s, code);
        if (!meta) return err("Salle introuvable.", 404);
        const i = Number(body.index);
        if (!(i >= 0 && i < meta.names.length) || !meta.names[i]) return err("Case inconnue");
        const token = secret();
        const res = await s.setJSON(kClaim(code, i), { token, at: Date.now() }, { onlyIfNew: true });
        // On relit la case pour vérifier qu'elle est bien à nous (ne dépend pas
        // uniquement de la réponse de l'écriture conditionnelle).
        const cur = await s.get(kClaim(code, i), { type: "json" });
        const ok = (cur && cur.token === token) || (!cur && res && res.modified === true);
        if (!ok) return err("Ce prénom est déjà pris. Si c'est bien toi, demande au prof de libérer ta case.", 409);
        return json({ token });
      }

      case "word": {
        const meta = await loadMeta(s, code);
        if (!meta) return err("Salle introuvable.", 404);
        if (meta.locked) return err("La partie a commencé : les mots sont verrouillés.", 423);
        const i = Number(body.index);
        const claim = await s.get(kClaim(code, i), { type: "json" });
        if (!claim || claim.token !== body.token) return err("Ce n'est pas ta case.", 403);
        const cw = cleanWord(body.word);
        if (!cw.ok) return err(cw.msg);
        if (!cw.word) return err("Écris un mot.");
        await s.setJSON(kWord(code, meta.round, i), { word: cw.word, by: "eleve" });
        return json({ ok: true });
      }

      default:
        return err("Action inconnue", 404);
    }
  } catch (e) {
    console.error(e);
    return err("Erreur serveur", 500);
  }
};
