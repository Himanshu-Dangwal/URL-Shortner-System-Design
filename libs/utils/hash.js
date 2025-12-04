const { customAlphabet } = require("nanoid");
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const nanoid = customAlphabet(alphabet, 8);

function generateCode() {
  return nanoid();
}

module.exports = { generateCode };
