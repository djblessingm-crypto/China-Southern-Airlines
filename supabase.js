// China Southern Airlines Virtual
// Supabase connection

const SUPABASE_URL = "https://twtabmerzpyuyxgttnes.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "PASTE_YOUR_PUBLISHABLE_KEY_HERE";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

// Make the client available to your website scripts
window.supabaseClient = supabaseClient;

console.log("China Southern Airlines: Supabase connection initialized.");
