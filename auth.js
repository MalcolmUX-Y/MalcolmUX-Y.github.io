// ============================================================
// auth.js — Supabase login
// ============================================================

const SUPABASE_URL = "DIN_SUPABASE_URL";
const SUPABASE_ANON_KEY = "DIN_ANON_KEY";

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
