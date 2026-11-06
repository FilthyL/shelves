// Which club backend this visit uses, and the one place the rest of the site asks for it.
//   Supabase  when data/club.json has a project url and anon key (the real thing, for everyone)
//   local     when the address has ?club=local (remembered on this device): accounts that live in this
//             browser only, for trying the club before a server is set up
//   off       otherwise, and then none of the club's buttons or pages exist
import { createLocalBackend } from './backend-local.js';

const FLAG = 'fm-club-dev';
let backend = null;

export async function initClub(base = 'data/') {
  const cfg = await fetch(`${base}club.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  const sb = cfg.supabase || {};
  const asked = new URLSearchParams(location.search).get('club');
  try {
    if (asked === 'local') localStorage.setItem(FLAG, '1');
    if (asked === 'off') localStorage.removeItem(FLAG);
  } catch { /* storage blocked */ }
  let dev = false;
  try { dev = localStorage.getItem(FLAG) === '1'; } catch { /* storage blocked */ }
  if (sb.url && sb.anonKey) {
    const { createSupabaseBackend } = await import('./backend-supabase.js');
    backend = createSupabaseBackend(sb);
  } else if (dev) {
    backend = createLocalBackend();
  }
  if (backend) await backend.ready().catch(() => {});
  return backend;
}

export const club = () => backend;
