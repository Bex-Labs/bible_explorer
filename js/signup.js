/**
 * Bible Explorer: e-copy signup form handling
 * Inserts a row into the `subscribers` table in Supabase, including
 * which volume the person requested. If that volume has a download
 * link set (via admin.html), it's shown immediately here - no email
 * required. See /supabase/schema.sql for the table + RLS policy.
 */
document.addEventListener("DOMContentLoaded", async function () {
  const form = document.getElementById("signup-form");
  if (!form) return;

  const messageEl = document.getElementById("signup-message");
  const submitBtn = form.querySelector('button[type="submit"]');
  const volumeSelect = document.getElementById("volume_select");

  const downloadPanel = document.getElementById("signup-download-panel");
  const downloadTitle = document.getElementById("signup-download-title");
  const downloadText = document.getElementById("signup-download-text");
  const downloadLink = document.getElementById("signup-download-link");
  const requestAnotherBtn = document.getElementById("signup-request-another");

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = "form-message " + type;
  }

  // =========================================================
  // Populate the volume dropdown, most recent volume first
  // =========================================================
  let volumes = [];

  if (volumeSelect) {
    try {
      volumes = (await window.bibleExplorerLoadVolumes()).slice().reverse();
    } catch (e) {
      console.error(e);
      volumes = [];
    }

    if (!volumes.length) {
      volumeSelect.innerHTML = '<option value="">No volumes available yet</option>';
    } else {
      volumeSelect.innerHTML = "";
      volumes.forEach(function (v, i) {
        const opt = document.createElement("option");
        opt.value = v.volume;
        opt.textContent = "Volume " + v.volume + " (" + v.days + ")";
        if (i === 0) opt.selected = true;
        volumeSelect.appendChild(opt);
      });
    }
  }

  function findVolume(volumeNumber) {
    return volumes.find(function (v) {
      return v.volume === volumeNumber;
    });
  }

  if (requestAnotherBtn) {
    requestAnotherBtn.addEventListener("click", function () {
      downloadPanel.style.display = "none";
      form.style.display = "block";
      form.reset();
      showMessage("", "");
    });
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    messageEl.className = "form-message";
    messageEl.textContent = "";

    const name = form.elements["name"].value.trim();
    const email = form.elements["email"].value.trim();
    const country = form.elements["country"].value;
    const ageGroup = form.elements["age_group"] ? form.elements["age_group"].value : null;
    const volumeNumber = volumeSelect ? parseInt(volumeSelect.value, 10) : null;

    if (!name || !email) {
      showMessage("Please fill in your name and email.", "error");
      return;
    }

    if (volumeSelect && !volumeNumber) {
      showMessage("Please choose a volume.", "error");
      return;
    }

    if (!window.bibleExplorerSupabaseReady) {
      showMessage(
        "Signups aren't connected yet. The site owner still needs to add Supabase credentials in js/config.js.",
        "error"
      );
      return;
    }

    const matchedVolume = volumeNumber ? findVolume(volumeNumber) : null;

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing up…";

    const { error } = await window.bibleExplorerSupabase.from("subscribers").insert({
      name,
      email,
      country: country || null,
      age_group: ageGroup || null,
      requested_volume_number: volumeNumber || null,
      requested_volume_label: matchedVolume ? matchedVolume.days : null,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Get My Free E-Copy";

    if (error) {
      console.error(error);
      showMessage("Something went wrong. Please try again in a moment.", "error");
      return;
    }

    form.style.display = "none";
    downloadPanel.style.display = "block";

    if (matchedVolume && matchedVolume.downloadUrl) {
      downloadTitle.textContent = "You're All Set!";
      downloadText.textContent = "Here's your instant download for Volume " + matchedVolume.volume + ".";
      downloadLink.href = matchedVolume.downloadUrl;
      downloadLink.textContent = "Download Volume " + matchedVolume.volume + " Now";
      downloadLink.style.display = "inline-flex";
    } else {
      downloadTitle.textContent = "Thanks for Signing Up!";
      downloadText.textContent =
        "We've saved your request for Volume " +
        volumeNumber +
        ". It's not available for instant download yet, but we'll have it ready soon.";
      downloadLink.style.display = "none";
    }
  });
});
