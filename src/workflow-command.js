export function addMask(value) {
  if (value) {
    console.log(`::add-mask::${escapeData(value)}`);
  }
}

export function setFailed(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error::${escapeData(message)}`);
  process.exitCode = 1;
}

function escapeData(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}
