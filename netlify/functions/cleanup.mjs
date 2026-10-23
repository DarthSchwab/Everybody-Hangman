// Nettoyage automatique toutes les heures : efface les salles de plus de 12 h.
import { getStore } from "@netlify/blobs";
import { cleanupOldRooms } from "../lib/rooms.mjs";

export const config = { schedule: "@hourly" };

export default async () => {
  await cleanupOldRooms(getStore({ name: "hangman", consistency: "strong" }));
};
