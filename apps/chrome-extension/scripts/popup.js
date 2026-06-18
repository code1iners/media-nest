// Elements.
const inputEnabled = document.querySelector("#input-enabled");
const version = document.querySelector("#version");

// Event listeners.
inputEnabled.addEventListener("change", onChangeEnabled);

document.addEventListener("DOMContentLoaded", () => {
  console.log("popup script loaded");
  init();
});

/**
 * @param {Event} e
 */
function onChangeEnabled(e) {
  if (e.target.checked) enabled();
  else disabled();
}

function enabled() {
  chrome.tabs.getCurrent((tab) => {
    console.log(tab);
    alert(tab.title);
  });
}

function disabled() {
  console.log("disabled");
}

/** Init app. */
function init() {
  setVersion();
}

/** Set app version. */
function setVersion() {
  if (!version) return;
  const __version__ = Math.random() * 10;
  version.textContent = Math.floor(__version__ * 100) / 100;
}
