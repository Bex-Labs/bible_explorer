/**
 * Bible Explorer: e-copy signup form handling
 * Inserts a row into the `subscribers` table in Supabase.
 * See /supabase/schema.sql for the table + RLS policy that allows
 * this public, write-only insert.
 */
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("signup-form");
  if (!form) return;

  const messageEl = document.getElementById("signup-message");
  const submitBtn = form.querySelector('button[type="submit"]');

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = "form-message " + type;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    messageEl.className = "form-message";
    messageEl.textContent = "";

    const name = form.elements["name"].value.trim();
    const email = form.elements["email"].value.trim();
    const country = form.elements["country"].value;
    const ageGroup = form.elements["age_group"] ? form.elements["age_group"].value : null;

    if (!name || !email) {
      showMessage("Please fill in your name and email.", "error");
      return;
    }

    if (!window.bibleExplorerSupabaseReady) {
      showMessage(
        "Signups aren't connected yet. The site owner still needs to add Supabase credentials in js/config.js.",
        "error"
      );
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing up…";

    const { error } = await window.bibleExplorerSupabase.from("subscribers").insert({
      name,
      email,
      country: country || null,
      age_group: ageGroup || null,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Get My Free E-Copy";

    if (error) {
      if (error.code === "23505") {
        showMessage("Looks like that email is already signed up. Thank you!", "success");
      } else {
        console.error(error);
        showMessage("Something went wrong. Please try again in a moment.", "error");
      }
      return;
    }

    form.reset();
    showMessage(
      "You're in! Check your inbox soon for your first e-copy of Bible Explorer.",
      "success"
    );
  });
});
