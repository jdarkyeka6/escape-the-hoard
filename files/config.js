/* =========================================================================
   Deployment config. Edit this one file — nothing else needs touching.

   The anon key is the PUBLISHABLE one from Supabase (Project Settings -> API
   -> anon / public). It is designed to sit in a file the browser downloads;
   Row Level Security is what actually protects your data, not key secrecy.

   The service_role key is the opposite: it bypasses RLS entirely. It must
   never appear in anything you deploy to Vercel. If you ever paste one in
   here by mistake, rotate it in the dashboard immediately — assume anything
   that reached a public site is public forever.

   Realtime broadcast needs no tables and no schema, so any project will do.
   ========================================================================= */
window.HORDE_CONFIG = {
  supabaseUrl:     'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-KEY',
};
