const dateTarget = document.querySelector("#current-date");

if (dateTarget) {
  const now = new Date();
  dateTarget.dateTime = now.toISOString();
  dateTarget.textContent = new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);
}
