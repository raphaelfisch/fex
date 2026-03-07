// ============================================================
// FEX – Supabase Integration
// Dieses Script in jedes FEX-Spiel einbinden (vor dem </body>)
// URL und Key aus Supabase: Settings → API
// ============================================================

const SUPABASE_URL = 'DEINE_SUPABASE_URL';   // z.B. https://xxxx.supabase.co
const SUPABASE_KEY = 'DEIN_ANON_KEY';         // anon public key

// Supabase-Client (ohne npm, direkt per CDN)
// Im Spiel-HTML einbinden:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// AUTH – Einloggen / Ausloggen
// ============================================================

async function fexLogin(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

async function fexLogout() {
  await db.auth.signOut();
}

async function fexCurrentUser() {
  const { data } = await db.auth.getUser();
  return data?.user ?? null;
}

// ============================================================
// SESSION LIMIT – Max. 3 Spielen-Sessions pro Tag prüfen
// ============================================================

async function fexCanPlay() {
  const user = await fexCurrentUser();
  if (!user) return false;

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const { count } = await db
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('mode', 'spielen')
    .gte('played_at', today + 'T00:00:00')
    .lte('played_at', today + 'T23:59:59');

  return count < 3;
}

// ============================================================
// SESSION SPEICHERN – Nach jeder Spielrunde aufrufen
// ============================================================

async function fexSaveSession({ gameId, mode, levelReached, correctCount, durationSeconds }) {
  const user = await fexCurrentUser();
  if (!user) return null;

  const { data, error } = await db
    .from('sessions')
    .insert({
      user_id: user.id,
      game_id: gameId,
      mode: mode,                       // 'spielen' oder 'ueben'
      level_reached: levelReached,
      correct_count: correctCount,
      duration_seconds: durationSeconds,
    })
    .select()
    .single();

  if (error) {
    console.error('FEX: Session konnte nicht gespeichert werden', error);
    return null;
  }

  return data; // gibt session.id zurück – brauchst du für Reflexion
}

// ============================================================
// REFLEXION SPEICHERN – Nach der Reflexionsfrage aufrufen
// ============================================================

async function fexSaveReflection({ sessionId, question, answer }) {
  const user = await fexCurrentUser();
  if (!user) return null;

  const { error } = await db
    .from('reflections')
    .insert({
      session_id: sessionId,
      user_id: user.id,
      question: question,
      answer: answer,
    });

  if (error) {
    console.error('FEX: Reflexion konnte nicht gespeichert werden', error);
  }
}

// ============================================================
// LETZTES LEVEL ABRUFEN – Für DDA-Startlevel
// ============================================================

async function fexGetLastLevel(gameId) {
  const user = await fexCurrentUser();
  if (!user) return 1; // Fallback: Level 1

  const { data } = await db
    .from('sessions')
    .select('level_reached')
    .eq('user_id', user.id)
    .eq('game_id', gameId)
    .eq('mode', 'spielen')
    .order('played_at', { ascending: false })
    .limit(1)
    .single();

  return data?.level_reached ?? 1;
}

// ============================================================
// HEUTIGER SESSION-ZÄHLER – Für Anzeige im UI
// ============================================================

async function fexTodaySessionCount() {
  const user = await fexCurrentUser();
  if (!user) return 0;

  const today = new Date().toISOString().split('T')[0];

  const { count } = await db
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('mode', 'spielen')
    .gte('played_at', today + 'T00:00:00');

  return count ?? 0;
}

// ============================================================
// VERWENDUNG IN EINEM SPIEL – Beispiel
// ============================================================
//
// 1. Spiel startet → Startlevel laden:
//    const startLevel = await fexGetLastLevel('farbflip');
//
// 2. Spielrunde endet → Session speichern:
//    const session = await fexSaveSession({
//      gameId: 'farbflip',
//      mode: 'spielen',
//      levelReached: currentLevel,
//      correctCount: correctCount,
//      durationSeconds: 90
//    });
//
// 3. Reflexion abgeschickt → Reflexion speichern:
//    await fexSaveReflection({
//      sessionId: session.id,
//      question: 'Wann fällt dir das Umschalten schwer?',
//      answer: reflexText
//    });
//
// 4. Session-Limit prüfen bevor Spiel startet:
//    const canPlay = await fexCanPlay();
//    if (!canPlay) {
//      showMessage('Du hast heute schon 3 Sessions gespielt – morgen wieder!');
//    }
// ============================================================
