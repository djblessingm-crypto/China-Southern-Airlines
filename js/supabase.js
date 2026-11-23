// China Southern Airlines Virtual
// Supabase browser connection

(function () {
    "use strict";

    const SUPABASE_URL =
        "https://twtabmerzpyuyxgttnes.supabase.co";

    const SUPABASE_PUBLISHABLE_KEY =
        "PASTE_YOUR_PUBLISHABLE_KEY_HERE";

    const client = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );

    window.supabaseClient = client;

    window.csn = {
        client: client,
        ready: true,

        async getUser() {
            const { data, error } = await client.auth.getUser();

            if (error) throw error;

            return data.user;
        }
    };

    console.log("CSN Virtual Supabase initialized.");
})();
