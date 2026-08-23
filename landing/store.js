/*
 * Storefront account layer. Wraps supabase-js (loaded as UMD via CDN — see
 * the <script> tags on pages that use this) with the few calls the store
 * needs: session lookup, email magic-link sign-in, sign-out.
 *
 * The Supabase URL + anon key are the same public client values the app
 * ships with (src/pro/config.ts) — safe in the page, protected by RLS.
 */
(function () {
  var SUPABASE_URL = 'https://dthbxiyxbhypsoyfrrgi.supabase.co';
  var SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0aGJ4aXl4Ymh5cHNveWZycmdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNjA4NjQsImV4cCI6MjEwMjgzNjg2NH0.R5RNDy575b2hIe0-YAlY7yOAo5gvsFVqYXh-8uHItEw';

  var client = null;

  function sb() {
    if (!client && window.supabase) {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    }
    return client;
  }

  window.VTuneStore = {
    /** Resolves to the signed-in user ({ id, email }) or null. */
    getUser: function () {
      var c = sb();
      if (!c) return Promise.resolve(null);
      return c.auth.getSession().then(function (r) {
        var u = r.data.session ? r.data.session.user : null;
        return u ? { id: u.id, email: u.email } : null;
      });
    },

    /** Sends a magic link that lands on /auth-callback.html (same origin). */
    signInWithEmail: function (email) {
      var c = sb();
      if (!c) return Promise.resolve({ error: 'Sign-in is unavailable right now.' });
      return c.auth
        .signInWithOtp({
          email: email,
          options: { emailRedirectTo: location.origin + '/auth-callback.html' },
        })
        .then(function (r) {
          return { error: r.error ? r.error.message : null };
        });
    },

    signOut: function () {
      var c = sb();
      return c ? c.auth.signOut() : Promise.resolve();
    },
  };
})();
