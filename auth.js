// ============================================================
// auth.js — Supabase login
// ============================================================

const SUPABASE_URL = "https://flecimbpfuzlflyvgjrk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsZWNpbWJwZnV6bGZseXZnanJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4Mjg4MTksImV4cCI6MjA4ODQwNDgxOX0.Wcifm_Wjjm1olJefkzOhP2_ZBuDVkqMIB2gGIGpYpZQ";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function requireAuth() {
  const { data: { session } } = await _supabase.auth.getSession();

  if (!session) {
    renderLoginScreen();
    return null;
  }

  return session.user;
}

function renderLoginScreen() {
  document.getElementById("app").innerHTML = `
    <div class="screen-card" style="max-width:400px;margin-top:40px;">
      <p class="screen-label">Adgang</p>
      <h2>Log ind</h2>
      <p class="screen-text">Log ind med din Google-konto for at fortsætte.</p>
      <div class="actions">
        <button class="btn btn-primary" onclick="signInWithGoogle()">
          Fortsæt med Google
        </button>
      </div>
    </div>
  `;
}

async function signInWithGoogle() {
  await _supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href }
  });
}

async function signOut() {
  await _supabase.auth.signOut();
  window.location.reload();
}
