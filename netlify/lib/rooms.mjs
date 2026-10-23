// Outils partagés : suppression des salles.
const kMeta = (c) => `rooms/${c}/meta`;
const ROOM_TTL = 12 * 3600 * 1000; // une salle oubliée est effacée au bout de 12 h

// Efface TOUT ce qui concerne une salle (prénoms, réservations, mots).
export async function deleteRoom(s, code) {
  const { blobs } = await s.list({ prefix: `rooms/${code}/` });
  await Promise.all(blobs.map((b) => s.delete(b.key)));
}
// Efface les salles plus vieilles que ROOM_TTL (filet de sécurité si la page
// du prof a été fermée brutalement : coupure, plantage…).
export async function cleanupOldRooms(s) {
  const { directories } = await s.list({ prefix: "rooms/", directories: true });
  for (const dir of directories) {
    const code = dir.split("/")[1];
    const meta = await s.get(kMeta(code), { type: "json" });
    if (!meta || Date.now() - (meta.created || 0) > ROOM_TTL) await deleteRoom(s, code);
  }
}
