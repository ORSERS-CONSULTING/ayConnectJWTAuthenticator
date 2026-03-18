function normalizeUaeMobile(input) {
  let value = String(input || "").trim().replace(/\s+/g, "");

  // remove +
  if (value.startsWith("+")) {
    value = value.slice(1);
  }

  // 058xxxxxxx → 97158xxxxxxx
  if (value.startsWith("05")) {
    value = "971" + value.slice(1);
  }

  // 5xxxxxxxx → 9715xxxxxxxx
  else if (value.startsWith("5") && value.length === 9) {
    value = "971" + value;
  }

  // already 971 → OK
  else if (value.startsWith("971")) {
    // do nothing
  }

  else {
    throw new Error("Invalid UAE mobile number");
  }

  return value;
}

module.exports = { normalizeUaeMobile };